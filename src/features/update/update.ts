import type { UpdateError, UpdateInfo } from "@/ipc";

/** How long a check stays fresh. Six hours: often enough to catch a release the same day. */
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** Human-readable message for an UpdateError; the UI never shows raw `kind` strings. */
export function describeUpdateError(e: UpdateError): string {
  switch (e.kind) {
    case "notConfigured":
      return "This build cannot update itself — it was not made by the release workflow.";
    case "unreachable":
      return `Could not reach the update server: ${e.detail}`;
    case "notTrusted":
      return `That download was not signed by AML and has been discarded: ${e.detail}`;
    case "install":
      return `The update downloaded but could not be installed: ${e.detail}`;
    case "nothingPending":
      return "Nothing to install — check again.";
  }
}

/**
 * Compares two dotted versions the way a release does: 0.10.0 is newer than 0.9.0, and
 * anything after a hyphen (a pre-release tag) loses to the plain version.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => {
    const [core = "", pre = ""] = v.replace(/^v/, "").split("-", 2);
    return { nums: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre };
  };
  const x = parts(a);
  const y = parts(b);
  const len = Math.max(x.nums.length, y.nums.length);
  for (let i = 0; i < len; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  if (x.pre === y.pre) return 0;
  // No pre-release tag is the released version, and a release beats its own candidates.
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/**
 * Whether an offered release should be shown, given the one the user dismissed.
 *
 * "Not now" is about *that* version, not about updates: a later release un-skips itself,
 * otherwise one dismissal would quietly switch updating off forever.
 */
export function shouldOffer(info: UpdateInfo | null, skipped: string | null): boolean {
  if (!info) return false;
  if (!skipped) return true;
  return compareVersions(info.version, skipped) > 0;
}

/** Download progress as a percentage, or `null` while the size is unknown. */
export function percentOf(downloaded: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.min(100, Math.round((downloaded / total) * 100));
}

/** Megabytes to one decimal — the only size worth showing for a download this small. */
export function formatMb(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** The release date as a plain Australian date, or null when the endpoint gave none. */
export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}
