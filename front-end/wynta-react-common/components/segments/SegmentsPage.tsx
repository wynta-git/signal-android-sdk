"use client";
import { useState, useMemo, useEffect } from "react";
import { useDispatch } from "react-redux";
import Icon from "../Icon";
import { useCommonSelector } from "../../store/hooks";
import {
  fetchSegments,
  selectAllSegments,
  selectSegmentsStatus,
  selectAllEvaluating,
  deleteSegment,
} from "../../store/slices/segmentsSlice";
import AddSegmentModal from "./AddSegmentModal";
import DeleteSegmentModal from "./DeleteSegmentModal";
import SegmentUploadHistory from "./SegmentUploadHistory";
import SegmentUsersModal from "./SegmentUsersModal";
import { formatConditions, formatRelative } from "../../utils";
import { getToken } from "../../services/tokenRegistry";
import type { Segment } from "../../types";

const SEG_BASE = process.env.NEXT_PUBLIC_SEG_API_URL ?? "http://3.7.48.14:8003";

interface SegmentStats {
  total_segments: number;
  active_campaigns_using: number;
  estimated_reach: number;
}

interface SegmentRow {
  id: string;
  name: string;
  type: "static" | "dynamic";
  conditions: string;
  reach: string;
  rawCount: number;
  rawCreated: number;
  created: string;
  createdBy: string;
  usedIn: string[];
  csvFilename?: string;
  csvUploadedBy?: string;
}

function toRow(s: Segment): SegmentRow {
  const name = s.label ?? s.name ?? String(s.id);
  const isDyn =
    (s as any).segment_type === "dynamic" || (s as any).type === "dynamic";
  return {
    id: String(s.id),
    name,
    type: isDyn ? "dynamic" : "static",
    conditions:
      formatConditions(s.rule) || (s as any).description || (s.hint ?? ""),
    reach: s.count ? s.count.toLocaleString("en-IN") + " players" : "—",
    rawCount: s.count ?? 0,
    rawCreated: s.last_used_at ? new Date(s.last_used_at).getTime() : 0,
    created: formatRelative(s.last_used_at),
    createdBy: (s as any).owner ?? s.owner ?? "System",
    usedIn: s.used_by_campaigns ?? (s as any).used_in ?? [],
    csvFilename: s.original_filename ?? undefined,
    csvUploadedBy: s.uploaded_by ?? undefined,
  };
}

interface SegmentsPageProps {
  /** Called when user clicks Add Segment; if omitted the built-in modal is shown */
  onAddSegment?: () => void;
  brandId?: number;
}

type SegSortCol =
  | "name"
  | "conditions"
  | "reach"
  | "created"
  | "createdBy"
  | "usedIn";

function SortIcon({ dir }: { dir: "asc" | "desc" | null }) {
  return (
    <svg
      width="10"
      height="12"
      viewBox="0 0 10 14"
      fill="none"
      style={{ flexShrink: 0, color: "var(--crm-blue)" }}
    >
      <path
        d="M5 1L2 5h6L5 1z"
        fill="currentColor"
        opacity={dir === "asc" ? 1 : 0.35}
      />
      <path
        d="M5 13L2 9h6l-3 4z"
        fill="currentColor"
        opacity={dir === "desc" ? 1 : 0.35}
      />
    </svg>
  );
}

export default function SegmentsPage({
  onAddSegment,
  brandId,
}: SegmentsPageProps) {
  const dispatch = useDispatch<any>();

  const apiSegments = useCommonSelector(selectAllSegments);
  const status = useCommonSelector(selectSegmentsStatus);
  const [stats, setStats] = useState<SegmentStats | null>(null);

  useEffect(() => {
    dispatch(fetchSegments(brandId));
    const statsUrl = brandId
      ? `${SEG_BASE}/api/v1/segment/segments/stats?brand_id=${brandId}`
      : `${SEG_BASE}/api/v1/segment/segments/stats`;
    fetch(statsUrl, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SegmentStats | null) => {
        if (data) setStats(data);
      })
      .catch(() => {});
  }, [dispatch, brandId]);

  /* Use only real API data — no sample / fallback rows */
  /* Sort by last_refresh_time desc (maps to last_used_at in Segment type) */
  const rows: SegmentRow[] = useMemo(
    () =>
      [...apiSegments]
        .sort((a, b) => {
          const tA = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
          const tB = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
          return tB - tA;
        })
        .map(toRow),
    [apiSegments],
  );

  /* Evaluating state: id → boolean (for reach column spinner) */
  const evaluating = useCommonSelector(selectAllEvaluating);

  const [search, setSearch] = useState("");
  const [typeFilter, setType] = useState<"all" | "static" | "dynamic">("all");
  const [sort, setSort] = useState<{
    col: SegSortCol;
    dir: "asc" | "desc";
  } | null>({ col: "reach", dir: "desc" });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  type ModalConfig = { mode: "create" | "edit"; segmentId?: string } | null;
  const [modalConfig, setModalConfig] = useState<ModalConfig>(null);

  const handleAddSegment = () => {
    if (onAddSegment) onAddSegment();
    else setModalConfig({ mode: "create" });
  };

  function handleEdit(rowId: string) {
    setModalConfig({ mode: "edit", segmentId: rowId });
  }

  const filtered = useMemo(() => {
    const base = rows.filter((r) => {
      const matchSearch =
        !search || r.name.toLowerCase().includes(search.toLowerCase());
      const matchType = typeFilter === "all" || r.type === typeFilter;
      return matchSearch && matchType;
    });
    if (!sort) return base;
    const mul = sort.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      let cmp = 0;
      switch (sort.col) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "conditions":
          cmp = a.conditions.localeCompare(b.conditions);
          break;
        case "reach":
          cmp = a.rawCount - b.rawCount;
          break;
        case "created":
          cmp = a.rawCreated - b.rawCreated;
          break;
        case "createdBy":
          cmp = a.createdBy.localeCompare(b.createdBy);
          break;
        case "usedIn":
          cmp = a.usedIn.length - b.usedIn.length;
          break;
      }
      return cmp * mul;
    });
  }, [rows, search, typeFilter, sort]);

  // Reset to page 1 whenever filter/search/sort changes
  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Build visible page numbers with ellipsis
  function pageNumbers(): (number | "…")[] {
    if (totalPages <= 7)
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "…")[] = [1];
    if (page > 3) pages.push("…");
    for (
      let p = Math.max(2, page - 1);
      p <= Math.min(totalPages - 1, page + 1);
      p++
    )
      pages.push(p);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
    return pages;
  }

  /* ── Export current filtered rows as CSV ── */
  function handleExport() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const headers = [
      "Segment Name",
      "Conditions",
      "Est. Reach",
      "Created",
      "Created By",
      "Used In",
    ];
    const csvRows = [
      headers.join(","),
      ...filtered.map((r) =>
        [
          esc(r.name),
          esc(r.conditions),
          esc(r.reach),
          esc(r.created),
          esc(r.createdBy),
          esc(r.usedIn.join("; ")),
        ].join(","),
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "segments.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalCount = rows.length;
  const activeCampaigns = rows.reduce((n, r) => {
    if (r.usedIn.length === 0) return n;
    const numericEntry = r.usedIn.find((u) => /^\d+/.test(u));
    if (numericEntry) return n + parseInt(numericEntry, 10);
    return n + r.usedIn.length;
  }, 0);
  const estimatedReach = apiSegments.reduce(
    (sum, s) => sum + (s.count ?? 0),
    0,
  );

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [historySegment, setHistorySegment] = useState<Segment | null>(null);
  const [viewUsersRow, setViewUsersRow] = useState<SegmentRow | null>(null);

  function handleDeleteClick(id: string, name: string) {
    setDeleteTarget({ id, name });
  }

  function handleViewUsers(row: SegmentRow) {
    setViewUsersRow(row);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    dispatch(deleteSegment(deleteTarget.id));
  }

  return (
    <div className="seg-page">
      {/* ── Page header ── */}
      <div className="seg-page-header">
        <div>
          <div className="seg-page-title">Segments</div>
          <div className="seg-page-subtitle">
            All player segments — reusable across Push, In-App, Email, SMS and
            WhatsApp
          </div>
        </div>
        <div className="seg-page-actions">
          <button
            className="seg-btn-secondary"
            type="button"
            onClick={handleExport}
          >
            <Icon name="download" size={14} />
            Export
          </button>
          <button
            className="seg-btn-primary"
            type="button"
            onClick={handleAddSegment}
          >
            <Icon name="plus" size={14} />
            Add Segment
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="seg-stats-row">
        <div className="seg-stat-card">
          <div className="seg-stat-label">Total Segments</div>
          <div className="seg-stat-value">
            {stats ? stats.total_segments.toLocaleString("en-IN") : totalCount}
          </div>
          <div className="seg-stat-sub">across all types</div>
        </div>
        <div className="seg-stat-card">
          <div className="seg-stat-label">Active Campaigns Using</div>
          <div className="seg-stat-value">
            {stats
              ? stats.active_campaigns_using.toLocaleString("en-IN")
              : activeCampaigns}
          </div>
          <div className="seg-stat-sub">segments in use</div>
        </div>
        <div className="seg-stat-card">
          <div className="seg-stat-label">Estimated Reach</div>
          <div className="seg-stat-value">
            {estimatedReach.toLocaleString("en-IN")}
          </div>
          <div className="seg-stat-sub">players</div>
        </div>
      </div>

      {/* ── Table section ── */}
      <div className="seg-table-section">
        <div className="seg-table-toolbar">
          <div className="seg-table-toolbar-title">All Segments</div>
          <div className="seg-table-controls">
            <div className="seg-search-wrap">
              <span className="seg-search-icon">
                <Icon name="search" size={14} />
              </span>
              <input
                type="text"
                placeholder="Search segments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="seg-table-scroll">
          <table className="seg-list-table">
            <thead>
              <tr>
                {(
                  [
                    "name",
                    "conditions",
                    "reach",
                    "created",
                    "createdBy",
                    "usedIn",
                  ] as SegSortCol[]
                ).map((col) => {
                  const labels: Record<SegSortCol, string> = {
                    name: "Segment Name",
                    conditions: "Conditions",
                    reach: "Est. Reach",
                    created: "Created",
                    createdBy: "Created By",
                    usedIn: "Used In",
                  };
                  return (
                    <th
                      key={col}
                      style={{
                        cursor: "pointer",
                        userSelect: "none",
                        ...(col === "usedIn" ? { width: 180 } : {}),
                      }}
                      onClick={() =>
                        setSort((s) =>
                          s?.col === col
                            ? { col, dir: s.dir === "desc" ? "asc" : "desc" }
                            : { col, dir: "desc" },
                        )
                      }
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {labels[col]}
                        <SortIcon dir={sort?.col === col ? sort.dir : null} />
                      </div>
                    </th>
                  );
                })}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {status === "loading" ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: "center",
                      padding: "40px 16px",
                      color: "var(--crm-fg4)",
                    }}
                  >
                    Loading segments…
                  </td>
                </tr>
              ) : status === "failed" ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: "center",
                      padding: "40px 16px",
                      color: "var(--crm-negative, #D64545)",
                    }}
                  >
                    Unable to load segments. Check your connection and try
                    again.
                  </td>
                </tr>
              ) : filtered.length === 0 && rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: "center",
                      padding: "40px 16px",
                      color: "var(--crm-fg4)",
                    }}
                  >
                    No segments found. Click <strong>+ Add Segment</strong> to
                    create one.
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: "center",
                      padding: "40px 16px",
                      color: "var(--crm-fg4)",
                    }}
                  >
                    No segments match your search.
                  </td>
                </tr>
              ) : (
                paginated.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="seg-row-name">{row.name}</div>
                      {row.csvFilename && (
                        <div className="seg-row-csv-meta">
                          <span
                            title="View upload history"
                            role="button"
                            tabIndex={0}
                            style={{ fontSize: 12, color: '#0091E0', textDecoration: 'underline', cursor: 'pointer' }}
                            onClick={() => {
                              const seg = apiSegments.find(s => String(s.id) === row.id);
                              if (seg) setHistorySegment(seg);
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                const seg = apiSegments.find(s => String(s.id) === row.id);
                                if (seg) setHistorySegment(seg);
                              }
                            }}
                          >
                            {row.csvFilename}
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="seg-conditions" title={row.conditions}>
                        {row.conditions || "—"}
                      </div>
                    </td>
                    <td>
                      {evaluating[row.id] ? (
                        <span className="seg-evaluating">
                          <Icon name="loader" size={12} />
                          Counting…
                        </span>
                      ) : (
                        <div className="seg-reach">{row.reach}</div>
                      )}
                    </td>
                    <td>
                      <div className="seg-date">{row.created}</div>
                    </td>
                    <td>
                      <div className="seg-creator">{row.createdBy}</div>
                    </td>
                    <td style={{ width: 180, maxWidth: 180 }}>
                      {row.usedIn.length > 0 ? (
                        <span
                          title={row.usedIn.join("\n")}
                          style={{
                            fontSize: 12.5,
                            color: "var(--crm-fg2)",
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            cursor: "default",
                          }}
                        >
                          {row.usedIn.slice(0, 3).join(", ")}
                          {row.usedIn.length > 3 && (
                            <span
                              style={{
                                color: "var(--crm-blue)",
                                fontWeight: 500,
                                marginLeft: 4,
                              }}
                            >
                              +{row.usedIn.length - 3} more
                            </span>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: "var(--crm-fg4)", fontSize: 12 }}>
                          —
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="seg-row-actions">
                        <button
                          style={{ display: "none" }}
                          className="seg-row-btn"
                          type="button"
                          onClick={() => handleViewUsers(row)}
                        >
                          Users
                        </button>
                        <button
                          className="seg-row-btn"
                          type="button"
                          onClick={() => handleEdit(row.id)}
                        >
                          Edit
                        </button>
                        <button
                          className="seg-row-btn delete"
                          type="button"
                          onClick={() => handleDeleteClick(row.id, row.name)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {filtered.length > PAGE_SIZE && (
          <div className="seg-players-pager">
            <span className="pager-info">
              {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="pager-controls">
              <button
                className="pager-btn"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 1}
              >
                ‹
              </button>
              {pageNumbers().map((n, i) =>
                n === "…" ? (
                  <span key={`e${i}`} className="pager-ellipsis">
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    className={"pager-btn" + (page === n ? " active" : "")}
                    onClick={() => setPage(n as number)}
                  >
                    {n}
                  </button>
                ),
              )}
              <button
                className="pager-btn"
                onClick={() => setPage((p) => p + 1)}
                disabled={page === totalPages}
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upload history modal */}
      {historySegment && (
        <SegmentUploadHistory
          segment={historySegment}
          onClose={() => setHistorySegment(null)}
          onReuploaded={() => dispatch(fetchSegments(brandId))}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteSegmentModal
          segmentName={deleteTarget.name}
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {/* Add / Edit Segment modal */}
      {modalConfig && (
        <AddSegmentModal
          mode={modalConfig.mode}
          segmentId={modalConfig.segmentId}
          onClose={() => setModalConfig(null)}
          onSaved={() => {
            setModalConfig(null);
            dispatch(fetchSegments(brandId));
          }}
          brandId={brandId}
        />
      )}

      {/* View segment users modal */}
      {viewUsersRow && (
        <SegmentUsersModal
          segment={{
            id: viewUsersRow.id,
            label: viewUsersRow.name,
            name: viewUsersRow.name,
            count: viewUsersRow.rawCount,
          }}
          onClose={() => setViewUsersRow(null)}
        />
      )}
    </div>
  );
}
