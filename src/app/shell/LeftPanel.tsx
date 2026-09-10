import { DailyPanel } from "@/features/daily/DailyPanel";
import { FolioTree } from "@/features/folio/FolioTree";
import { useFolioStore } from "@/features/folio/store";
import { SearchPanel } from "@/features/search/SearchPanel";
import { type LeftView, useTagsStore } from "@/features/tags/store";
import { TagsPanel } from "@/features/tags/TagsPanel";
import styles from "./shell.module.css";

const VIEWS: Array<{ id: LeftView; label: string }> = [
  { id: "folio", label: "Folio" },
  { id: "tags", label: "Tags" },
  { id: "search", label: "Search" },
  { id: "daily", label: "Daily" },
];

/** Left panel: the Folio Browser, Tags, Search or Daily, switched by a segmented control. */
const PANELS: Record<LeftView, React.ReactNode> = {
  folio: <FolioTree />,
  tags: <TagsPanel />,
  search: <SearchPanel />,
  daily: <DailyPanel />,
};

export function LeftPanel() {
  const folio = useFolioStore((s) => s.folio);
  const view = useTagsStore((s) => s.view);
  const setView = useTagsStore((s) => s.setView);
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
