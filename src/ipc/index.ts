// Re-export of the generated bindings so features import from "@/ipc" and never
// from the generated file directly. `bindings.ts` is written by tauri-specta on
// every debug build of the Rust crate (see src-tauri/src/lib.rs).
export * from "./bindings";
