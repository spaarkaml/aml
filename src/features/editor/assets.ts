import { convertFileSrc } from "@tauri-apps/api/core";
import { commands } from "@/ipc";

const cache = new Map<string, Promise<string>>();

function isExternal(src: string): boolean {
  return /^(https?:|data:|blob:|asset:|file:)/i.test(src);
}

export function hasTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Turns a note-relative image path (what the markdown holds) into something the webview can
 * display: the Tauri asset protocol inside the app, the raw value elsewhere (browser e2e).
 */
export function resolveDisplaySrc(notePath: string | null, src: string): Promise<string> {
  if (!src || isExternal(src) || !notePath || !hasTauri()) return Promise.resolve(src);
  const key = `${notePath}|${src}`;
  let p = cache.get(key);
  if (!p) {
    p = commands.assetResolve(notePath, src).then((r) => {
      if (r.status === "error") return src;
      return convertFileSrc(r.data);
    });
    cache.set(key, p);
  }
  return p;
}

export function invalidateAssetCache(): void {
  cache.clear();
}

function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export interface StoredImage {
  markdownPath: string;
  alt: string;
}

/** Stores an image file for `notePath` and returns the path to put in the note. */
export async function storeImage(
  notePath: string,
  file: File | Blob,
  name: string,
): Promise<StoredImage | null> {
  const data = await toBase64(file);
  const r = await commands.assetWrite(notePath, name, data);
  if (r.status === "error") return null;
  const alt = name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
  return { markdownPath: r.data.markdownPath, alt };
}

export function imageFilesFrom(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  return Array.from(dt.files).filter((f) => f.type.startsWith("image/"));
}

export function pastedImageName(file: File, index: number): string {
  if (file.name && file.name !== "image.png") return file.name;
  const ext = (file.type.split("/")[1] ?? "png").replace("jpeg", "jpg");
  return index === 0 ? `pasted.${ext}` : `pasted-${index + 1}.${ext}`;
}
