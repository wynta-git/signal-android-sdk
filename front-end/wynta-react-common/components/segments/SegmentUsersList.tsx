"use client";
import { useState, useEffect, useCallback } from "react";
import Icon from "../Icon";
import { fetchSegmentUsers } from "../../services/pamUsersApi";
import type { PamUser, SegmentUserPage } from "../../services/pamUsersApi";
import type { Segment } from "../../types";

export function _initials(name: string): string {
  return name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
export function _tierClass(t: string): string {
  return "tier-" + t.toLowerCase().replace(/\s+/g, "-");
}
export function _kycClass(k: string): string {
  return "kyc-" + k.toLowerCase();
}

function displayName(u: PamUser): string {
  const { first_name, last_name } = u.traits;
  const name = [first_name, last_name].filter(Boolean).join(" ").trim();
  return name || u.user_id;
}

function formatJoinedAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface SegmentUsersListProps {
  segment: Segment;
  onPickPlayer?: (userId: string, brandId: string | null) => void;
}

export default function SegmentUsersList({
  segment,
  onPickPlayer,
}: SegmentUsersListProps) {
  const [page, setPage] = useState<SegmentUserPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allUsers, setAllUsers] = useState<PamUser[]>([]);

  const segId = String(segment.id);

  const load = useCallback(
    async (nextCursor?: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchSegmentUsers(segId, nextCursor);
        setPage(result);
        if (nextCursor) {
          setAllUsers((prev) => [...prev, ...result.users]);
        } else {
          setAllUsers(result.users);
        }
        setCursor(result.next_cursor ?? undefined);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load users");
      } finally {
        setLoading(false);
      }
    },
    [segId],
  );

  useEffect(() => {
    setAllUsers([]);
    setCursor(undefined);
    setPage(null);
    load(undefined);
  }, [segId]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = segment.count;

  return (
    <div className="seg-players">
      <div className="seg-players-toolbar">
        <div className="meta">
          {total != null
            ? `${total.toLocaleString("en-IN")} users in segment`
            : "Loading…"}
        </div>
      </div>

      {error ? (
        <div className="seg-players-empty" style={{ color: "var(--red)" }}>
          <Icon name="alert-circle" size={16} /> {error}
        </div>
      ) : allUsers.length === 0 && !loading ? (
        <div className="seg-players-empty">No users in this segment yet.</div>
      ) : (
        <table className="seg-players-table">
          <thead>
            <tr>
              <th />
              <th>User</th>
              <th>Pam ID</th>
              <th>Joined</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {allUsers.map((u) => (
              <tr
                key={u.user_id}
                onClick={() => onPickPlayer?.(u.user_id, u.brand_id)}
                style={{ cursor: onPickPlayer ? "pointer" : "default" }}
              >
                <td>
                  <span className="avatar">{_initials(displayName(u))}</span>
                </td>
                <td>
                  <div className="ident">
                    <div className="name">{displayName(u)}</div>
                    <div className="email">{u.user_id}</div>
                  </div>
                </td>
                <td className="pid">{u.pam_id ?? "—"}</td>
                <td className="last-login" title={u.joined_at ?? undefined}>
                  {formatJoinedAt(u.joined_at)}
                </td>
                <td>
                  <Icon name="chevron-right" size={14} color="var(--g300)" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {loading && (
        <div className="seg-players-empty">
          <Icon name="loader" size={16} color="var(--g400)" /> Loading…
        </div>
      )}

      {!loading && page?.has_more && (
        <div className="seg-players-pager">
          <button className="btn btn-ghost btn-sm" onClick={() => load(cursor)}>
            Load more
          </button>
          <span className="pager-info">
            Showing {allUsers.length.toLocaleString("en-IN")}
            {total != null ? ` of ${total.toLocaleString("en-IN")}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
