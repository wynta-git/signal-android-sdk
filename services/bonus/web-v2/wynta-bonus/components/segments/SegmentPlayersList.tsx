'use client';
import { useState, useMemo, useEffect } from 'react';
import Icon from '@/components/primitives/Icon';
import Pager from '@/components/primitives/Pager';
import { formatINRCompact } from '@/services/mocks/utils';
import {
  PLAYER_FIRST_NAMES, PLAYER_LAST_NAMES, PLAYER_STATES,
  PLAYER_TIERS, PLAYER_KYC, PLAYER_PRODUCTS,
  PLAYERS_PAGE_SIZE, PLAYERS_SEARCH_CAP,
} from '@/services/mocks/constants';
import type { Segment, Player } from '@/types';

// ── Deterministic player generation ────────────────────────────────────────────

function _strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function _seedRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 1 | s);
    s ^= s + Math.imul(s ^ (s >>> 7), 61 | s);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

function makePlayer(segmentId: string, index: number): Player {
  const r = _seedRng(_strHash(segmentId + ':' + index));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(r() * arr.length)];
  const fn = pick(PLAYER_FIRST_NAMES as string[]);
  const ln = pick(PLAYER_LAST_NAMES as string[]);
  const id = 10000 + Math.floor(r() * 89999);
  const name = `${fn} ${ln}`;
  const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${Math.floor(r() * 99)}@wynta.in`;
  const state = pick(PLAYER_STATES as string[]);
  const tier = pick(PLAYER_TIERS as string[]);
  const kyc = pick(PLAYER_KYC as string[]);
  const lifetimeDep = Math.floor((r() * 200000 + 1000) / 100) * 100;
  const lifetimeWager = Math.round(lifetimeDep * (3 + r() * 8));
  const lifetimeGgr = Math.round(lifetimeWager * (0.03 + r() * 0.07));
  const totalBonuses = Math.floor(r() * 28);
  const sessions7 = Math.floor(r() * 28);
  const daysAgoReg = Math.floor(r() * 720) + 1;
  const daysAgoLogin = Math.floor(r() * 30);
  const product = pick(PLAYER_PRODUCTS as string[]);
  const phone = '+91 ' + (60000 + Math.floor(r() * 39999)) + ' ' + (10000 + Math.floor(r() * 89999));
  return { id, name, email, phone, state, country: 'India', tier, kyc, lifetimeDep, lifetimeWager, lifetimeGgr, totalBonuses, sessions7, daysAgoReg, daysAgoLogin, product };
}

export function _initials(name: string): string { return name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase(); }
export function _tierClass(t: string): string   { return 'tier-' + t.toLowerCase().replace(/\s+/g, '-'); }
export function _kycClass(k: string): string    { return 'kyc-' + k.toLowerCase(); }

// ─────────────────────────────────────────────────────────────────────────────

interface SegmentPlayersListProps {
  segment: Segment;
  onPickPlayer: (p: Player) => void;
}

export default function SegmentPlayersList({ segment, onPickPlayer }: SegmentPlayersListProps) {
  const [query, setQuery] = useState('');
  const [page, setPage]   = useState(1);
  const total = segment.count;
  const segId = String(segment.id);

  const searchPool = useMemo<Player[] | null>(() => {
    if (!query) return null;
    const cap = Math.min(total, PLAYERS_SEARCH_CAP as number);
    const out: Player[] = [];
    for (let i = 0; i < cap; i++) out.push(makePlayer(segId, i));
    return out;
  }, [segId, query ? '_' : '']); // eslint-disable-line

  useEffect(() => { setPage(1); }, [segId, query]);

  const q = query.trim().toLowerCase();
  let slice: Player[], filteredTotal: number, pageTotal: number, scopeNote: string;
  if (q && searchPool) {
    const matches = searchPool.filter(p =>
      p.name.toLowerCase().includes(q) ||
      String(p.id).includes(q) ||
      p.email.toLowerCase().includes(q)
    );
    filteredTotal = matches.length;
    pageTotal = Math.max(1, Math.ceil(filteredTotal / (PLAYERS_PAGE_SIZE as number)));
    const safe = Math.min(page, pageTotal);
    slice = matches.slice((safe - 1) * (PLAYERS_PAGE_SIZE as number), safe * (PLAYERS_PAGE_SIZE as number));
    scopeNote = total > (PLAYERS_SEARCH_CAP as number)
      ? ` · searched first ${(PLAYERS_SEARCH_CAP as number).toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')}`
      : '';
  } else {
    filteredTotal = total;
    pageTotal = Math.max(1, Math.ceil(total / (PLAYERS_PAGE_SIZE as number)));
    const safe = Math.min(page, pageTotal);
    const startIdx = (safe - 1) * (PLAYERS_PAGE_SIZE as number);
    const endIdx = Math.min(startIdx + (PLAYERS_PAGE_SIZE as number), total);
    slice = [];
    for (let i = startIdx; i < endIdx; i++) slice.push(makePlayer(segId, i));
    scopeNote = '';
  }

  const safePage = Math.min(page, pageTotal);
  const startIdx = (safePage - 1) * (PLAYERS_PAGE_SIZE as number);
  const endIdx = Math.min(startIdx + slice.length, filteredTotal);

  return (
    <div className="seg-players">
      <div className="seg-players-toolbar">
        <div className="seg-players-search">
          <Icon name="search" size={13} color="var(--g400)"/>
          <input
            type="text"
            placeholder="Search players by name, ID, or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="modal-search-clear" onClick={() => setQuery('')} title="Clear">
              <Icon name="x" size={11}/>
            </button>
          )}
        </div>
        <div className="meta">
          {q
            ? `${filteredTotal.toLocaleString('en-IN')} match${filteredTotal === 1 ? '' : 'es'}${scopeNote}`
            : `${total.toLocaleString('en-IN')} players in segment`}
        </div>
      </div>

      <div className="seg-players-thead">
        <span></span>
        <span>Player</span>
        <span>ID</span>
        <span>State</span>
        <span>Tier</span>
        <span>KYC</span>
        <span style={{ textAlign: 'right' }}>Lifetime Dep.</span>
        <span style={{ textAlign: 'right' }}>Last Seen</span>
      </div>

      {slice.length === 0 ? (
        <div className="seg-players-empty">No players match &ldquo;{query}&rdquo;</div>
      ) : slice.map(p => (
        <div key={p.id} className="seg-players-row" onClick={() => onPickPlayer(p)}>
          <span className="avatar">{_initials(p.name)}</span>
          <div className="ident">
            <div className="name">{p.name}</div>
            <div className="email">{p.email}</div>
          </div>
          <span className="pid">#{p.id}</span>
          <span className="state">{p.state}</span>
          <span className={'tier-badge ' + _tierClass(p.tier)}>{p.tier}</span>
          <span className={'kyc-badge ' + _kycClass(p.kyc)}>{p.kyc}</span>
          <span className="num" style={{ textAlign: 'right' }}>{formatINRCompact(p.lifetimeDep)}</span>
          <span className="last-login" style={{ textAlign: 'right' }}>
            {p.daysAgoLogin === 0 ? 'today' : p.daysAgoLogin + 'd ago'}
          </span>
        </div>
      ))}

      {pageTotal > 1 && (
        <div className="seg-players-pager">
          <div className="pager-info">
            {filteredTotal === 0
              ? 'No results'
              : `Showing ${(startIdx + 1).toLocaleString('en-IN')}–${endIdx.toLocaleString('en-IN')} of ${filteredTotal.toLocaleString('en-IN')}`}
          </div>
          <Pager page={safePage} pageTotal={pageTotal} onChange={setPage}/>
        </div>
      )}
    </div>
  );
}
