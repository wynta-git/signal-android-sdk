"use client";
import { useState } from "react";
import { HISTORY_KIND_META } from "../../services/mocks/history";
import Icon from "wynta-react-common/components/Icon";
import HistoryRow from "./HistoryRow";
import { useAppSelector } from "../../store/hooks";
import { selectHistory } from "../../store/slices/historySlice";
import type { NodeType } from "../../types";

interface ChangeHistoryProps {
  type?: NodeType;
  id: number;
  alwaysExpanded?: boolean;
}

export default function ChangeHistory({
  type = "configure",
  id,
  alwaysExpanded = false,
}: ChangeHistoryProps) {
  void HISTORY_KIND_META;
  const stored = useAppSelector(selectHistory(type, id));
  const [expanded, setExpanded] = useState(alwaysExpanded);

  if (stored === undefined) {
    return (
      <div className="history-empty">
        <Icon name="loader" size={14} color="var(--g400)" />
        <span>Loading…</span>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = stored as any[];

  if (all.length === 0) {
    return (
      <div className="history-empty">
        <Icon name="history" size={14} color="var(--g400)" />
        <span> No changes recorded yet.</span>
      </div>
    );
  }

  const shown = alwaysExpanded || expanded ? all : all.slice(0, 4);

  return (
    <div className="history-card">
      <div className="history-list">
        {shown.map((evt, i) => (
          <HistoryRow key={i} evt={evt} last={i === shown.length - 1} />
        ))}
      </div>
      {!alwaysExpanded && all.length > 4 && (
        <button
          className="history-toggle"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? (
            <>
              <Icon name="chevron-up" size={12} /> Show recent only
            </>
          ) : (
            <>
              <Icon name="chevron-down" size={12} /> Show all {all.length}{" "}
              events
            </>
          )}
        </button>
      )}
    </div>
  );
}
