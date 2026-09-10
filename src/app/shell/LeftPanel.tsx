import { BoundingsPanel } from "@/features/boundings/BoundingsPanel";
import { DailyPanel } from "@/features/daily/DailyPanel";
import { FolioTree } from "@/features/folio/FolioTree";
import { useFolioStore } from "@/features/folio/store";
import { type LeftView, useLayoutStore } from "@/features/layout/store";
import { SearchPanel } from "@/features/search/SearchPanel";
import { TagsPanel } from "@/features/tags/TagsPanel";
import styles from "./shell.module.css";

const VIEWS: Array<{ id: LeftView; label: string }> = [
  { id: "folio", label: "Folio" },
  { id: "tags", label: "Tags" },
  { id: "search", label: "Search" },
  { id: "daily", label: "Daily" },
  { id: "boundings", label: "Boundings" },
];

/** Left panel: Folio Browser, Tags, Search, Daily or Boundings, switched by a segmented control. */
const PANELS: Record<LeftView, React.ReactNode> = {
  folio: <FolioTree />,
  tags: <TagsPanel />,
  search: <SearchPanel />,
  daily: <DailyPanel />,
  boundings: <BoundingsPanel />,
};

export function LeftPanel() {
  const folio = useFolioStore((s) => s.folio);
  const view = useLayoutStore((s) => s.leftView);
  const setView = useLayoutStore((s) => s.setLeftView);
  if (!folio) return <p className={styles.placeholder}>Open a Folio to browse it.</p>;
  return (
    <div className={styles.left}>
      <div className={styles.segmented}>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={view === v.id}
            className={view === v.id ? styles.segmentActive : styles.segment}
            onClick={() => setView(v.id)}
            data-testid={`left-view-${v.id}`}
          >
            {v.label}
          </button>
        ))}
      </div>
      {PANELS[view]}
    </div>
  );
}
