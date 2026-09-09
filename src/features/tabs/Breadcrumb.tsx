import { useBrowserStore } from "@/features/folio/browserStore";
import { useFolioStore } from "@/features/folio/store";
import { useLayoutStore } from "@/features/layout/store";
import { noteTitle } from "@/lib/paths";
import { useTabsStore } from "./store";
import styles from "./TabStrip.module.css";

/** `Folio › folder › note` for the active tab; clicking a folder reveals it in the Browser. */
export function Breadcrumb() {
  const folio = useFolioStore((s) => s.folio);
  const active = useTabsStore((s) =>
    s.folioRoot ? (s.byFolio[s.folioRoot]?.active ?? null) : null,
  );
  const reveal = useBrowserStore((s) => s.reveal);
  const openPanel = useLayoutStore((s) => s.openPanel);

  if (!folio) return <span>Overview</span>;
  const parts = active ? active.split("/") : [];
  const folders = parts.slice(0, -1);
  const leaf = parts[parts.length - 1];
  return (
    <>
      <span>{folio.name}</span>
      {folders.map((name, i) => {
        const path = folders.slice(0, i + 1).join("/");
        return (
          <span key={path} className={styles.crumb}>
            <span aria-hidden="true">›</span>
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
          <span aria-hidden="true">›</span>
          <span>{noteTitle(leaf)}</span>
        </span>
      ) : null}
    </>
  );
}
