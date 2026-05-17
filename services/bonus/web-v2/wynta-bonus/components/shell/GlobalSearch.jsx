'use client';
import { useState, useMemo, useRef, useEffect } from 'react';
import Icon from '@/components/primitives/Icon';
import SearchResultRow from './SearchResultRow';
import PlayerProfileModal from '@/components/segments/PlayerProfileModal';
import SegmentPlayersModal from '@/components/segments/SegmentPlayersModal';
import { MOCK_HEADS } from '@/services/mocks/heads';
import { MOCK_SUBHEADS } from '@/services/mocks/subheads';
import { MOCK_CONFIGURES } from '@/services/mocks/configures';
import { MANUAL_SEGMENTS } from '@/services/mocks/constants';
import { makePlayerById, getGlobalPlayerPool } from '@/services/api';

function buildSearchResults(q) {
  const out = [
    { kind: 'player',  label: 'Players',         items: [] },
    { kind: 'segment', label: 'Player Segments',  items: [] },
    { kind: 'code',    label: 'Promo Codes',      items: [] },
    { kind: 'config',  label: 'Bonus Configs',    items: [] },
  ];
  if (!q) return out;
  const needle = q.toLowerCase();
  const isNum = /^\d+$/.test(q) && q.length >= 3;

  // Players
  if (isNum) {
    out[0].items.push({ kind: 'player', payload: makePlayerById(parseInt(q, 10)) });
  } else {
    const pool = getGlobalPlayerPool();
    for (const p of pool) {
      if (
        p.name.toLowerCase().includes(needle) ||
        p.email.toLowerCase().includes(needle) ||
        String(p.id).includes(q)
      ) {
        out[0].items.push({ kind: 'player', payload: p });
        if (out[0].items.length >= 5) break;
      }
    }
  }

  // Segments
  for (const s of MANUAL_SEGMENTS) {
    if (s.label.toLowerCase().includes(needle) || (s.hint || '').toLowerCase().includes(needle) || s.id.toLowerCase().includes(needle)) {
      out[1].items.push({ kind: 'segment', payload: s });
      if (out[1].items.length >= 5) break;
    }
  }

  // Promo codes (scan all configures)
  outer: for (const cid in MOCK_CONFIGURES) {
    const cfg = MOCK_CONFIGURES[cid];
    if (!cfg.codes) continue;
    for (const code of cfg.codes) {
      if (code.code && code.code.toLowerCase().includes(needle)) {
        out[2].items.push({ kind: 'code', payload: code, parentId: cfg.id, parentName: cfg.name });
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

export default function GlobalSearch({ onSelectNode }) {
  const [query, setQuery]               = useState('');
  const [open, setOpen]                 = useState(false);
  const [activeIdx, setActiveIdx]       = useState(0);
  const [profilePlayer, setProfilePlayer] = useState(null);
  const [viewSegment, setViewSegment]   = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const q = query.trim();
  const results = useMemo(() => buildSearchResults(q), [q]);
  const flatResults = useMemo(() => results.flatMap(g => g.items), [results]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  const runResult = (r) => {
    setOpen(false);
    setQuery('');
    if (r.kind === 'player')         setProfilePlayer(r.payload);
    else if (r.kind === 'segment')   setViewSegment(r.payload);
    else if (r.kind === 'code') {
      onSelectNode && onSelectNode({ type: 'configure', id: r.parentId });
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('wynta:highlight-code', { detail: { codeId: r.payload.id } }));
      }, 80);
    }
    else if (r.kind === 'head')      onSelectNode && onSelectNode({ type: 'head',      id: r.payload.id });
    else if (r.kind === 'subhead')   onSelectNode && onSelectNode({ type: 'subhead',   id: r.payload.id });
    else if (r.kind === 'configure') onSelectNode && onSelectNode({ type: 'configure', id: r.payload.id });
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (flatResults.length === 0) {
      if (e.key === 'Enter' && /^\d+$/.test(q) && q.length >= 3) {
        runResult({ kind: 'player', payload: makePlayerById(parseInt(q, 10)) });
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
                    return (
                      <SearchResultRow
                        key={group.kind + ':' + (item.payload.id ?? item.payload.code ?? i)}
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
      {profilePlayer && (
        <PlayerProfileModal
          player={profilePlayer}
          segment={null}
          onClose={() => setProfilePlayer(null)}
        />
      )}
      {viewSegment && (
        <SegmentPlayersModal
          segment={viewSegment}
          onClose={() => setViewSegment(null)}
        />
      )}
    </div>
  );
}
