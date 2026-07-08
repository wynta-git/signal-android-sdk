'use client';
import { useState, useMemo, useRef, useEffect } from 'react';
import Icon from 'wynta-react-common/components/Icon';
import SearchResultRow, { type SearchResultItem } from './SearchResultRow';
import PlayerProfileModal from 'wynta-react-common/components/segments/PlayerProfileModal';
import SegmentUsersModal from 'wynta-react-common/components/segments/SegmentUsersModal';
import { MOCK_HEADS } from '../../services/mocks/heads';
import { MOCK_SUBHEADS } from '../../services/mocks/subheads';
import { MOCK_CONFIGURES } from '../../services/mocks/configures';
import { MANUAL_SEGMENTS } from '../../services/mocks/constants';
import { makePAMUserById, getGlobalPAMUserPool } from '../../services/api';
import { useAppSelector } from '../../store/hooks';
import type { PAMUser, Segment, SelectedNode } from '../../types';

interface SearchGroup {
  kind: string;
  label: string;
  items: SearchResultItem[];
}

function buildSearchResults(q: string): SearchGroup[] {
  const out: SearchGroup[] = [
    { kind: 'pam_user',  label: 'Players',         items: [] },
    { kind: 'segment', label: 'Player Segments',  items: [] },
    { kind: 'code',    label: 'Promo Codes',      items: [] },
    { kind: 'config',  label: 'Bonus Configs',    items: [] },
  ];
  if (!q) return out;
  const needle = q.toLowerCase();
  const isNum = /^\d+$/.test(q) && q.length >= 3;

  // Players
  if (isNum) {
    out[0].items.push({ kind: 'pam_user', payload: makePAMUserById(parseInt(q, 10)) });
  } else {
    const pool = getGlobalPAMUserPool() as PAMUser[];
    for (const p of pool) {
      if (
        p.name.toLowerCase().includes(needle) ||
        p.email.toLowerCase().includes(needle) ||
        String(p.id).includes(q)
      ) {
        out[0].items.push({ kind: 'pam_user', payload: p });
        if (out[0].items.length >= 5) break;
      }
    }
  }

  // Segments
  for (const s of MANUAL_SEGMENTS as Segment[]) {
    if (s.label!.toLowerCase().includes(needle) || (s.hint || '').toLowerCase().includes(needle) || String(s.id).toLowerCase().includes(needle)) {
      out[1].items.push({ kind: 'segment', payload: s });
      if (out[1].items.length >= 5) break;
    }
  }

  // Promo codes (scan all configures)
  outer: for (const cid in MOCK_CONFIGURES) {
    const cfg = MOCK_CONFIGURES[cid];
    if (!cfg.codes) continue;
    for (const code of cfg.codes) {
      if (code.code && typeof code.code === 'string' && code.code.toLowerCase().includes(needle)) {
        out[2].items.push({ kind: 'code', payload: { id: code.id, code: code.code }, parentId: cfg.id, parentName: cfg.name });
        if (out[2].items.length >= 5) break outer;
      }
    }
  }

  // Bonus configs — heads, subheads, configures
  for (const hid in MOCK_HEADS) {
    const h = MOCK_HEADS[hid];
    if (h.name.toLowerCase().includes(needle)) {
      out[3].items.push({ kind: 'head', payload: h, crumb: 'Bonus head' });
      if (out[3].items.length >= 8) break;
    }
  }
  if (out[3].items.length < 8) {
    for (const sid in MOCK_SUBHEADS) {
      const s = MOCK_SUBHEADS[sid];
      if (s.name.toLowerCase().includes(needle)) {
        out[3].items.push({ kind: 'subhead', payload: s, crumb: s.parent_head_name });
        if (out[3].items.length >= 8) break;
      }
    }
  }
  if (out[3].items.length < 8) {
    for (const cid in MOCK_CONFIGURES) {
      const c = MOCK_CONFIGURES[cid];
      if (c.name.toLowerCase().includes(needle)) {
        const sub = MOCK_SUBHEADS[c.subhead_id];
        const crumb = sub ? (sub.parent_head_name + ' › ' + sub.name) : 'Configure';
        out[3].items.push({ kind: 'configure', payload: c, crumb });
        if (out[3].items.length >= 8) break;
      }
    }
  }

  return out;
}

interface GlobalSearchProps {
  onSelectNode: (node: SelectedNode) => void;
}

export default function GlobalSearch({ onSelectNode }: GlobalSearchProps) {
  const [query, setQuery]               = useState('');
  const [open, setOpen]                 = useState(false);
  const [activeIdx, setActiveIdx]       = useState(0);
  const [profilePAMUser, setProfilePAMUser] = useState<PAMUser | null>(null);
  const [viewSegment, setViewSegment]   = useState<Segment | null>(null);
  const selectedBrand = useAppSelector((s) => s.ui.selectedBrand);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const q = query.trim();
  const results = useMemo(() => buildSearchResults(q), [q]);
  const flatResults = useMemo(() => results.flatMap(g => g.items), [results]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  const runResult = (r: SearchResultItem) => {
    setOpen(false);
    setQuery('');
    if (r.kind === 'pam_user')         setProfilePAMUser(r.payload as PAMUser);
    else if (r.kind === 'segment')   setViewSegment(r.payload as Segment);
    else if (r.kind === 'code') {
      onSelectNode({ type: 'configure', id: r.parentId! });
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('wynta:highlight-code', { detail: { codeId: (r.payload as { id: string | number }).id } }));
      }, 80);
    }
    else if (r.kind === 'head')      onSelectNode({ type: 'head',      id: (r.payload as { id: number }).id });
    else if (r.kind === 'subhead')   onSelectNode({ type: 'subhead',   id: (r.payload as { id: number }).id });
    else if (r.kind === 'configure') onSelectNode({ type: 'configure', id: (r.payload as { id: number }).id });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (flatResults.length === 0) {
      if (e.key === 'Enter' && /^\d+$/.test(q) && q.length >= 3) {
        runResult({ kind: 'pam_user', payload: makePAMUserById(parseInt(q, 10)) });
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown')      { setActiveIdx(i => Math.min(flatResults.length - 1, i + 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp')   { setActiveIdx(i => Math.max(0, i - 1)); e.preventDefault(); }
    else if (e.key === 'Enter')     { runResult(flatResults[activeIdx]); e.preventDefault(); }
  };

  let runningIdx = -1;
  return (
    <div className="search" ref={ref}>
      <span className="search-icon"><Icon name="search" size={14}/></span>
      <input
        placeholder="Search players, segments, codes, configs…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { if (query) setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      {open && q && (
        <div className="gp-pop">
          {flatResults.length === 0 ? (
            <div className="gp-pop-empty">No matches for &ldquo;{q}&rdquo;</div>
          ) : (
            <>
              {results.map(group => group.items.length > 0 && (
                <div key={group.kind}>
                  <div className="gp-pop-header">
                    <span>{group.label}</span>
                    <span>{group.items.length}</span>
                  </div>
                  {group.items.map(item => {
                    runningIdx += 1;
                    const i = runningIdx;
                    const payload = item.payload as { id?: string | number; code?: string };
                    return (
                      <SearchResultRow
                        key={group.kind + ':' + (payload.id ?? payload.code ?? i)}
                        item={item}
                        active={i === activeIdx}
                        onHover={() => setActiveIdx(i)}
                        onClick={() => runResult(item)}
                      />
                    );
                  })}
                </div>
              ))}
              <div className="gp-pop-hint">
                <kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close
              </div>
            </>
          )}
        </div>
      )}
      {profilePAMUser && (
        <PlayerProfileModal
          player={profilePAMUser}
          segment={null}
          onClose={() => setProfilePAMUser(null)}
          showBonus
          siteId={selectedBrand}
        />
      )}
      {viewSegment && (
        <SegmentUsersModal
          segment={viewSegment}
          onClose={() => setViewSegment(null)}
          showBonus
          siteId={selectedBrand}
        />
      )}
    </div>
  );
}
