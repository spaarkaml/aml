/** Helpers for Folio-relative paths (always `/`-separated, never absolute). */

export function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

export function parentDir(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

/** Display title for a note path: file name without the `.md` extension. */
export function noteTitle(path: string): string {
  return baseName(path).replace(/\.md$/i, "");
}

/** True when `path` is `ancestor` itself or lives inside it. */
export function isWithin(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}/`);
}

/** Rewrites `path` after `from` was renamed to `to` (folder renames move children too). */
export function remapPath(path: string, from: string, to: string): string {
  if (path === from) return to;
  if (path.startsWith(`${from}/`)) return to + path.slice(from.length);
  return path;
}
