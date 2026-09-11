//! Syncthing sidecar (ADR-005, WP-1.1b): lifecycle of the bundled `syncthing` binary, a small
//! REST client over its local API, and the handful of configuration operations AML needs
//! (add the NAS as a device, accept or offer a folder, read status). Syncthing keeps its own
//! config and database in the per-device app-data directory, never inside a Folio.

use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use rand::RngExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;

use crate::folio::{write_atomic, FolioError, Result};

/// Loopback port for the sidecar's REST API; not the stock 8384 so a user-installed
/// Syncthing on the same machine keeps working.
pub const GUI_PORT: u16 = 41384;
const API_KEY_FILE: &str = "aml-apikey";
const SETTINGS_FILE: &str = "sync-settings.json";
pub const STIGNORE: &str = "# AML — files never synced (ADR-005)\n.DS_Store\nThumbs.db\ndesktop.ini\n.aml-tmp-*\n*.tmp\n~$*\n";

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncSettings {
    /// Start the sidecar when AML starts.
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncDevice {
    pub id: String,
    pub name: String,
    pub connected: bool,
    pub address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncFolder {
    pub id: String,
    pub label: String,
    pub path: String,
    /// "idle" | "scanning" | "syncing" | "error" | "unknown" …
    pub state: String,
    /// 0–100 for this device's copy of the folder.
    pub completion: f64,
    #[specta(type = specta_typescript::Number)]
    pub need_bytes: u64,
    pub devices: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PendingFolder {
    pub id: String,
    pub label: String,
    pub offered_by: String,
    pub offered_by_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub enabled: bool,
    pub running: bool,
    /// The sidecar is booting: `start` can take seconds, and "not running yet" and "failed"
    /// must not look the same in the status bar.
    pub starting: bool,
    pub my_id: Option<String>,
    pub version: Option<String>,
    pub devices: Vec<SyncDevice>,
    pub folders: Vec<SyncFolder>,
    pub pending: Vec<PendingFolder>,
    pub gui_url: String,
    pub error: Option<String>,
}

pub struct Syncthing {
    home: PathBuf,
    api_key: String,
    child: Option<Child>,
    agent: ureq::Agent,
}

fn io(e: impl std::fmt::Display) -> FolioError {
    FolioError::Io(e.to_string())
}

impl Syncthing {
    /// `app_data` is Tauri's per-app data directory; the sidecar lives in `<app_data>/syncthing`.
    pub fn new(app_data: &Path) -> Result<Self> {
        let home = app_data.join("syncthing");
        fs::create_dir_all(&home)?;
        let key_path = home.join(API_KEY_FILE);
        let api_key = match fs::read_to_string(&key_path) {
            Ok(k) if k.trim().len() >= 32 => k.trim().to_string(),
            _ => {
                let k = random_key();
                write_atomic(&key_path, k.as_bytes())?;
                k
            }
        };
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(5)))
            .build()
            .into();
        Ok(Self {
            home,
            api_key,
            child: None,
            agent,
        })
    }

    pub fn settings(&self) -> SyncSettings {
        fs::read_to_string(self.home.join(SETTINGS_FILE))
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default()
    }

    pub fn save_settings(&self, s: &SyncSettings) -> Result<()> {
        let text = serde_json::to_string_pretty(s).map_err(io)?;
        write_atomic(&self.home.join(SETTINGS_FILE), text.as_bytes())
    }

    pub fn gui_url(&self) -> String {
        format!("http://127.0.0.1:{GUI_PORT}/")
    }

    /// The bundled binary sits next to the AML executable (Tauri `externalBin`);
    /// `AML_SYNCTHING_BIN` overrides it for tests and development.
    pub fn binary_path() -> Result<PathBuf> {
        if let Some(p) = std::env::var_os("AML_SYNCTHING_BIN") {
            let p = PathBuf::from(p);
            if p.exists() {
                return Ok(p);
            }
        }
        let exe = std::env::current_exe().map_err(io)?;
        let dir = exe
            .parent()
            .ok_or_else(|| FolioError::Io("executable has no parent".into()))?;
        let name = if cfg!(windows) {
            "syncthing.exe"
        } else {
            "syncthing"
        };
        let path = dir.join(name);
        if path.exists() {
            return Ok(path);
        }
        Err(FolioError::NotFound(format!(
            "Syncthing sidecar missing at {} (run `pnpm sidecar:fetch`)",
            path.display()
        )))
    }

    pub fn is_running(&mut self) -> bool {
        if let Some(child) = &mut self.child {
            match child.try_wait() {
                Ok(None) => return true,
                _ => self.child = None,
            }
        }
        // Someone else (a previous AML that was not stopped) may still be serving our port.
        self.ping().is_ok()
    }

    /// Starts the sidecar if needed and waits until its API answers.
    pub fn start(&mut self) -> Result<()> {
        if self.is_running() {
            return Ok(());
        }
        let bin = Self::binary_path()?;
        let log = fs::File::create(self.home.join("syncthing.log"))?;
        let mut cmd = Command::new(&bin);
        cmd.arg("serve")
            .arg("--home")
            .arg(&self.home)
            .arg(format!("--gui-address=127.0.0.1:{GUI_PORT}"))
            .arg(format!("--gui-apikey={}", self.api_key))
            .arg("--no-browser")
            .arg("--no-restart")
            .arg("--no-upgrade")
            .arg("--log-level=INFO")
            .env("STNOUPGRADE", "1")
            .stdin(Stdio::null())
            .stdout(Stdio::from(log.try_clone()?))
            .stderr(Stdio::from(log));
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        let child = cmd.spawn().map_err(|e| {
            FolioError::Io(format!(
                "could not start Syncthing ({}): {e}",
                bin.display()
            ))
        })?;
        self.child = Some(child);
        let deadline = Instant::now() + Duration::from_secs(20);
        while Instant::now() < deadline {
            if self.ping().is_ok() {
                self.apply_defaults()?;
                return Ok(());
            }
            if let Some(c) = &mut self.child {
                if let Ok(Some(status)) = c.try_wait() {
                    self.child = None;
                    return Err(FolioError::Io(format!(
                        "Syncthing exited during start-up ({status}); see {}",
                        self.home.join("syncthing.log").display()
                    )));
                }
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        Err(FolioError::Io(
            "Syncthing did not answer within 20 s".into(),
        ))
    }

    /// Asks Syncthing to shut down, then kills it if it lingers.
    pub fn stop(&mut self) {
        let _ = self.post("/rest/system/shutdown");
        if let Some(mut child) = self.child.take() {
            let deadline = Instant::now() + Duration::from_secs(5);
            while Instant::now() < deadline {
                if matches!(child.try_wait(), Ok(Some(_))) {
                    return;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    // ---- REST -------------------------------------------------------------------------

    fn url(&self, path: &str) -> String {
        format!("http://127.0.0.1:{GUI_PORT}{path}")
    }

    fn get(&self, path: &str) -> Result<Value> {
        self.agent
            .get(self.url(path))
            .header("X-API-Key", &self.api_key)
            .call()
            .map_err(io)?
            .body_mut()
            .read_json::<Value>()
            .map_err(io)
    }

    fn send(&self, method: &str, path: &str, body: Option<&Value>) -> Result<()> {
        let req = match method {
            "PUT" => self.agent.put(self.url(path)),
            "PATCH" => self.agent.patch(self.url(path)),
            "DELETE" => {
                self.agent
                    .delete(self.url(path))
                    .header("X-API-Key", &self.api_key)
                    .call()
                    .map_err(io)?;
                return Ok(());
            }
            _ => self.agent.post(self.url(path)),
        }
        .header("X-API-Key", &self.api_key);
        match body {
            Some(b) => req.send_json(b).map_err(io)?,
            None => req.send_empty().map_err(io)?,
        };
        Ok(())
    }

    fn post(&self, path: &str) -> Result<()> {
        self.send("POST", path, None)
    }

    fn ping(&self) -> Result<()> {
        self.get("/rest/system/ping").map(|_| ())
    }

    /// Home-network defaults: no relays, no global discovery, no NAT traversal, no usage
    /// reporting prompt, no browser; drop Syncthing's stock "Default Folder".
    fn apply_defaults(&self) -> Result<()> {
        self.send(
            "PATCH",
            "/rest/config/options",
            Some(&json!({
                "relaysEnabled": false,
                "globalAnnounceEnabled": false,
                "localAnnounceEnabled": true,
                "natEnabled": false,
                "urAccepted": -1,
                "urSeen": 3,
                "startBrowser": false,
                "crashReportingEnabled": false,
                "autoUpgradeIntervalH": 0,
                "setLowPriority": true
            })),
        )?;
        if let Ok(folders) = self.get("/rest/config/folders") {
            for f in folders.as_array().into_iter().flatten() {
                if f["id"] == "default" && f["label"] == "Default Folder" {
                    let _ = self.send("DELETE", "/rest/config/folders/default", None);
                }
            }
        }
        Ok(())
    }

    pub fn add_device(&self, id: &str, name: &str, address: Option<&str>) -> Result<()> {
        let id = id.trim().to_uppercase();
        let mut addresses = vec!["dynamic".to_string()];
        if let Some(a) = address.map(str::trim).filter(|a| !a.is_empty()) {
            addresses.push(if a.contains("://") {
                a.to_string()
            } else if a.contains(':') {
                format!("tcp://{a}")
            } else {
                format!("tcp://{a}:22000")
            });
        }
        self.send(
            "PUT",
            &format!("/rest/config/devices/{id}"),
            Some(&json!({
                "deviceID": id,
                "name": name.trim(),
                "addresses": addresses,
                "compression": "metadata",
                "introducer": false,
                "autoAcceptFolders": false
            })),
        )
    }

    pub fn remove_device(&self, id: &str) -> Result<()> {
        self.send("DELETE", &format!("/rest/config/devices/{id}"), None)
    }

    /// Creates (or replaces) a folder shared with `devices` at `path` and writes `.stignore`.
    pub fn set_folder(&self, id: &str, label: &str, path: &Path, devices: &[String]) -> Result<()> {
        fs::create_dir_all(path)?;
        let ignore = path.join(".stignore");
        if !ignore.exists() {
            write_atomic(&ignore, STIGNORE.as_bytes())?;
        }
        let devs: Vec<Value> = devices
            .iter()
            .map(|d| json!({ "deviceID": d.to_uppercase() }))
            .collect();
        self.send(
            "PUT",
            &format!("/rest/config/folders/{id}"),
            Some(&json!({
                "id": id,
                "label": label,
                "path": path.to_string_lossy(),
                "type": "sendreceive",
                "devices": devs,
                "rescanIntervalS": 3600,
                "fsWatcherEnabled": true,
                "fsWatcherDelayS": 5,
                "ignorePerms": true,
                "versioning": { "type": "trashcan", "params": { "cleanoutDays": "30" } }
            })),
        )
    }

    pub fn status(&mut self, enabled: bool) -> SyncStatus {
        let mut st = SyncStatus {
            enabled,
            running: false,
            starting: false,
            my_id: None,
            version: None,
            devices: vec![],
            folders: vec![],
            pending: vec![],
            gui_url: self.gui_url(),
            error: None,
        };
        if !self.is_running() {
            return st;
        }
        st.running = true;
        match self.fill_status(&mut st) {
            Ok(()) => {}
            Err(e) => st.error = Some(e.to_string()),
        }
        st
    }

    fn fill_status(&self, st: &mut SyncStatus) -> Result<()> {
        let sys = self.get("/rest/system/status")?;
        let my_id = sys["myID"].as_str().unwrap_or_default().to_string();
        st.my_id = Some(my_id.clone());
        if let Ok(v) = self.get("/rest/system/version") {
            st.version = v["version"].as_str().map(String::from);
        }
        let conns = self.get("/rest/system/connections")?;
        let devices = self.get("/rest/config/devices")?;
        for d in devices.as_array().into_iter().flatten() {
            let id = d["deviceID"].as_str().unwrap_or_default().to_string();
            if id == my_id {
                continue;
            }
            let c = &conns["connections"][&id];
            st.devices.push(SyncDevice {
                name: d["name"].as_str().unwrap_or_default().to_string(),
                connected: c["connected"].as_bool().unwrap_or(false),
                address: c["address"].as_str().unwrap_or_default().to_string(),
                id,
            });
        }
        let folders = self.get("/rest/config/folders")?;
        for f in folders.as_array().into_iter().flatten() {
            let id = f["id"].as_str().unwrap_or_default().to_string();
            let db = self
                .get(&format!("/rest/db/status?folder={id}"))
                .unwrap_or(Value::Null);
            let comp = self
                .get(&format!("/rest/db/completion?folder={id}"))
                .unwrap_or(Value::Null);
            let devs = f["devices"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|d| d["deviceID"].as_str().map(String::from))
                .filter(|d| *d != my_id)
                .collect();
            st.folders.push(SyncFolder {
                id,
                label: f["label"].as_str().unwrap_or_default().to_string(),
                path: f["path"].as_str().unwrap_or_default().to_string(),
                state: db["state"].as_str().unwrap_or("unknown").to_string(),
                completion: comp["completion"].as_f64().unwrap_or(0.0),
                need_bytes: comp["needBytes"].as_u64().unwrap_or(0),
                devices: devs,
                error: db["error"]
                    .as_str()
                    .filter(|e| !e.is_empty())
                    .map(String::from),
            });
        }
        if let Ok(p) = self.get("/rest/cluster/pending/folders") {
            let names: std::collections::HashMap<String, String> = st
                .devices
                .iter()
                .map(|d| (d.id.clone(), d.name.clone()))
                .collect();
            for (id, entry) in p.as_object().into_iter().flatten() {
                for (dev, offer) in entry["offeredBy"].as_object().into_iter().flatten() {
                    st.pending.push(PendingFolder {
                        id: id.clone(),
                        label: offer["label"].as_str().unwrap_or(id).to_string(),
                        offered_by: dev.clone(),
                        offered_by_name: names.get(dev).cloned().unwrap_or_else(|| dev.clone()),
                    });
                }
            }
        }
        Ok(())
    }

    /// Last lines of the sidecar log, for the setup screen's "what went wrong" box.
    pub fn log_tail(&self, lines: usize) -> Vec<String> {
        let Ok(f) = fs::File::open(self.home.join("syncthing.log")) else {
            return vec![];
        };
        let all: Vec<String> = BufReader::new(f).lines().map_while(|l| l.ok()).collect();
        all.into_iter().rev().take(lines).rev().collect()
    }
}

impl Drop for Syncthing {
    fn drop(&mut self) {
        if self.child.is_some() {
            self.stop();
        }
    }
}

fn random_key() -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::rng();
    (0..40)
        .map(|_| CHARS[rng.random_range(0..CHARS.len())] as char)
        .collect()
}

/// Folder ID for a Folio shared from this side: lower-case, dashes, unique enough per name.
pub fn folder_id_for(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "folio".to_string()
    } else {
        slug
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Live check against the real binary: `AML_SYNCTHING_BIN=binaries/syncthing-<triple>
    /// cargo test sidecar_starts -- --ignored --nocapture`. Uses the same loopback port as the
    /// app, so stop AML first.
    #[test]
    #[ignore]
    fn sidecar_starts_answers_and_stops() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Syncthing::new(dir.path()).unwrap();
        s.start().expect("sidecar starts");
        let st = s.status(true);
        assert!(st.running, "status: {st:?}");
        let id = st.my_id.clone().expect("has a device id");
        assert_eq!(id.len(), 63, "device id {id}");
        assert!(
            st.folders.is_empty(),
            "default folder removed: {:?}",
            st.folders
        );
        let opts = s.get("/rest/config/options").unwrap();
        assert_eq!(opts["relaysEnabled"], false);
        assert_eq!(opts["globalAnnounceEnabled"], false);
        s.add_device(
            "MFZWI3D-BONSGYC-YLTMRWG-C43ENR5-QXGZDMM-FZWI3DP-BONSGYY-LTMRWAD",
            "Test NAS",
            Some("192.168.1.20"),
        )
        .unwrap();
        let st = s.status(true);
        assert_eq!(st.devices.len(), 1);
        assert_eq!(st.devices[0].name, "Test NAS");
        assert!(!st.devices[0].connected);
        let folder = dir.path().join("Folio");
        s.set_folder("folio", "Folio", &folder, &[st.devices[0].id.clone()])
            .unwrap();
        assert!(folder.join(".stignore").exists());
        let st = s.status(true);
        assert_eq!(st.folders.len(), 1);
        assert_eq!(st.folders[0].devices.len(), 1);
        s.stop();
        assert!(!s.is_running());
    }

    #[test]
    fn api_key_is_created_once_and_reused() {
        let dir = tempfile::tempdir().unwrap();
        let a = Syncthing::new(dir.path()).unwrap();
        let b = Syncthing::new(dir.path()).unwrap();
        assert_eq!(a.api_key, b.api_key);
        assert_eq!(a.api_key.len(), 40);
        assert!(!a.settings().enabled);
        a.save_settings(&SyncSettings { enabled: true }).unwrap();
        assert!(b.settings().enabled);
    }

    #[test]
    fn folder_ids_and_ignore_file() {
        assert_eq!(folder_id_for("My Writing"), "my-writing");
        assert_eq!(folder_id_for("***"), "folio");
        assert!(STIGNORE.contains(".DS_Store") && STIGNORE.contains(".aml-tmp-*"));
        assert!(
            !STIGNORE.contains(".aml\n"),
            "everything under .aml/ must sync"
        );
    }
}
