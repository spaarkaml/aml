import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app/App";
import "@/app/tokens.css";
import "@/app/global.css";

async function boot() {
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    const { installDevMocks } = await import("./dev-mocks");
    installDevMocks();
  }
  const root = document.getElementById("root");
  if (!root) throw new Error("#root missing from index.html");
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void boot();
