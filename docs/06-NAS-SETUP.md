# AML — DRIVESTOR 2 Pro Gen2 install-day checklist

For setting up the Asustor DRIVESTOR 2 Pro Gen2 (AS3302T v2) so a Synced Folio (ADR-005) works from day one. Tick as you go. Menu names are from ADM 4.x; if something has moved, the concept is what matters. Items marked **verify** are things I could not confirm for this exact model.

## 1. Hardware and first boot
- [ ] Two drives installed. Use **RAID 1 (mirror)** — one disk can fail without data loss. RAID is not a backup (see §6).
- [ ] Wired to the router. Note the NAS's LAN IP from your router, or use Asustor Control Center / `http://<nas-ip>:8000`.
- [ ] Run the ADM setup wizard. Set a strong admin password. Enable automatic ADM updates.

## 2. Volume
- [ ] Storage Manager → create Volume 1 on the RAID 1 array.
- [ ] File system: choose **Btrfs** if it is offered (**verify** — enables Snapshot Center as a bonus); otherwise **EXT4** is fine. Nothing in AML depends on this choice because the history backstop is Syncthing's versioning.

## 3. User and shared folder
- [ ] Access Control → Local Users → create a user for yourself (not admin) with a strong password.
- [ ] Access Control → Shared Folders → create **`Folio`** (or your Folio's name). Give your user read/write. Leave guests off.
- [ ] Services → SMB: leave enabled. Not needed for Synced mode, but harmless and useful for browsing the files in Finder/Explorer.

## 4. Syncthing on the NAS
- [ ] App Central → search **Syncthing** → install (**verify** it is listed for this ARM model; if not, tell me — the fallback is Network/SMB mode, WP 4.6).
- [ ] Open the Syncthing app (usually `http://<nas-ip>:8384`). Set a GUI username and password (Actions → Settings → GUI).
- [ ] Actions → Show ID → copy the **Device ID**. Keep it; AML's pairing screen asks for it.
- [ ] Add Folder: Folder Path = the shared folder (typically `/volume1/Folio`), Folder ID = `folio`, Folder Type = **Send & Receive**.
- [ ] Folder → File Versioning → **Staggered File Versioning**, Maximum Age **365** days (or 0 for keep forever). Versions go to `.stversions/` inside the folder — AML hides it.
- [ ] If Syncthing cannot write to the folder (permission error in its log): give the Syncthing app's user write access to the shared folder in Access Control, or set the folder's permissions from ADM's File Explorer.
- [ ] Optional: Actions → Settings → Connections → untick "Enable Relaying" and "Global Discovery" so the NAS only talks to devices on your home network. AML's sidecar will use local discovery.

### If Syncthing on the NAS says `mkdir /volume1: permission denied`
The Syncthing process cannot see `/volume1` at all. Two causes:
- **Native App Central install:** the shared folder does not exist yet. Create `Folio` in Access Control → Shared Folders first, then set the folder path to `/volume1/Folio`. If it still fails, the app runs as its own user: give that user read/write on the share (Access Control → Shared Folders → Folio → Access Rights).
- **Docker / Portainer install:** the container only sees what is mounted into it. Add a bind mount `/volume1/Folio → /data/Folio` to the container and use `/data/Folio` as the folder path inside Syncthing.

## 5. Until AML exists (optional)
If you want to use the NAS folder now with Obsidian or a text editor, install the Syncthing desktop app on the Mac/PC, pair with the NAS's Device ID, and share the `folio` folder. When AML ships its bundled sidecar (Stage 1), it will import that existing pairing rather than making a second one. Skip this if you'd rather wait.

## 6. Backup (not optional)
Sync and snapshots protect against mistakes, not against fire, theft, or a dead NAS.
- [ ] Plug an external USB drive into the NAS.
- [ ] Backup & Restore → create a scheduled **local backup** of `Folio` to the USB drive, nightly, keep several versions.
- [ ] Optional second copy: Backup & Restore → Cloud Backup (any cloud you already pay for), or a second USB drive kept elsewhere and swapped monthly.
- [ ] Optional: a small UPS so the NAS shuts down cleanly in a power cut.

## 7. Installing AML on Mac and Windows (unsigned builds, ADR-012)
- **macOS:** open the `.dmg`, drag AML to Applications, then **right-click → Open** the first time and confirm. If macOS says AML **"is damaged and can't be opened"**, the build predates 2026-09-12 and its bundle was never signed (see ADR-012's amendment); `xattr -dr com.apple.quarantine /Applications/AML.app` in Terminal clears it, and any later build does not need it.
- Before installing a new build, **eject any AML disk image still mounted** (`hdiutil detach /Volumes/AML`). A second image with the same volume name mounts as `AML 1`, and it is easy to drag the app out of the older window.
- **Windows:** run the `.msi`; on the SmartScreen dialog click **More info → Run anyway**.
- First launch: Create Folio → Synced → paste the NAS Device ID → accept the new device in the NAS's Syncthing UI → done.

## 8. Pairing from AML (WP-1.1b)
1. AML → Welcome → **NAS sync…** (or the palette: "NAS Sync…") → **Turn on**.
2. Paste the NAS Device ID; optionally its LAN IP. **Add NAS**. On the NAS's Syncthing UI accept the new device (it shows AML's Device ID, also printed in the screen).
3. Either: on the NAS share its folder with the AML device → it appears in AML under Folders as an offer → **Accept → choose folder…** → **Open as Folio**. Or: open a Folio in AML → **Share this Folio with the NAS** → accept it on the NAS and pick `/volume1/Folio` (or the mounted path).
4. The status bar shows `NAS · up to date` once both sides agree. Repeat step 1–3 on the PC, pairing with the NAS (never PC-to-Mac).

## 9. What to tell me after install day
- Whether Btrfs was offered.
- Whether Syncthing appeared in App Central.
