'use client';
import { useState, useEffect, useCallback } from 'react';
import Icon from '../Icon';
import EmptyState from '../EmptyState';
import { formatINRCompact } from '../../utils';
import {
  fetchUserEvents,
  fetchPlayerBonusTransactions,
  fetchPlayerBonusTxnDetail,
} from '../../services/playerActivityApi';
import type {
  UserEvent,
  BonusTxnSummary,
  TxnDetailResponse,
  TxnDetailType,
  GrantTxnDetail,
  ChunkDetail,
} from '../../services/playerActivityApi';

function _relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

function _fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function _num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
}

function _amt(v: string | number | null | undefined): string {
  return formatINRCompact(_num(v));
}

const _TXN_TYPE_MAP: Record<string, TxnDetailType> = {
  GRANT: 'GRANT',
  RELEASE: 'RELEASE',
  CONSUME: 'CONSUME',
  EXPIRY: 'EXPIRY',
  FORFEIT: 'FORFEIT',
};

interface PlayerActivitySectionProps {
  userId: string;
  brandId?: string | null;
  showBonus?: boolean;
  siteId?: string | number | null;
}

export default function PlayerActivitySection({ userId, brandId, showBonus = false, siteId }: PlayerActivitySectionProps) {
  const [tab, setTab] = useState<'activity' | 'bonus'>('activity');

  // Recent Activity (ClickHouse events)
  const [events, setEvents] = useState<UserEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);

  // Bonus transactions
  const [txns, setTxns] = useState<BonusTxnSummary[]>([]);
  const [txnsLoaded, setTxnsLoaded] = useState(false);
  const [txnsLoading, setTxnsLoading] = useState(false);
  const [txnsError, setTxnsError] = useState(false);
  const [detail, setDetail] = useState<TxnDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setTab('activity');
    setEvents([]); setEventsError(false); setHasMore(false); setNextCursor(null);
    setTxns([]); setTxnsLoaded(false); setTxnsError(false);
    setDetail(null); setDetailLoading(false);
    if (!userId) return;
    let cancelled = false;
    setEventsLoading(true);
    fetchUserEvents(userId, brandId ? { brandId } : undefined)
      .then(page => {
        if (cancelled) return;
        setEvents(page.events);
        setHasMore(page.has_more);
        setNextCursor(page.next_cursor);
      })
      .catch(() => { if (!cancelled) setEventsError(true); })
      .finally(() => { if (!cancelled) setEventsLoading(false); });
    return () => { cancelled = true; };
  }, [userId, brandId]);

  const loadMoreEvents = useCallback(() => {
    if (!userId || !nextCursor || moreLoading) return;
    setMoreLoading(true);
    fetchUserEvents(userId, { before: nextCursor, brandId: brandId || undefined })
      .then(page => {
        setEvents(prev => [...prev, ...page.events]);
        setHasMore(page.has_more);
        setNextCursor(page.next_cursor);
      })
      .catch(() => setEventsError(true))
      .finally(() => setMoreLoading(false));
  }, [userId, brandId, nextCursor, moreLoading]);

  useEffect(() => {
    if (tab !== 'bonus' || txnsLoaded || !userId || siteId == null) return;
    let cancelled = false;
    setTxnsLoading(true);
    fetchPlayerBonusTransactions(userId, siteId)
      .then(list => { if (!cancelled) { setTxns(list); setTxnsLoaded(true); } })
      .catch(() => { if (!cancelled) setTxnsError(true); })
      .finally(() => { if (!cancelled) setTxnsLoading(false); });
    return () => { cancelled = true; };
  }, [tab, txnsLoaded, userId, siteId]);

  const openTxnDetail = useCallback((txn: BonusTxnSummary) => {
    const type = _TXN_TYPE_MAP[txn.type];
    if (!type || siteId == null) return;
    setDetailLoading(true);
    fetchPlayerBonusTxnDetail(userId, siteId, txn.txn_id, type)
      .then(d => setDetail(d))
      .catch(() => setTxnsError(true))
      .finally(() => setDetailLoading(false));
  }, [userId, siteId]);

  return (
    <>
      {showBonus ? (
        <div className="modal-tabs" style={{ marginLeft: 0, alignSelf: 'flex-start' }}>
          <button className={'modal-tab' + (tab === 'activity' ? ' active' : '')} onClick={() => setTab('activity')}>
            <Icon name="activity" size={13}/> Recent Activity
          </button>
          <button className={'modal-tab' + (tab === 'bonus' ? ' active' : '')} onClick={() => { setTab('bonus'); setDetail(null); }}>
            <Icon name="gift" size={13}/> Bonus
          </button>
        </div>
      ) : (
        <div className="player-section-label">Recent Activity</div>
      )}

      {tab === 'activity' && (
        <EventsList
          events={events}
          loading={eventsLoading}
          error={eventsError}
          hasMore={hasMore}
          moreLoading={moreLoading}
          onMore={loadMoreEvents}
        />
      )}

      {tab === 'bonus' && showBonus && (
        detail || detailLoading ? (
          <TxnDetailView detail={detail} loading={detailLoading} onBack={() => setDetail(null)} />
        ) : (
          <BonusTxnList
            txns={txns}
            loading={txnsLoading}
            error={txnsError}
            unavailable={siteId == null}
            onOpen={openTxnDetail}
          />
        )
      )}
    </>
  );
}

// ── Recent Activity (events) ──────────────────────────────────────────────────

function EventsList({ events, loading, error, hasMore, moreLoading, onMore }: {
  events: UserEvent[];
  loading: boolean;
  error: boolean;
  hasMore: boolean;
  moreLoading: boolean;
  onMore: () => void;
}) {
  if (loading) return <div className="player-list-note">Loading events…</div>;
  if (error && events.length === 0) return <EmptyState icon="alert-circle" label="Couldn't load events" hint="Try again later"/>;
  if (events.length === 0) return <EmptyState icon="activity" label="No recent events" hint="No events found for this player"/>;
  return (
    <div className="player-bonuses">
      {events.map(e => (
        <div key={e.event_id} className="player-event-row">
          <Icon name="zap" size={14} color="var(--blue)"/>
          <div>
            <div className="b-name">{e.event_name}</div>
            <div className="b-meta">
              {_relTime(e.timestamp)}
              {e.platform ? ' · ' + e.platform : ''}
              {e.device_type ? ' · ' + e.device_type : ''}
            </div>
          </div>
          {e.amount != null && (
            <span className="b-amount">{_amt(e.amount)}{e.currency && e.currency !== 'INR' ? ' ' + e.currency : ''}</span>
          )}
        </div>
      ))}
      {hasMore && (
        <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'center' }} onClick={onMore} disabled={moreLoading}>
          <Icon name="chevron-down" size={12}/> {moreLoading ? 'Loading…' : 'Show more'}
        </button>
      )}
    </div>
  );
}

// ── Bonus: transaction list ───────────────────────────────────────────────────

function BonusTxnList({ txns, loading, error, unavailable, onOpen }: {
  txns: BonusTxnSummary[];
  loading: boolean;
  error: boolean;
  unavailable: boolean;
  onOpen: (txn: BonusTxnSummary) => void;
}) {
  if (unavailable) return <EmptyState icon="gift" label="Bonus data unavailable" hint="No site selected"/>;
  if (loading) return <div className="player-list-note">Loading bonus transactions…</div>;
  if (error && txns.length === 0) return <EmptyState icon="alert-circle" label="Couldn't load bonus transactions" hint="Try again later"/>;
  if (txns.length === 0) return <EmptyState icon="gift" label="No bonus transactions" hint="No bonus activity for this player"/>;
  return (
    <div className="player-bonuses">
      {txns.map(t => (
        <div key={t.type + '-' + t.txn_id} className="player-txn-card" onClick={() => onOpen(t)} role="button" tabIndex={0}>
          <div className="player-txn-head">
            <Icon name="gift" size={14} color="var(--blue)"/>
            <div>
              <div className="b-name">{t.bonus_code || 'Bonus'}</div>
              <div className="b-meta">{_fmtDate(t.created_at)}</div>
            </div>
            <span className={'b-status ' + t.type}>{t.type}</span>
            <Icon name="chevron-right" size={14} color="var(--g400)"/>
          </div>
          {t.type === 'GRANT' ? (
            <div className="txn-amounts-grid">
              <div><span className="label">Granted</span><span className="val">{_amt(t.amount)}</span></div>
              <div><span className="label">Released</span><span className="val" style={{ color: 'var(--ok)' }}>{_amt(t.release_amount)}</span></div>
              <div><span className="label">Consumed</span><span className="val" style={{ color: 'var(--blue)' }}>{_amt(t.consumed_amount)}</span></div>
              <div><span className="label">Exp + Forf</span><span className="val" style={{ color: 'var(--g500)' }}>{formatINRCompact(_num(t.expiry_amount) + _num(t.forfeit_amount))}</span></div>
            </div>
          ) : (
            <div className="txn-amounts-grid single">
              <div><span className="label">Amount</span><span className="val">{_amt(t.amount)}</span></div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Bonus: transaction detail ─────────────────────────────────────────────────

function MetaRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="kv"><span className="k">{k}</span><span className="v">{children}</span></div>
  );
}

function TxnDetailView({ detail, loading, onBack }: {
  detail: TxnDetailResponse | null;
  loading: boolean;
  onBack: () => void;
}) {
  return (
    <div className="player-bonuses">
      <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        <Icon name="arrow-left" size={12}/> Back to transactions
      </button>
      {loading || !detail ? (
        <div className="player-list-note">Loading transaction detail…</div>
      ) : detail.type === 'GRANT' ? (
        <GrantDetailView d={detail}/>
      ) : (
        <SimpleDetailView d={detail}/>
      )}
    </div>
  );
}

function GrantDetailView({ d }: { d: GrantTxnDetail }) {
  const expired = d.expiry_events.reduce((s, e) => s + _num(e.amount), 0);
  return (
    <>
      <div className="player-txn-card static">
        <div className="player-txn-head">
          <Icon name="gift" size={14} color="var(--blue)"/>
          <div>
            <div className="b-name">{d.bonus_code || 'Bonus grant'}</div>
            <div className="b-meta">{_fmtDate(d.created_at)}</div>
          </div>
          <span className={'b-status ' + d.status}>{d.status}</span>
        </div>
        <div className="txn-amounts-grid five">
          <div><span className="label">Granted</span><span className="val">{_amt(d.grant_amount)}</span></div>
          <div><span className="label">Released</span><span className="val" style={{ color: 'var(--ok)' }}>{_amt(d.release_amount)}</span></div>
          <div><span className="label">Consumed</span><span className="val" style={{ color: 'var(--blue)' }}>{_amt(d.bonus_consumed)}</span></div>
          <div><span className="label">Expired</span><span className="val" style={{ color: 'var(--g500)' }}>{formatINRCompact(expired)}</span></div>
          <div><span className="label">Forfeited</span><span className="val" style={{ color: 'var(--warn)' }}>{_amt(d.forfeit?.amount)}</span></div>
        </div>
        <div className="player-info-grid">
          <MetaRow k="Chip">{d.wager_chip_type} → {d.credit_chip_type}</MetaRow>
          <MetaRow k="Chunks">{d.no_of_chunks}</MetaRow>
          <MetaRow k="Wager multiplier">{d.wager_multiplier}×</MetaRow>
          <MetaRow k="Granted">{_fmtDate(d.created_at)}</MetaRow>
          {d.bonus_expiry_days != null && <MetaRow k="Bonus expiry">{d.bonus_expiry_days} days</MetaRow>}
          {d.chunk_expiry_days != null && <MetaRow k="Chunk expiry">{d.chunk_expiry_days} days</MetaRow>}
        </div>
      </div>
      {d.chunks.map(c => <ChunkCard key={c.id} c={c}/>)}
    </>
  );
}

function ChunkCard({ c }: { c: ChunkDetail }) {
  const required = _num(c.required_wager_amount);
  const wagered = _num(c.wager_amount);
  const pct = required > 0 ? Math.min(100, Math.round((wagered / required) * 100)) : 0;
  return (
    <div className="player-txn-card static chunk-card">
      <div className="player-txn-head">
        <Icon name="layers" size={14} color="var(--g500)"/>
        <div>
          <div className="b-name">{c.chunk_ref}</div>
          <div className="b-meta">Chunk · {_amt(c.chunk_amount)}</div>
        </div>
        <span className={'b-status ' + c.status}>{c.status}</span>
      </div>
      <div className="wager-progress">
        <div className="track"><div className="fill" style={{ width: pct + '%' }}/></div>
        <div className="b-meta">Wagered {_amt(wagered)} of {_amt(required)} ({pct}%)</div>
      </div>
      {c.releases.map(r => (
        <div key={'r' + r.id} className="chunk-event-row">
          <Icon name="check-circle" size={12} color="var(--ok)"/>
          <span className="b-meta">Release · {_fmtDate(r.created_at)}</span>
          <span className="b-amount">{_amt(r.release_amount)}</span>
        </div>
      ))}
      {c.consumes.map(ev => (
        <div key={'c' + ev.id} className="chunk-event-row">
          <Icon name="minus-circle" size={12} color="var(--blue)"/>
          <span className="b-meta">Consume · {_fmtDate(ev.created_at)}</span>
          <span className="b-amount">{_amt(ev.consumed_amount)}</span>
        </div>
      ))}
    </div>
  );
}

function SimpleDetailView({ d }: { d: Exclude<TxnDetailResponse, GrantTxnDetail> }) {
  return (
    <div className="player-txn-card static">
      <div className="player-txn-head">
        <Icon name="gift" size={14} color="var(--blue)"/>
        <div>
          <div className="b-name">{d.type}</div>
          <div className="b-meta">
            {'created_at' in d ? _fmtDate(d.created_at)
              : d.type === 'EXPIRY' ? _fmtDate(d.expired_at)
              : _fmtDate(d.forfeited_at)}
          </div>
        </div>
        <span className={'b-status ' + d.type}>{d.type}</span>
      </div>
      <div className="player-info-grid">
        {d.type === 'RELEASE' && (<>
          <MetaRow k="Wager ref">{d.wager_ref}</MetaRow>
          <MetaRow k="Wager amount">{_amt(d.wager_amount)}</MetaRow>
          <MetaRow k="Released">{_amt(d.release_amount)}</MetaRow>
          {d.game_name && <MetaRow k="Game">{d.game_name}</MetaRow>}
          {d.product && <MetaRow k="Product">{d.product}</MetaRow>}
        </>)}
        {d.type === 'CONSUME' && (<>
          {d.wager_ref && <MetaRow k="Wager ref">{d.wager_ref}</MetaRow>}
          <MetaRow k="Amount">{_amt(d.amount)}</MetaRow>
          <MetaRow k="Consumed">{_amt(d.consumed_amount)}</MetaRow>
          {d.game_name && <MetaRow k="Game">{d.game_name}</MetaRow>}
          {d.product && <MetaRow k="Product">{d.product}</MetaRow>}
        </>)}
        {d.type === 'EXPIRY' && (<>
          <MetaRow k="Chunk">{d.chunk_ref}</MetaRow>
          <MetaRow k="Amount">{_amt(d.amount)}</MetaRow>
          <MetaRow k="Expiry type">{d.expiry_type}</MetaRow>
          {d.operator && <MetaRow k="Operator">{d.operator}</MetaRow>}
        </>)}
        {d.type === 'FORFEIT' && (<>
          <MetaRow k="Requested">{_amt(d.requested_amount)}</MetaRow>
          <MetaRow k="Forfeited">{_amt(d.amount)}</MetaRow>
          <MetaRow k="Forfeit type">{d.forfeit_type}</MetaRow>
          {d.operator && <MetaRow k="Operator">{d.operator}</MetaRow>}
        </>)}
      </div>
      {(d.type === 'RELEASE' || d.type === 'CONSUME') && d.chunks.length > 0 && d.chunks.map(c => (
        <div key={c.id} className="chunk-event-row">
          <Icon name="layers" size={12} color="var(--g500)"/>
          <span className="b-meta">{c.chunk_ref}</span>
          <span className="b-amount">{'release_amount' in c ? _amt(c.release_amount) : _amt(c.consumed_amount)}</span>
        </div>
      ))}
    </div>
  );
}
