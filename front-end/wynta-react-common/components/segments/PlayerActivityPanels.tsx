'use client';
import { useState, useEffect, useCallback } from 'react';
import Icon from '../Icon';
import EmptyState from '../EmptyState';
import { formatINRCompact } from '../../utils';
import {
  fetchUserEvents,
  fetchPlayerBonusSummary,
  fetchPlayerBonusTransactions,
  fetchPlayerBonusTxnDetail,
} from '../../services/playerActivityApi';
import type {
  UserEvent,
  BonusSummaryEntry,
  BonusTxnSummary,
  TxnDetailResponse,
  TxnDetailType,
  GrantTxnDetail,
  ChunkDetail,
} from '../../services/playerActivityApi';

interface EventMeta {
  icon: string;
  color: string;
  bg: string;
}

const _EVENT_META: Array<{ match: RegExp } & EventMeta> = [
  { match: /deposit|purchase|payment/, icon: 'wallet', color: 'var(--ok)', bg: 'rgba(16,185,129,0.13)' },
  { match: /withdraw|cashout/, icon: 'arrow-up-right', color: 'var(--warn)', bg: 'rgba(245,158,11,0.13)' },
  { match: /bet|wager|game/, icon: 'target', color: 'var(--warn)', bg: 'rgba(245,158,11,0.13)' },
  { match: /bonus|reward|gift|promo/, icon: 'gift', color: 'var(--blue)', bg: 'rgba(0,145,224,0.13)' },
  { match: /app_open|session/, icon: 'smartphone', color: 'var(--blue)', bg: 'rgba(0,145,224,0.13)' },
  { match: /screen|page|view/, icon: 'eye', color: 'var(--g500)', bg: 'var(--g100)' },
  { match: /identif|register|signup|login|kyc/, icon: 'user-check', color: 'var(--blue)', bg: 'rgba(0,145,224,0.13)' },
  { match: /email|mail/, icon: 'mail', color: 'var(--blue)', bg: 'rgba(0,145,224,0.13)' },
  { match: /notification|push|sms/, icon: 'bell', color: 'var(--g500)', bg: 'var(--g100)' },
];

const _DEFAULT_EVENT_META: EventMeta = { icon: 'zap', color: 'var(--blue)', bg: 'rgba(0,145,224,0.13)' };

function _eventMeta(eventName: string): EventMeta {
  const n = eventName.toLowerCase();
  return _EVENT_META.find(m => m.match.test(n)) ?? _DEFAULT_EVENT_META;
}

function _friendlyName(eventName: string): string {
  return eventName
    .split(/[_\s]+/)
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function _dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function _dateAtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return `${date} at ${time}`;
}

function _groupByDay(events: UserEvent[]): Array<{ label: string; items: UserEvent[] }> {
  const groups: Array<{ label: string; items: UserEvent[] }> = [];
  for (const e of events) {
    const label = _dayLabel(e.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(e);
    else groups.push({ label, items: [e] });
  }
  return groups;
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

// Bonus transaction amounts are exact monetary values (not large aggregate
// stats), so always show 2 decimals instead of compacting to k/L/Cr.
function _bonusAmt(v: string | number | null | undefined): string {
  return '₹' + _num(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Maps the lowercase (sometimes past-tense) `type` values returned by the
// transactions list endpoint to the uppercase type expected by the
// transaction-detail endpoint's `type` query param.
const _TXN_TYPE_MAP: Record<string, TxnDetailType> = {
  grant: 'GRANT',
  released: 'RELEASE',
  consumed: 'CONSUME',
  expiry: 'EXPIRY',
  forfeited: 'FORFEIT',
};

const _TXN_ICON: Record<string, { icon: string; color: string }> = {
  grant: { icon: 'gift', color: 'var(--blue)' },
  released: { icon: 'arrow-up-right', color: 'var(--ok)' },
  consumed: { icon: 'arrow-down-right', color: 'var(--blue)' },
  expiry: { icon: 'clock', color: 'var(--warn)' },
  forfeited: { icon: 'alert-triangle', color: 'var(--err)' },
};
const _DEFAULT_TXN_ICON = { icon: 'gift', color: 'var(--blue)' };

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

  // Bonus transactions + wallet summary
  const [txns, setTxns] = useState<BonusTxnSummary[]>([]);
  const [summary, setSummary] = useState<BonusSummaryEntry[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [txnsLoaded, setTxnsLoaded] = useState(false);
  const [txnsLoading, setTxnsLoading] = useState(false);
  const [txnsError, setTxnsError] = useState(false);
  const [detail, setDetail] = useState<TxnDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setTab('activity');
    setEvents([]); setEventsError(false); setHasMore(false); setNextCursor(null);
    setTxns([]); setSummary([]); setSummaryLoaded(false); setSummaryLoading(false); setTxnsLoaded(false); setTxnsError(false);
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

  // Independent from the transactions effect above — if it shared txnsLoaded
  // as a dependency, transactions finishing first would retrigger this effect,
  // orphaning the in-flight summary fetch and leaving summaryLoading stuck true.
  useEffect(() => {
    if (tab !== 'bonus' || summaryLoaded || !userId || siteId == null) return;
    let cancelled = false;
    setSummaryLoading(true);
    fetchPlayerBonusSummary(userId, siteId)
      .then(entries => { if (!cancelled) setSummary(entries); })
      .catch(() => {})
      .finally(() => { if (!cancelled) { setSummaryLoading(false); setSummaryLoaded(true); } });
    return () => { cancelled = true; };
  }, [tab, summaryLoaded, userId, siteId]);

  const openTxnById = useCallback((txnId: number, type: TxnDetailType) => {
    if (siteId == null) return;
    setDetailLoading(true);
    fetchPlayerBonusTxnDetail(userId, siteId, txnId, type)
      .then(d => setDetail(d))
      .catch(() => setTxnsError(true))
      .finally(() => setDetailLoading(false));
  }, [userId, siteId]);

  const openTxnDetail = useCallback((txn: BonusTxnSummary) => {
    const type = _TXN_TYPE_MAP[txn.type.toLowerCase()];
    if (!type) return;
    openTxnById(txn.txn_id, type);
  }, [openTxnById]);

  const openGrantDetail = useCallback((grantId: number) => {
    openTxnById(grantId, 'GRANT');
  }, [openTxnById]);

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
          <TxnDetailView detail={detail} loading={detailLoading} onBack={() => setDetail(null)} onOpenGrant={openGrantDetail} />
        ) : (
          <>
            <div className="player-section-label">Wallet Summary</div>
            <BonusSummaryStrip entries={summary} loading={summaryLoading} loaded={summaryLoaded}/>
            <div className="player-section-label">Transactions</div>
            <BonusTxnList
              txns={txns}
              loading={txnsLoading}
              error={txnsError}
              unavailable={siteId == null}
              onOpen={openTxnDetail}
            />
          </>
        )
      )}
    </>
  );
}

// ── Recent Activity (events) ──────────────────────────────────────────────────

function _rawEventData(e: UserEvent): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    event_id: e.event_id,
    event_name: e.event_name,
    timestamp: e.timestamp,
    session_id: e.session_id,
    platform: e.platform,
    device_type: e.device_type,
    amount: e.amount,
    currency: e.currency,
    ...(e.properties ?? {}),
  };
  return Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== null && v !== undefined && v !== '')
  );
}

function EventsList({ events, loading, error, hasMore, moreLoading, onMore }: {
  events: UserEvent[];
  loading: boolean;
  error: boolean;
  hasMore: boolean;
  moreLoading: boolean;
  onMore: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (loading) return <div className="player-list-note">Loading events…</div>;
  if (error && events.length === 0) return <EmptyState icon="alert-circle" label="Couldn't load events" hint="Try again later"/>;
  if (events.length === 0) return <EmptyState icon="activity" label="No recent events" hint="No events found for this player"/>;

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const groups = _groupByDay(events);
  return (
    <div className="activity-timeline">
      {groups.map((g, gi) => (
        <div key={g.label} className="at-group">
          {!(gi === 0 && g.label === 'Today') && <div className="at-day">{g.label}</div>}
          <div className="at-items">
            {g.items.map(e => {
              const m = _eventMeta(e.event_name);
              const isOpen = expanded.has(e.event_id);
              return (
                <div key={e.event_id} className="at-item">
                  <div
                    className="at-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => toggle(e.event_id)}
                    onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(e.event_id); } }}
                  >
                    <span className="at-icon">
                      <Icon name={m.icon} size={17}/>
                    </span>
                    <div className="at-body">
                      <div className="at-time">{_dateAtTime(e.timestamp)}</div>
                      <div className="at-text">
                        <span className="evt">{_friendlyName(e.event_name)}</span>
                        {e.amount != null && (
                          <span className="amt"> {_amt(e.amount)}{e.currency && e.currency !== 'INR' ? ' ' + e.currency : ''}</span>
                        )}
                        {(e.platform || e.device_type) && (
                          <span className="tail">
                            {e.platform ? ' · ' + e.platform : ''}
                            {e.device_type ? ' · ' + e.device_type : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={'at-arrow' + (isOpen ? ' open' : '')}>
                      <Icon name="arrow-right" size={15} color="var(--blue)"/>
                    </span>
                  </div>
                  {isOpen && (
                    <pre className="at-raw">{JSON.stringify(_rawEventData(e), null, 2)}</pre>
                  )}
                </div>
              );
            })}
          </div>
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

// ── Bonus: wallet summary strip ───────────────────────────────────────────────

function BonusSummaryStrip({ entries, loading, loaded }: {
  entries: BonusSummaryEntry[];
  loading: boolean;
  loaded: boolean;
}) {
  if (loading) return <div className="player-list-note">Loading wallet summary…</div>;
  if (loaded && entries.length === 0) {
    return <EmptyState icon="wallet" label="No wallet summary" hint="No bonus wallet found for this player"/>;
  }
  if (entries.length === 0) return null;
  const s = entries.find(e => e.chip_type === 'cash') ?? entries[0];
  const required = _num(s.wagering_required);
  const done = _num(s.wagering_done);
  const pct = required > 0 ? Math.min(100, Math.round((done / required) * 100)) : 0;
  return (
    <div className="player-stats">
      <div className="player-stat-tile">
        <div className="label">Bonus Balance</div>
        <div className="value">{_bonusAmt(s.bonus_balance)}</div>
      </div>
      <div className="player-stat-tile">
        <div className="label">Pending Bonus</div>
        <div className="value">{_bonusAmt(s.pending_bonus)}</div>
      </div>
      <div className="player-stat-tile">
        <div className="label">Wagering Required</div>
        <div className="value">{_bonusAmt(s.wagering_required)}</div>
      </div>
      <div className="player-stat-tile">
        <div className="label">Wagering Done</div>
        <div className="value">{_bonusAmt(s.wagering_done)}</div>
        <div className="sub">{pct}% complete</div>
      </div>
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
      {txns.map(t => {
        const rawType = t.type.toLowerCase();
        const isGrant = rawType === 'grant';
        const ic = _TXN_ICON[rawType] ?? _DEFAULT_TXN_ICON;
        return (
          <div key={t.type + '-' + t.txn_id} className="player-txn-card" onClick={() => onOpen(t)} role="button" tabIndex={0}>
            {isGrant ? (
              <>
                {t.bonus_code && <div className="txn-code">{t.bonus_code}</div>}
                <div className="txn-row-top">
                  <span className={'b-status ' + t.type.toUpperCase()}>{t.type.toUpperCase()}</span>
                  <div className="txn-row-right">
                    <span className="txn-date">{_fmtDate(t.created_at)}</span>
                    <Icon name="chevron-right" size={14} color="var(--g400)"/>
                  </div>
                </div>
                <div className="txn-amounts-grid">
                  <div className="amt-cell"><span className="label">Granted</span><span className="val">{_bonusAmt(t.amount)}</span></div>
                  <div className="amt-cell"><span className="label">Released</span><span className="val" style={{ color: 'var(--ok)' }}>{_bonusAmt(t.release_amount)}</span></div>
                  <div className="amt-cell"><span className="label">Consumed</span><span className="val" style={{ color: 'var(--blue)' }}>{_bonusAmt(t.consumed_amount)}</span></div>
                  <div className="amt-cell"><span className="label">Exp + Forf</span><span className="val" style={{ color: 'var(--g500)' }}>{_bonusAmt(_num(t.expiry_amount) + _num(t.forfeit_amount))}</span></div>
                </div>
              </>
            ) : (
              <div className="txn-row-simple">
                <div>
                  <span className={'b-status ' + t.type.toUpperCase()}>{t.type.toUpperCase()}</span>
                  <div className="txn-date">{_fmtDate(t.created_at)}</div>
                </div>
                <div className="txn-row-right">
                  <span className="txn-amount-lg" style={{ color: ic.color }}>{_bonusAmt(t.amount)}</span>
                  <Icon name="chevron-right" size={14} color="var(--g400)"/>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Bonus: transaction detail ─────────────────────────────────────────────────

function MetaCard({ items }: { items: Array<{ k: string; v: React.ReactNode }> }) {
  return (
    <div className="meta-card">
      {items.map(({ k, v }) => (
        <div key={k} className="item">
          <span className="k">{k}</span>
          <span className="v">{v}</span>
        </div>
      ))}
    </div>
  );
}

function TxnDetailView({ detail, loading, onBack, onOpenGrant }: {
  detail: TxnDetailResponse | null;
  loading: boolean;
  onBack: () => void;
  onOpenGrant: (grantId: number) => void;
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
        <SimpleDetailView d={detail} onOpenGrant={onOpenGrant}/>
      )}
    </div>
  );
}

function GrantDetailView({ d }: { d: GrantTxnDetail }) {
  const expired = d.expiry_events.reduce((s, e) => s + _num(e.amount), 0);
  return (
    <>
      <div className="txn-detail-head">
        <span className="td-title">{d.bonus_code || 'Bonus grant'}</span>
        <span className={'b-status ' + d.status}>{d.status}</span>
      </div>
      <div className="amounts-card">
        <div className="col"><span className="val">{_bonusAmt(d.grant_amount)}</span><span className="label">Granted</span></div>
        <div className="col"><span className="val" style={{ color: 'var(--ok)' }}>{_bonusAmt(d.release_amount)}</span><span className="label">Released</span></div>
        <div className="col"><span className="val" style={{ color: 'var(--blue)' }}>{_bonusAmt(d.bonus_consumed)}</span><span className="label">Consumed</span></div>
        <div className="col"><span className="val" style={{ color: 'var(--warn)' }}>{_bonusAmt(expired)}</span><span className="label">Expired</span></div>
        <div className="col"><span className="val" style={{ color: 'var(--err)' }}>{_bonusAmt(d.forfeit?.amount)}</span><span className="label">Forfeited</span></div>
      </div>
      <MetaCard items={[
        { k: 'Chip', v: `${d.wager_chip_type} → ${d.credit_chip_type}` },
        { k: 'Chunks', v: d.no_of_chunks },
        { k: 'Wager multiplier', v: `${d.wager_multiplier}×` },
        { k: 'Granted', v: _fmtDate(d.created_at) },
        ...(d.bonus_expiry_days != null ? [{ k: 'Bonus expiry', v: `${d.bonus_expiry_days} days` }] : []),
        ...(d.chunk_expiry_days != null ? [{ k: 'Chunk expiry', v: `${d.chunk_expiry_days} days` }] : []),
      ]}/>

      {d.forfeit && (
        <div className="bonus-alert danger">
          <div className="bonus-alert-head">
            <span className="bah-label"><Icon name="alert-triangle" size={14} color="var(--err)"/> Forfeited</span>
            <span className="bah-date">{_fmtDate(d.forfeit.forfeited_at)}</span>
          </div>
          <div className="bonus-alert-inline">
            <span><span className="k">Requested</span><span className="v">{_bonusAmt(d.forfeit.requested_amount)}</span></span>
            <span><span className="k">Forfeited</span><span className="v" style={{ color: 'var(--err)' }}>{_bonusAmt(d.forfeit.amount)}</span></span>
            <span className="v">[{d.forfeit.type}]</span>
            {d.forfeit.operator && <span className="k">by {d.forfeit.operator}</span>}
          </div>
        </div>
      )}

      {d.expiry_events.length > 0 && (
        <div className="bonus-alert warn">
          <div className="bonus-alert-head">
            <span className="bah-label"><Icon name="clock" size={14} color="var(--warn)"/> Chunk Expiry Events ({d.expiry_events.length})</span>
          </div>
          {d.expiry_events.map(ev => (
            <div key={ev.id} className="bonus-alert-row">
              <span className="k">Chunk #{ev.chunk_id} · {_fmtDate(ev.expired_at)}</span>
              <span className="v" style={{ color: 'var(--warn)' }}>−{_bonusAmt(ev.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="player-section-label">Chunks ({d.chunks.length})</div>
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
      <div className="chunk-card-head">
        <div><span className="amt">{_bonusAmt(c.chunk_amount)}</span><span className="ref">{c.chunk_ref}</span></div>
        <span className={'b-status ' + c.status}>{c.status}</span>
      </div>
      <div className="wager-progress">
        <div className="b-meta">Wagered {_bonusAmt(wagered)} of {_bonusAmt(required)} ({pct}%)</div>
        <div className="track"><div className="fill" style={{ width: pct + '%' }}/></div>
      </div>
      {c.releases.length > 0 && (
        <div className="chunk-subgroup">
          <div className="chunk-subgroup-label" style={{ color: 'var(--ok)' }}>
            <Icon name="arrow-up-right" size={12} color="var(--ok)"/> Releases ({c.releases.length})
          </div>
          {c.releases.map(r => (
            <div key={'r' + r.id} className="chunk-event-card release">
              <div className="line1"><span className="ref">{r.wager_ref}</span><span className="date">{_fmtDate(r.created_at)}</span></div>
              <div className="line2">
                <span className="wager">Wager {_bonusAmt(r.wager_amount)}</span>
                <span className="amt" style={{ color: 'var(--ok)' }}>+{_bonusAmt(r.release_amount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {c.consumes.length > 0 && (
        <div className="chunk-subgroup">
          <div className="chunk-subgroup-label" style={{ color: 'var(--blue)' }}>
            <Icon name="arrow-down-right" size={12} color="var(--blue)"/> Consumed ({c.consumes.length})
          </div>
          {c.consumes.map(ev => (
            <div key={'c' + ev.id} className="chunk-event-card consume">
              <div className="line1"><span className="ref">{ev.consumed_ref}</span><span className="date">{_fmtDate(ev.created_at)}</span></div>
              <div className="line2">
                <span className="wager">Wager {_bonusAmt(ev.wager_amount)}</span>
                <span className="amt" style={{ color: 'var(--blue)' }}>−{_bonusAmt(ev.consumed_amount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniChunkCard({ chunkRef, amount, amountColor, sign, wagerAmount, grantId, onOpenGrant }: {
  chunkRef: string;
  amount: string;
  amountColor: string;
  sign: '+' | '−';
  wagerAmount?: string;
  grantId: number;
  onOpenGrant: (grantId: number) => void;
}) {
  return (
    <div className="mini-chunk-card">
      <div className="row1">
        <span className="ref">{chunkRef}</span>
        <span className="amt" style={{ color: amountColor }}>{sign}{_bonusAmt(amount)}</span>
      </div>
      <div className="row2">
        {wagerAmount != null ? <span className="wager-note">Wagered {_bonusAmt(wagerAmount)}</span> : <span/>}
        <button className="chunk-view-grant" onClick={() => onOpenGrant(grantId)}>
          Grant #{grantId} <Icon name="arrow-right" size={11} color="var(--blue)"/>
        </button>
      </div>
    </div>
  );
}

function SimpleDetailView({ d, onOpenGrant }: {
  d: Exclude<TxnDetailResponse, GrantTxnDetail>;
  onOpenGrant: (grantId: number) => void;
}) {
  if (d.type === 'RELEASE') {
    return (
      <>
        <div className="txn-detail-head">
          <span className="td-title">Release #{d.id}</span>
        </div>
        <div className="amounts-card">
          <div className="col"><span className="val">{_bonusAmt(d.wager_amount)}</span><span className="label">Wagered</span></div>
          <div className="col"><span className="val" style={{ color: 'var(--ok)' }}>{_bonusAmt(d.release_amount)}</span><span className="label">Released</span></div>
        </div>
        <MetaCard items={[
          { k: 'Wager ref', v: d.wager_ref },
          { k: 'Chip', v: d.chip_type ?? '—' },
          { k: 'Product', v: d.product ?? '—' },
          { k: 'Game type', v: d.game_type ?? '—' },
          { k: 'Date', v: _fmtDate(d.created_at) },
        ]}/>
        <div className="player-section-label">Chunks Released ({d.chunks.length})</div>
        {d.chunks.map(c => (
          <MiniChunkCard
            key={c.id} chunkRef={c.chunk_ref} amount={c.release_amount}
            amountColor="var(--ok)" sign="+" wagerAmount={c.wager_amount}
            grantId={c.bonus_grant_id} onOpenGrant={onOpenGrant}
          />
        ))}
      </>
    );
  }

  if (d.type === 'CONSUME') {
    return (
      <>
        <div className="txn-detail-head">
          <span className="td-title">Consume #{d.id}</span>
        </div>
        <div className="amounts-card">
          <div className="col"><span className="val">{_bonusAmt(d.amount)}</span><span className="label">Requested</span></div>
          <div className="col"><span className="val" style={{ color: 'var(--blue)' }}>{_bonusAmt(d.consumed_amount)}</span><span className="label">Consumed</span></div>
          <div className="col"><span className="val">{_bonusAmt(d.wager_amount)}</span><span className="label">Wager</span></div>
        </div>
        <MetaCard items={[
          { k: 'Wager ref', v: d.wager_ref ?? '—' },
          { k: 'Chip', v: d.chip_type ?? '—' },
          { k: 'Game', v: d.game_name ?? d.product ?? '—' },
          { k: 'Date', v: _fmtDate(d.created_at) },
        ]}/>
        <div className="player-section-label">Chunks Used ({d.chunks.length})</div>
        {d.chunks.map(c => (
          <MiniChunkCard
            key={c.id} chunkRef={c.chunk_ref} amount={c.consumed_amount}
            amountColor="var(--blue)" sign="−"
            grantId={c.bonus_grant_id} onOpenGrant={onOpenGrant}
          />
        ))}
      </>
    );
  }

  if (d.type === 'EXPIRY') {
    return (
      <div className="bonus-alert warn">
        <div className="bonus-alert-head">
          <span className="bah-label"><Icon name="clock" size={14} color="var(--warn)"/> Chunk Expiry</span>
          <span className="bah-date">{_fmtDate(d.expired_at)}</span>
        </div>
        <div className="bonus-alert-inline">
          <span><span className="k">Expired</span><span className="v" style={{ color: 'var(--warn)' }}>{_bonusAmt(d.amount)}</span></span>
        </div>
        <div className="bonus-alert-row"><span className="k">Chunk ref</span><span className="v">{d.chunk_ref}</span></div>
        <div className="bonus-alert-row"><span className="k">Type</span><span className="v">{d.expiry_type}</span></div>
        {d.operator && <div className="bonus-alert-row"><span className="k">Operator</span><span className="v">{d.operator}</span></div>}
      </div>
    );
  }

  // FORFEIT
  return (
    <div className="bonus-alert danger">
      <div className="bonus-alert-head">
        <span className="bah-label"><Icon name="alert-triangle" size={14} color="var(--err)"/> Bonus Forfeited</span>
        <span className="bah-date">{_fmtDate(d.forfeited_at)}</span>
      </div>
      <div className="bonus-alert-inline">
        <span><span className="k">Requested</span><span className="v">{_bonusAmt(d.requested_amount)}</span></span>
        <span><span className="k">Forfeited</span><span className="v" style={{ color: 'var(--err)' }}>{_bonusAmt(d.amount)}</span></span>
        <span className="v">[{d.forfeit_type}]</span>
        {d.operator && <span className="k">by {d.operator}</span>}
      </div>
    </div>
  );
}
