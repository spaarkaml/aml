import { BoundingsPanel } from "@/features/boundings/BoundingsPanel";
import { DailyPanel } from "@/features/daily/DailyPanel";
import { FolioTree } from "@/features/folio/FolioTree";
import { useFolioStore } from "@/features/folio/store";
import { type LeftView, useLayoutStore } from "@/features/layout/store";
import { BinderPanel } from "@/features/project/BinderPanel";
import { useProjectStore } from "@/features/project/store";
import { SearchPanel } from "@/features/search/SearchPanel";
import { TagsPanel } from "@/features/tags/TagsPanel";
import { Icon } from "../icons";
import styles from "./shell.module.css";

/**
 * Three views, so the control fits one line (WP-3.10). Tags and the Daily strip did not go
 * away: each moved next to the thing it is reached from — tags under Search, the week under
 * the Folio tree — which is one fewer tab and one fewer click to either.
 */
const VIEWS: Array<{ id: LeftView; label: string; icon?: "search" }> = [
  { id: "folio", label: "Folio" },
  { id: "boundings", label: "Boundings" },
  { id: "search", label: "Search", icon: "search" },
];

const PANELS: Record<LeftView, React.ReactNode> = {
  folio: (
    <>
      <FolioTree />
      <div className={styles.leftFooter}>
        <DailyPanel />
      </div>
    </>
  ),
  // Replaced by the Binder while a Project is open (WP-5.2); see `LeftPanel` below.
  boundings: <BoundingsPanel />,
  search: (
    <>
      <SearchPanel />
      <section className={styles.leftSection} aria-label="Tags">
        <p className={styles.leftLabel}>Tags</p>
        <TagsPanel />
      </section>
    </>
  ),
};

export function LeftPanel() {
  const folio = useFolioStore((s) => s.folio);
  const view = useLayoutStore((s) => s.leftView);
  const setView = useLayoutStore((s) => s.setLeftView);
  const project = useProjectStore((s) => s.project);
  if (!folio) return <p className={styles.placeholder}>Open a Folio to browse it.</p>;
  return (
    <div className={styles.left}>
      <div className={styles.segmented}>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={view === v.id}
            aria-label={v.icon ? v.label : undefined}
            title={v.icon ? v.label : undefined}
            className={view === v.id ? styles.segmentActive : styles.segment}
            onClick={() => setView(v.id)}
            data-testid={`left-view-${v.id}`}
          >
            {v.icon ? (
              <Icon name={v.icon} size={14} />
            ) : v.id === "folio" && project ? (
              "Binder"
            ) : (
              v.label
            )}
          </button>
        ))}
      </div>
      {view === "folio" && project ? <BinderPanel /> : PANELS[view]}
    </div>
  );
}
