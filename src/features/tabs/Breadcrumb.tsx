import { Icon } from "@/app/icons";
import { useBrowserStore } from "@/features/folio/browserStore";
import { useFolioStore } from "@/features/folio/store";
import { useLayoutStore } from "@/features/layout/store";
import { noteTitle } from "@/lib/paths";
import { useTabsStore } from "./store";
import styles from "./TabStrip.module.css";

/**
 * `⌂ › folder › note` for the active tab; clicking a folder reveals it in the Browser.
 *
 * The root crumb is the way Home, because the Overview used to be reachable only by closing
 * every note (WP-3.10). Its accessible name is still the Folio's, so the trail reads as one.
 */
export function Breadcrumb() {
  const folio = useFolioStore((s) => s.folio);
  const active = useTabsStore((s) =>
    s.folioRoot ? (s.byFolio[s.folioRoot]?.active ?? null) : null,
  );
  const showOverview = useTabsStore((s) => s.showOverview);
  const reveal = useBrowserStore((s) => s.reveal);
  const openPanel = useLayoutStore((s) => s.openPanel);

  if (!folio) return <span>Overview</span>;
  const parts = active ? active.split("/") : [];
  const folders = parts.slice(0, -1);
  const leaf = parts[parts.length - 1];
  return (
    <>
      <button
        type="button"
        className={styles.home}
        onClick={showOverview}
        aria-current={active ? undefined : "page"}
        aria-label={`Overview — ${folio.name}`}
        title={`Overview — ${folio.name}`}
        data-testid="home"
      >
        <Icon name="home" size={15} />
        <span className={styles.homeName}>{folio.name}</span>
      </button>
      {folders.map((name, i) => {
        const path = folders.slice(0, i + 1).join("/");
        return (
          <span key={path} className={styles.crumb}>
            <span className={styles.sep} aria-hidden="true" />
            <button
              type="button"
              className={styles.crumbButton}
              onClick={() => {
                reveal(`${path}/`);
                openPanel("left");
              }}
              title={`Show ${name} in the Browser`}
            >
              {name}
            </button>
          </span>
        );
      })}
      {leaf ? (
        <span className={styles.crumb}>
          <span className={styles.sep} aria-hidden="true" />
          <span>{noteTitle(leaf)}</span>
        </span>
      ) : null}
    </>
  );
}
