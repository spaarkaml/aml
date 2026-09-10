//! Bundled helper processes. The Syncthing sidecar (ADR-005) is managed here and nowhere
//! else: the rest of the app only ever calls `sidecar::syncthing`.

pub mod syncthing;
