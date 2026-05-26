'use client';
import { useState, useEffect, useCallback } from 'react';
import Icon from '../Icon';
import { fetchSegmentMembers } from '../../services/segmentApi';
import type { SegmentMember, MemberPage } from '../../services/segmentApi';
import type { Segment } from '../../types';

export function _initials(name: string): string { return name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase(); }
export function _tierClass(t: string): string   { return 'tier-' + t.toLowerCase().replace(/\s+/g, '-'); }
export function _kycClass(k: string): string    { return 'kyc-' + k.toLowerCase(); }

function formatJoinedAt(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface SegmentPlayersListProps {
  segment: Segment;
  onPickPlayer?: (userId: string) => void;
}

export default function SegmentPlayersList({ segment, onPickPlayer }: SegmentPlayersListProps) {
  const [page, setPage]           = useState<MemberPage | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [cursor, setCursor]       = useState<string | undefined>(undefined);
  const [allMembers, setAllMembers] = useState<SegmentMember[]>([]);

  const segId = String(segment.id);

  const load = useCallback(async (nextCursor?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSegmentMembers(segId, nextCursor);
      setPage(result);
      if (nextCursor) {
        setAllMembers(prev => [...prev, ...result.members]);
      } else {
        setAllMembers(result.members);
      }
      setCursor(result.next_cursor ?? undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [segId]);

  useEffect(() => {
    setAllMembers([]);
    setCursor(undefined);
    setPage(null);
    load(undefined);
  }, [segId]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = page?.total_members ?? segment.count;

  return (
    <div className="seg-players">
      <div className="seg-players-toolbar">
        <div className="meta">
          {total != null
            ? `${total.toLocaleString('en-IN')} players in segment`
            : 'Loading…'}
        </div>
      </div>

      <div className="seg-players-thead">
        <span>User ID</span>
        <span>Joined segment</span>
      </div>

      {error ? (
        <div className="seg-players-empty" style={{ color: 'var(--red)' }}>
          <Icon name="alert-circle" size={16}/> {error}
        </div>
      ) : allMembers.length === 0 && !loading ? (
        <div className="seg-players-empty">No members in this segment yet.</div>
      ) : (
        allMembers.map(m => (
          <div
            key={m.user_id}
            className="seg-players-row"
            onClick={() => onPickPlayer?.(m.user_id)}
            style={{ cursor: onPickPlayer ? 'pointer' : 'default' }}
          >
            <div className="ident">
              <div className="name">{m.user_id}</div>
            </div>
            <span className="last-login" title={m.joined_at}>
              {formatJoinedAt(m.joined_at)}
            </span>
          </div>
        ))
      )}

      {loading && (
        <div className="seg-players-empty">
          <Icon name="loader" size={16} color="var(--g400)"/> Loading…
        </div>
      )}

      {!loading && page?.has_more && (
        <div className="seg-players-pager">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => load(cursor)}
          >
            Load more
          </button>
          <span className="pager-info">
            Showing {allMembers.length.toLocaleString('en-IN')}
            {total != null ? ` of ${total.toLocaleString('en-IN')}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
