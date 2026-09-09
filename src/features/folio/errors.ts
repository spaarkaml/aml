import type { FolioError } from "@/ipc";

/** Human-readable message for a FolioError; the UI never shows raw `kind` strings. */
export function describeFolioError(e: FolioError): string {
  switch (e.kind) {
    case "noFolioOpen":
      return "No Folio is open.";
    case "notAFolio":
      return `That folder is not a Folio yet (no .aml folder inside): ${e.detail}`;
    case "notFound":
      return `Not found: ${e.detail}`;
    case "invalidPath":
      return `Invalid path: ${e.detail}`;
    case "alreadyExists":
      return `Already exists: ${e.detail}`;
    case "conflict":
      return "This note changed on disk since you opened it.";
    case "notText":
      return `Not a text file: ${e.detail}`;
    case "io":
      return `File error: ${e.detail}`;
  }
}
