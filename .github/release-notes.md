
---

Installed copies of AML update themselves from here — this page is only needed for a machine
that does not have AML on it yet.

AML carries no OS certificate (ADR-012), so a *first* install takes one extra gesture:

- **macOS** (Apple silicon, `.dmg`): right-click AML → **Open** → Open. Or run
  `xattr -dr com.apple.quarantine /Applications/AML.app`.
- **Windows**: install the `-setup.exe`. SmartScreen → **More info** → **Run anyway**.
  The `.msi` is there for a per-machine install, but it cannot update itself.

Updates after that are signed with AML's own key and arrive in the app: the version in the
status bar opens **Updates**.

After installing, open a Folio and pair with the NAS from the sync screen —
`docs/06-NAS-SETUP.md` has the steps.
