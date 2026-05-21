'use client';
import { useState, useMemo, useRef, useEffect } from 'react';
import Icon from 'wynta-react-common/components/Icon';
import PlayerProfileModal from 'wynta-react-common/components/segments/PlayerProfileModal';
import SegmentPlayersModal from 'wynta-react-common/components/segments/SegmentPlayersModal';
import { MANUAL_SEGMENTS, makePlayerById, getGlobalPlayerPool } from 'wynta-react-common/services/mocks/segments';
import type { Player, ManualSegment } from 'wynta-react-common/types';

type ResultItem =
  | { kind: 'player';  payload: Player }
  | { kind: 'segment'; payload: ManualSegment };

interface Group {
  kind: string;
  label: string;
  items: ResultItem[];
}

function _initials(name: string): string {
  return name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
}

function buildResults(q: string): Group[] {
  const out: Group[] = [
    { kind: 'player',  label: 'Players',        items: [] },
    { kind: 'segment', label: 'Player Segments', items: [] },
  ];
  if (!q) return out;
  const needle = q.toLowerCase();
  const isNum  = /^\d+$/.test(q) && q.length >= 3;

  if (isNum) {
    out[0].items.push({ kind: 'player', payload: makePlayerById(parseInt(q, 10)) });
  } else {
    for (const p of getGlobalPlayerPool()) {
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

  for (const s of MANUAL_SEGMENTS) {
    if (
      s.label.toLowerCase().includes(needle) ||
      s.hint.toLowerCase().includes(needle) ||
      String(s.id).toLowerCase().includes(needle)
    ) {
      out[1].items.push({ kind: 'segment', payload: s });
      if (out[1].items.length >= 5) break;
    }
  }

  return out;
}

export default function CrmSearch() {
  const [query, setQuery]             = useState('');
  const [open, setOpen]               = useState(false);
  const [activeIdx, setActiveIdx]     = useState(0);
  const [profilePlayer, setProfilePlayer] = useState<Player | null>(null);
  const [viewSegment, setViewSegment] = useState<ManualSegment | null>(null);
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
  const results     = useMemo(() => buildResults(q), [q]);
  const flatResults = useMemo(() => results.flatMap(g => g.items), [results]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  const runResult = (r: ResultItem) => {
    setOpen(false);
    setQuery('');
    if (r.kind === 'player')  setProfilePlayer(r.payload);
    if (r.kind === 'segment') setViewSegment(r.payload);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (flatResults.length === 0) {
      if (e.key === 'Enter' && /^\d+$/.test(q) && q.length >= 3) {
        runResult({ kind: 'player', payload: makePlayerById(parseInt(q, 10)) });
        e.preventDefault();
      }
      return;
    }
    if      (e.key === 'ArrowDown') { setActiveIdx(i => Math.min(flatResults.length - 1, i + 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp')   { setActiveIdx(i => Math.max(0, i - 1)); e.preventDefault(); }
    else if (e.key === 'Enter')     { runResult(flatResults[activeIdx]); e.preventDefault(); }
  };

  let runningIdx = -1;

  return (
    <div className="search" ref={ref}>
      <span className="search-icon"><Icon name="search" size={14}/></span>
      <input
        placeholder="Search players, segments…"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
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
                    const cls = 'gp-pop-item' + (i === activeIdx ? ' active' : '');
                    if (item.kind === 'player') {
                      const p = item.payload;
                      return (
                        <div key={'player:' + p.id} className={cls}
                          onMouseEnter={() => setActiveIdx(i)} onClick={() => runResult(item)}>
                          <span className="avatar">{_initials(p.name)}</span>
                          <div className="ident">
                            <div className="name">{p.name}</div>
                            <div className="sub">{p.email} · {p.state}</div>
                          </div>
                          <span className="pid">#{p.id}</span>
                        </div>
                      );
                    }
                    const s = item.payload;
                    return (
                      <div key={'seg:' + s.id} className={cls}
                        onMouseEnter={() => setActiveIdx(i)} onClick={() => runResult(item)}>
                        <span className="gp-mark seg"><Icon name="users" size={13}/></span>
                        <div className="ident">
                          <div className="name">{s.label}</div>
                          <div className="sub">{s.hint}</div>
                        </div>
                        <span className="pid">{s.count.toLocaleString('en-IN')}</span>
                      </div>
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
        <PlayerProfileModal player={profilePlayer} segment={null} onClose={() => setProfilePlayer(null)} />
      )}
      {viewSegment && (
        <SegmentPlayersModal segment={viewSegment} onClose={() => setViewSegment(null)} />
      )}
    </div>
  );
}
