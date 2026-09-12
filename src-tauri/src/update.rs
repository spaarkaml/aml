//! What AML knows about its own updates (WP-8.2).
//!
//! The updater lives in Rust for the same reason the file system does (ADR-001): the webview
//! asks and is told, it never reaches the network itself. This module holds the types the UI
//! sees and the two judgements worth testing — what a plugin error actually means, and how
//! often a download may report progress. The commands are in `commands::update`.
//!
//! Update bundles are verified with AML's own minisign key, which is not an OS code-signing
//! certificate and costs nothing (ADR-012): a bundle not signed with the matching private key
//! is refused before it is unpacked, so the download itself does not have to be trusted.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_plugin_updater::Update;

/// Errors the update screen can show.
///
/// Kept apart from `FolioError`: nothing here is about a Folio, and "File error: dns error"
/// would be a lie about what went wrong.
#[derive(Debug, Clone, thiserror::Error, Serialize, Deserialize, Type)]
#[serde(tag = "kind", content = "detail", rename_all = "camelCase")]
pub enum UpdateError {
    /// A build that cannot update itself: `pnpm tauri dev`, or a bundle built before WP-8.2.
    #[error("this build cannot update itself")]
    NotConfigured,
    /// The endpoint could not be reached, or did not answer with a release.
    #[error("could not reach the update server: {0}")]
    Unreachable(String),
    /// The download finished but its signature did not match AML's public key.
    #[error("the download was not signed by AML: {0}")]
    NotTrusted(String),
    /// Downloaded and verified, but putting it in place failed.
    #[error("the update could not be installed: {0}")]
    Install(String),
    /// `update_install` with nothing found by `update_check`.
    #[error("no update is waiting")]
    NothingPending,
}

pub type Result<T> = std::result::Result<T, UpdateError>;

/// A release newer than the one running.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    /// The version on offer, e.g. "0.2.0".
    pub version: String,
    /// The version running right now.
    pub current: String,
    /// The release notes, as written on the GitHub release. Empty when it had none.
    pub notes: String,
    /// Publication date (RFC 3339) when the endpoint gave one.
    pub date: Option<String>,
}

/// The update `update_check` found, kept for `update_install` so the second command does not
/// have to ask the endpoint all over again.
#[derive(Default)]
pub struct Pending(pub Mutex<Option<Update>>);

/// Which command a plugin error came out of. The same error type covers both, and the same
/// `Io` error means "the network went away" in one and "/Applications is read-only" in the
/// other — the person reading the message needs to be told which.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Check,
    Install,
}

/// Turns a plugin error into something the update screen can say out loud.
///
/// The signature cases are singled out on purpose: a failed signature check and a failed
/// download arrive as the same Rust type but mean opposite things to the reader — one is
/// "try again in a minute", the other is "do not install this".
pub fn describe(e: &tauri_plugin_updater::Error, phase: Phase) -> UpdateError {
    use tauri_plugin_updater::Error as E;
    match e {
        E::EmptyEndpoints => UpdateError::NotConfigured,
        E::Minisign(_) | E::Base64(_) | E::SignatureUtf8(_) => {
            UpdateError::NotTrusted(e.to_string())
        }
        E::AuthenticationFailed | E::PackageInstallFailed | E::BinaryNotFoundInArchive => {
            UpdateError::Install(e.to_string())
        }
        _ if phase == Phase::Install => UpdateError::Install(e.to_string()),
        _ => UpdateError::Unreachable(e.to_string()),
    }
}

/// How often a download may report progress.
///
/// A 12 MB bundle arrives in thousands of chunks; forwarding every one would put more work on
/// the IPC bridge than on the network, and nobody can read a number that changes 2000 times.
pub const PROGRESS_EVERY: Duration = Duration::from_millis(150);

/// Rate-limits progress events. The last one always lands, so the bar reaches the end.
pub struct Throttle {
    last: Instant,
}

impl Throttle {
    pub fn new() -> Self {
        // A full interval in the past, so the first chunk reports at once and the bar moves
        // off zero as soon as anything arrives.
        Self {
            last: Instant::now() - PROGRESS_EVERY,
        }
    }

    pub fn ready(&mut self, done: bool, now: Instant) -> bool {
        if done || now.duration_since(self.last) >= PROGRESS_EVERY {
            self.last = now;
            true
        } else {
            false
        }
    }
}

impl Default for Throttle {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_is_throttled_but_the_last_one_always_lands() {
        // Built first: the throttle backdates itself to `now`, so a `start` taken before it
        // would be a hair *inside* the interval and the first chunk would be dropped.
        let mut t = Throttle::new();
        let start = Instant::now();
        assert!(t.ready(false, start), "the first chunk moves the bar");
        assert!(!t.ready(false, start + Duration::from_millis(10)));
        assert!(!t.ready(false, start + Duration::from_millis(140)));
        assert!(t.ready(false, start + Duration::from_millis(200)));
        // However the timing falls, the event that says "finished" is never dropped.
        assert!(t.ready(true, start + Duration::from_millis(201)));
    }

    #[test]
    fn a_bad_signature_is_never_reported_as_a_network_problem() {
        let sig = tauri_plugin_updater::Error::SignatureUtf8("not base64".into());
        assert!(matches!(
            describe(&sig, Phase::Check),
            UpdateError::NotTrusted(_)
        ));
        assert!(matches!(
            describe(&sig, Phase::Install),
            UpdateError::NotTrusted(_)
        ));
    }

    #[test]
    fn the_same_failure_reads_differently_before_and_after_the_download() {
        let e = tauri_plugin_updater::Error::Io(std::io::Error::other("read-only file system"));
        assert!(matches!(
            describe(&e, Phase::Check),
            UpdateError::Unreachable(_)
        ));
        assert!(matches!(
            describe(&e, Phase::Install),
            UpdateError::Install(_)
        ));
    }

    #[test]
    fn a_build_with_no_endpoint_says_so_rather_than_blaming_the_network() {
        let e = tauri_plugin_updater::Error::EmptyEndpoints;
        assert!(matches!(
            describe(&e, Phase::Check),
            UpdateError::NotConfigured
        ));
    }
}
