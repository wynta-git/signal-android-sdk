'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

type Screen = 'LOGIN' | 'DEPOSIT' | 'PROCESSING' | 'WALLET' | 'TRANSACTIONS' | 'TXN_DETAIL';

interface Creds {
  userId: string;
  clientId: string;
  secret: string;
  apiToken: string;
}

interface PromoCode {
  promo_id: number;
  code: string;
  display_title: string | null;
  display_description: string | null;
  badge_text: string | null;
  cta_text: string | null;
  max_amount: string | null;
  wager_multiplier: string;
  no_of_chunks: number;
  min_display_amount: string | null;
  auto_apply: boolean;
}

interface BonusSummary {
  chip_type: string;
  bonus_balance: string;
  pending_bonus: string;
  wagering_required: string;
}

interface Transaction {
  txn_id: number;
  bonus_code: string | null;
  amount: string;
  type: string;
  created_at: string;
}

interface ChunkDetail {
  id: number;
  chunk_amount: string;
  status: string;
  required_wager_amount: string;
  wager_amount: string;
}

interface TransactionDetail {
  txn_id: number;
  bonus_code: string | null;
  grant_amount: string;
  release_amount: string;
  bonus_consumed: string;
  status: string;
  wager_multiplier: string;
  no_of_chunks: number;
  chunks: ChunkDetail[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function s2sHeaders(creds: Creds): HeadersInit {
  return {
    'x-s2s-client-id': creds.clientId,
    'x-s2s-client-secret': creds.secret,
  };
}

function fmt(val: string | number): string {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return isNaN(n) ? '0.00' : n.toFixed(2);
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ── Shared components ──────────────────────────────────────────────────────────

function Spinner() {
  return <div className="spinner" />;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ACTIVE:   { bg: '#0a280a', color: '#6ee7b7' },
  active:   { bg: '#0a280a', color: '#6ee7b7' },
  PENDING:  { bg: '#281800', color: '#fbbf24' },
  pending:  { bg: '#281800', color: '#fbbf24' },
  EXPIRED:  { bg: '#280a0a', color: '#f87171' },
  expired:  { bg: '#280a0a', color: '#f87171' },
  FORFEITED:{ bg: '#280a0a', color: '#f87171' },
  RELEASE:  { bg: '#0a1a38', color: '#93c5fd' },
  GRANT:    { bg: '#18082a', color: '#c4b5fd' },
  CONSUMED: { bg: '#18082a', color: '#c4b5fd' },
  CONSUMED_PARTIALLY: { bg: '#18082a', color: '#a78bfa' },
  REVERT:   { bg: '#1c1208', color: '#d97706' },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { bg: '#1e2030', color: '#64748b' };
  return (
    <span
      className="status-badge"
      style={{ background: c.bg, color: c.color }}
    >
      {status}
    </span>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${pct.toFixed(1)}%` }} />
    </div>
  );
}

// ── Screen 1: LOGIN ────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (c: Creds) => void }) {
  const [userId, setUserId] = useState('P1001');
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [apiToken, setApiToken] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId.trim() || !clientId.trim() || !secret.trim() || !apiToken.trim()) return;
    onLogin({ userId: userId.trim(), clientId: clientId.trim(), secret: secret.trim(), apiToken: apiToken.trim() });
  }

  return (
    <div className="screen">
      <div className="screen-header login-header">
        <div className="app-icon">🎰</div>
        <h1 className="app-title">Bonus Simulator</h1>
        <p className="app-subtitle">End-to-end player flow tester</p>
      </div>
      <div className="screen-body">
        <form onSubmit={handleSubmit}>
          <div className="section-label">Player</div>
          <div className="input-group">
            <label>Player ID (user_id)</label>
            <input
              value={userId}
              onChange={e => setUserId(e.target.value)}
              placeholder="P1001"
              autoCapitalize="none"
              required
            />
          </div>

          <div className="section-label" style={{ marginTop: 22 }}>Server-to-Server Credentials</div>
          <div className="input-group">
            <label>Client ID</label>
            <input
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder="game_server"
              autoCapitalize="none"
              required
            />
          </div>
          <div className="input-group">
            <label>Client Secret</label>
            <input
              type="password"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <div className="section-label" style={{ marginTop: 22 }}>Event API</div>
          <div className="input-group">
            <label>API Token (Bearer)</label>
            <input
              type="password"
              value={apiToken}
              onChange={e => setApiToken(e.target.value)}
              placeholder="pam_live_..."
              autoCapitalize="none"
              required
            />
          </div>

          <button type="submit" className="btn-primary" style={{ marginTop: 28 }}>
            Continue →
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Screen 2: DEPOSIT ──────────────────────────────────────────────────────────

function DepositScreen({
  creds,
  onDeposited,
}: {
  creds: Creds;
  onDeposited: () => void;
}) {
  const [amount, setAmount] = useState('500');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [selectedPromo, setSelectedPromo] = useState<PromoCode | null>(null);
  const [promosLoading, setPromosLoading] = useState(true);
  const [depositing, setDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/applicable-codes?user_id=${encodeURIComponent(creds.userId)}&chip_type=cash`,
          { headers: s2sHeaders(creds) },
        );
        if (res.ok) {
          const data = (await res.json()) as PromoCode[];
          setPromos(data);
          const autoApply = data.find(p => p.auto_apply);
          if (autoApply) setSelectedPromo(autoApply);
        }
      } catch {
        // show empty list
      }
      setPromosLoading(false);
    })();
  }, [creds]);

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (depositing || !amount) return;
    setDepositing(true);
    setError(null);
    try {
      const txnId = `dep_${creds.userId}_${Date.now()}`;
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-s2s-client-id': creds.clientId,
          'x-s2s-client-secret': creds.secret,
          'x-api-token': creds.apiToken,
        },
        body: JSON.stringify({
          user_id: creds.userId,
          amount: parseFloat(amount),
          currency: 'INR',
          payment_method: paymentMethod,
          transaction_id: txnId,
        }),
      });
      if (res.status === 202) {
        onDeposited();
      } else {
        const err = (await res.json()) as { detail?: string };
        setError(err?.detail ?? `Error ${res.status}`);
        setDepositing(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
      setDepositing(false);
    }
  }

  function togglePromo(p: PromoCode) {
    setSelectedPromo(prev => (prev?.promo_id === p.promo_id ? null : p));
  }

  return (
    <div className="screen">
      <div className="screen-header deposit-header">
        <div className="avatar">{creds.userId.slice(0, 2).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="header-user-id">{creds.userId}</div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>Make a Deposit</div>
        </div>
      </div>
      <div className="screen-body">
        {error && <div className="error-toast">{error}</div>}
        <form onSubmit={handleDeposit}>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">Deposit Details</div>
            <div className="input-row">
              <div className="input-group" style={{ flex: 2 }}>
                <label>Amount (₹)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  min="1"
                  step="1"
                  required
                />
              </div>
              <div className="input-group" style={{ flex: 1.6 }}>
                <label>Method</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="netbanking">Netbanking</option>
                  <option value="wallet">Wallet</option>
                </select>
              </div>
            </div>
          </div>

          <div className="section-label">Applicable Bonuses</div>

          {promosLoading ? (
            <div className="promo-skeleton">
              <div className="skeleton-line" />
              <div className="skeleton-line medium" />
              <div className="skeleton-line short" />
            </div>
          ) : promos.length === 0 ? (
            <div className="empty-state-small">No applicable bonuses for this account</div>
          ) : (
            <div className="promo-list">
              {promos.map(p => (
                <div
                  key={p.promo_id}
                  className={`promo-card ${selectedPromo?.promo_id === p.promo_id ? 'selected' : ''}`}
                  onClick={() => togglePromo(p)}
                >
                  <div className="promo-top">
                    {p.badge_text && <span className="promo-badge">{p.badge_text}</span>}
                    {p.auto_apply && <span className="promo-badge auto">Auto</span>}
                    <span className="promo-code">{p.code}</span>
                  </div>
                  <div className="promo-title">{p.display_title ?? p.code}</div>
                  {p.display_description && (
                    <div className="promo-desc">{p.display_description}</div>
                  )}
                  <div className="promo-meta">
                    {p.max_amount && <span>Up to ₹{fmt(p.max_amount)}</span>}
                    <span>{p.wager_multiplier}× wager · {p.no_of_chunks} chunk{p.no_of_chunks !== 1 ? 's' : ''}</span>
                    {p.cta_text && <span>{p.cta_text}</span>}
                  </div>
                  <div className={`promo-check ${selectedPromo?.promo_id === p.promo_id ? 'checked' : ''}`}>✓</div>
                </div>
              ))}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            style={{ marginTop: 24 }}
            disabled={depositing || !amount}
          >
            {depositing ? 'Processing…' : `Deposit ₹${amount || '0'}`}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Screen 3: PROCESSING ───────────────────────────────────────────────────────

function ProcessingScreen({
  creds,
  onDone,
}: {
  creds: Creds;
  onDone: (summary: BonusSummary[]) => void;
}) {
  const [status, setStatus] = useState('Processing your deposit…');
  const pollCount = useRef(0);
  const MAX_POLLS = 6;

  useEffect(() => {
    const interval = setInterval(async () => {
      pollCount.current += 1;
      setStatus(`Checking for bonus… (${pollCount.current}/${MAX_POLLS})`);
      try {
        const res = await fetch(
          `/api/summary/${encodeURIComponent(creds.userId)}`,
          { headers: s2sHeaders(creds) },
        );
        if (res.ok) {
          const data = (await res.json()) as BonusSummary[];
          const cash = data.find(d => d.chip_type === 'cash');
          const hasBonus =
            cash &&
            (parseFloat(cash.bonus_balance) > 0 || parseFloat(cash.pending_bonus) > 0);
          if (hasBonus || pollCount.current >= MAX_POLLS) {
            clearInterval(interval);
            onDone(data);
            return;
          }
        }
      } catch {
        // continue polling
      }
      if (pollCount.current >= MAX_POLLS) {
        clearInterval(interval);
        onDone([]);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [creds, onDone]);

  return (
    <div className="screen processing-screen">
      <div className="processing-content">
        <div className="big-spinner" />
        <div className="processing-title">Depositing…</div>
        <div className="processing-status">{status}</div>
      </div>
    </div>
  );
}

// ── Screen 4: WALLET ───────────────────────────────────────────────────────────

function WalletScreen({
  creds,
  summary,
  onTransactions,
}: {
  creds: Creds;
  summary: BonusSummary[];
  onTransactions: () => void;
}) {
  const hasAny = summary.length > 0;

  return (
    <div className="screen has-tabs">
      <div className="screen-header wallet-header">
        <div className="avatar small">{creds.userId.slice(0, 2).toUpperCase()}</div>
        <span className="header-label">Bonus Wallet</span>
      </div>
      <div className="screen-body">
        {!hasAny && (
          <div className="empty-state">
            <div className="empty-icon">🎁</div>
            <div className="empty-title">No Active Bonus</div>
            <div className="empty-desc">Make a deposit with an applicable promo code to unlock a bonus</div>
          </div>
        )}
        {summary.map(s => {
          const released = parseFloat(s.bonus_balance);
          const pending = parseFloat(s.pending_bonus);
          const total = released + pending;
          return (
            <div key={s.chip_type} className="wallet-card">
              <div className="wallet-card-header">
                <span className="chip-badge">
                  {s.chip_type === 'cash' ? '💵 Cash' : `🎮 ${s.chip_type}`}
                </span>
              </div>
              <div className="wallet-balance">₹{fmt(s.bonus_balance)}</div>
              <div className="wallet-balance-label">Available Bonus</div>
              <div className="wallet-row" style={{ marginBottom: 14 }}>
                <div className="wallet-stat">
                  <div className="wallet-stat-val">₹{fmt(s.pending_bonus)}</div>
                  <div className="wallet-stat-label">Pending</div>
                </div>
                <div className="wallet-stat">
                  <div className="wallet-stat-val">₹{fmt(s.wagering_required)}</div>
                  <div className="wallet-stat-label">Wager Req.</div>
                </div>
              </div>
              <div style={{ marginBottom: 6 }}>
                <ProgressBar value={released} max={total > 0 ? total : 1} />
              </div>
              <div style={{ fontSize: '0.65rem', color: '#334155', marginTop: 4 }}>
                {total > 0
                  ? `${((released / total) * 100).toFixed(0)}% released`
                  : 'No bonus balance'}
              </div>
            </div>
          );
        })}
      </div>
      <TabBar active="wallet" onTransactions={onTransactions} />
    </div>
  );
}

// ── Screen 5: TRANSACTIONS ─────────────────────────────────────────────────────

function TransactionsScreen({
  creds,
  onDetail,
  onWallet,
}: {
  creds: Creds;
  onDetail: (t: Transaction) => void;
  onWallet: () => void;
}) {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/transactions/${encodeURIComponent(creds.userId)}?chip_type=cash&limit=50`,
          { headers: s2sHeaders(creds) },
        );
        if (res.ok) setTxns((await res.json()) as Transaction[]);
      } catch {
        // show empty
      }
      setLoading(false);
    })();
  }, [creds]);

  return (
    <div className="screen has-tabs">
      <div className="screen-header txn-header">
        <div className="avatar small">{creds.userId.slice(0, 2).toUpperCase()}</div>
        <span className="header-label">Transactions</span>
      </div>
      <div className="screen-body">
        {loading && <Spinner />}
        {!loading && txns.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div className="empty-title">No Transactions</div>
            <div className="empty-desc">Your bonus transactions will appear here</div>
          </div>
        )}
        {txns.map(t => (
          <div key={t.txn_id} className="txn-row" onClick={() => onDetail(t)}>
            <div className="txn-left">
              {t.bonus_code && <span className="txn-code">{t.bonus_code}</span>}
              <div className="txn-type">
                <StatusBadge status={t.type} />
              </div>
              <div className="txn-date">{fmtDate(t.created_at)}</div>
            </div>
            <div className="txn-right">
              <div className="txn-amount">₹{fmt(t.amount)}</div>
              <div className="txn-arrow">›</div>
            </div>
          </div>
        ))}
      </div>
      <TabBar active="transactions" onWallet={onWallet} />
    </div>
  );
}

// ── Screen 6: TXN_DETAIL ───────────────────────────────────────────────────────

function TxnDetailScreen({
  creds,
  txn,
  onBack,
}: {
  creds: Creds;
  txn: Transaction;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/transactions/${encodeURIComponent(creds.userId)}/${txn.txn_id}`,
          { headers: s2sHeaders(creds) },
        );
        if (res.ok) setDetail((await res.json()) as TransactionDetail);
      } catch {
        // show partial info
      }
      setLoading(false);
    })();
  }, [creds, txn.txn_id]);

  return (
    <div className="screen">
      <div className="screen-header txn-header">
        <button className="back-btn" onClick={onBack} aria-label="Back">‹</button>
        <div className="detail-header-row">
          <span className="header-label">{txn.bonus_code ?? `Txn #${txn.txn_id}`}</span>
          {detail && <StatusBadge status={detail.status} />}
        </div>
      </div>
      <div className="screen-body">
        {loading && <Spinner />}
        {!loading && !detail && (
          <div className="empty-state">
            <div className="empty-icon">⚠️</div>
            <div className="empty-title">Could not load details</div>
          </div>
        )}
        {detail && (
          <>
            <div className="amounts-grid" style={{ marginBottom: 20 }}>
              <div className="amount-cell">
                <div className="amount-val">₹{fmt(detail.grant_amount)}</div>
                <div className="amount-label">Granted</div>
              </div>
              <div className="amount-cell">
                <div className="amount-val">₹{fmt(detail.release_amount)}</div>
                <div className="amount-label">Released</div>
              </div>
              <div className="amount-cell">
                <div className="amount-val">₹{fmt(detail.bonus_consumed)}</div>
                <div className="amount-label">Consumed</div>
              </div>
            </div>

            <div
              style={{
                background: '#181824',
                border: '1px solid #252535',
                borderRadius: 14,
                padding: '12px 14px',
                marginBottom: 20,
                display: 'flex',
                gap: 20,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontSize: '0.62rem', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Wager Multiplier</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#cbd5e1' }}>{detail.wager_multiplier}×</div>
              </div>
              <div>
                <div style={{ fontSize: '0.62rem', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Chunks</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#cbd5e1' }}>{detail.no_of_chunks}</div>
              </div>
            </div>

            <div className="section-label">
              Chunks ({detail.chunks.length})
            </div>
            {detail.chunks.map((c, i) => {
              const wagerDone = parseFloat(c.wager_amount);
              const wagerReq = parseFloat(c.required_wager_amount);
              const pct = wagerReq > 0 ? Math.min(100, (wagerDone / wagerReq) * 100) : 0;
              return (
                <div key={c.id ?? i} className="chunk-card">
                  <div className="chunk-header">
                    <span className="chunk-amount">₹{fmt(c.chunk_amount)}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="chunk-wager-label">
                    Wagered ₹{fmt(c.wager_amount)} of ₹{fmt(c.required_wager_amount)}
                    {wagerReq > 0 && ` (${pct.toFixed(0)}%)`}
                  </div>
                  <ProgressBar value={wagerDone} max={wagerReq > 0 ? wagerReq : 1} />
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ── Tab bar ────────────────────────────────────────────────────────────────────

function TabBar({
  active,
  onWallet,
  onTransactions,
}: {
  active: 'wallet' | 'transactions';
  onWallet?: () => void;
  onTransactions?: () => void;
}) {
  return (
    <div className="tab-bar">
      <button
        className={`tab-item ${active === 'wallet' ? 'tab-active' : ''}`}
        onClick={onWallet}
      >
        <span className="tab-icon">💰</span>
        <span>Wallet</span>
      </button>
      <button
        className={`tab-item ${active === 'transactions' ? 'tab-active' : ''}`}
        onClick={onTransactions}
      >
        <span className="tab-icon">📋</span>
        <span>Transactions</span>
      </button>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────

export default function Home() {
  const [screen, setScreen] = useState<Screen>('LOGIN');
  const [creds, setCreds] = useState<Creds | null>(null);
  const [summary, setSummary] = useState<BonusSummary[]>([]);
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

  const handleProcessingDone = useCallback((s: BonusSummary[]) => {
    setSummary(s);
    setScreen('WALLET');
  }, []);

  return (
    <div className="phone-frame">
      {screen === 'LOGIN' && (
        <LoginScreen
          onLogin={c => {
            setCreds(c);
            setScreen('DEPOSIT');
          }}
        />
      )}
      {screen === 'DEPOSIT' && creds && (
        <DepositScreen
          creds={creds}
          onDeposited={() => setScreen('PROCESSING')}
        />
      )}
      {screen === 'PROCESSING' && creds && (
        <ProcessingScreen creds={creds} onDone={handleProcessingDone} />
      )}
      {screen === 'WALLET' && creds && (
        <WalletScreen
          creds={creds}
          summary={summary}
          onTransactions={() => setScreen('TRANSACTIONS')}
        />
      )}
      {screen === 'TRANSACTIONS' && creds && (
        <TransactionsScreen
          creds={creds}
          onDetail={t => {
            setSelectedTxn(t);
            setScreen('TXN_DETAIL');
          }}
          onWallet={() => setScreen('WALLET')}
        />
      )}
      {screen === 'TXN_DETAIL' && creds && selectedTxn && (
        <TxnDetailScreen
          creds={creds}
          txn={selectedTxn}
          onBack={() => setScreen('TRANSACTIONS')}
        />
      )}
    </div>
  );
}
