"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Screen =
  | "LOGIN"
  | "HOME"
  | "DEPOSIT"
  | "BET"
  | "PROCESSING"
  | "WALLET"
  | "TRANSACTIONS"
  | "TXN_DETAIL"
  | "CONSUME";
type Tab = "home" | "deposit" | "bet" | "consume" | "wallet" | "transactions";

interface Creds {
  userId: string;
  clientId: string;
  secret: string;
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
  wagering_done: string;
}

interface Transaction {
  txn_id: number;
  bonus_code: string | null;
  amount: string;
  type: string;
  created_at: string;
  release_amount?: string;
  consumed_amount?: string;
  expiry_amount?: string;
  forfeit_amount?: string;
  grant_txn_id?: number;
  player_bonus_id?: number;
}

interface ChunkReleaseEvent {
  id: number;
  chunk_id: number;
  wager_ref: string;
  wager_amount: string;
  release_amount: string;
  created_at: string;
}

interface ChunkConsumeEvent {
  id: number;
  chunk_id: number;
  consumed_ref: string;
  wager_ref: string;
  amount: string;
  wager_amount: string;
  consumed_amount: string;
  created_at: string;
}

interface ChunkDetail {
  id: number;
  chunk_ref: string;
  chunk_amount: string;
  status: string;
  required_wager_amount: string;
  wager_amount: string;
  releases: ChunkReleaseEvent[];
  consumes: ChunkConsumeEvent[];
}

interface ForfeitDetail {
  id: number;
  requested_amount: string;
  amount: string;
  type: string;
  operator: string | null;
  forfeited_at: string;
}

interface ExpiryEvent {
  id: number;
  chunk_id: number;
  amount: string;
  type: string;
  operator: string | null;
  expired_at: string;
}

interface GrantTxnDetail {
  type: "GRANT";
  txn_id: number;
  user_id: string;
  bonus_code: string | null;
  grant_amount: string;
  release_amount: string;
  bonus_consumed: string;
  status: string;
  wager_multiplier: string;
  no_of_chunks: number;
  chunk_expiry_days: number | null;
  bonus_expiry_days: number | null;
  wager_chip_type: string;
  credit_chip_type: string;
  created_at: string;
  chunks: ChunkDetail[];
  forfeit: ForfeitDetail | null;
  expiry_events: ExpiryEvent[];
}

interface ChunkReleaseRow {
  id: number;
  chunk_ref: string;
  wager_amount: string;
  release_amount: string;
  bonus_grant_id: number;
}

interface ChunkConsumedRow {
  id: number;
  chunk_ref: string;
  consumed_amount: string;
  bonus_grant_id: number;
}

interface ReleaseTxnDetail {
  type: "RELEASE";
  id: number;
  wager_ref: string;
  chip_type: string | null;
  product: string | null;
  game_type: string | null;
  game_name: string | null;
  wager_amount: string;
  release_amount: string;
  created_at: string;
  chunks: ChunkReleaseRow[];
}

interface ConsumeTxnDetail {
  type: "CONSUME";
  id: number;
  wager_ref: string | null;
  chip_type: string | null;
  product: string | null;
  game_type: string | null;
  game_name: string | null;
  amount: string;
  consumed_amount: string;
  wager_amount: string;
  created_at: string;
  chunks: ChunkConsumedRow[];
}

interface ExpiryTxnDetail {
  type: "EXPIRY";
  id: number;
  chunk_id: number;
  chunk_ref: string;
  amount: string;
  expiry_type: string;
  operator: string | null;
  expired_at: string;
}

interface ForfeitTxnDetail {
  type: "FORFEIT";
  id: number;
  bonus_grant_id: number;
  requested_amount: string;
  amount: string;
  forfeit_type: string;
  operator: string | null;
  forfeited_at: string;
}

type TxnDetailResponse =
  | GrantTxnDetail
  | ReleaseTxnDetail
  | ConsumeTxnDetail
  | ExpiryTxnDetail
  | ForfeitTxnDetail;

// ── Helpers ────────────────────────────────────────────────────────────────────

function s2sHeaders(creds: Creds): HeadersInit {
  return {
    "x-s2s-client-id": creds.clientId,
    "x-s2s-client-secret": creds.secret,
  };
}

function fmt(val: string | number): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  return isNaN(n) ? "0.00" : n.toFixed(2);
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const TYPE_MAP: Record<string, string> = {
  grant: "GRANT",
  released: "RELEASE",
  consumed: "CONSUME",
  expiry: "EXPIRY",
  forfeited: "FORFEIT",
};

// ── Shared components ──────────────────────────────────────────────────────────

function Spinner() {
  return <div className="spinner" />;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: "#0a280a", color: "#6ee7b7" },
  active: { bg: "#0a280a", color: "#6ee7b7" },
  PENDING: { bg: "#281800", color: "#fbbf24" },
  pending: { bg: "#281800", color: "#fbbf24" },
  EXPIRED: { bg: "#280a0a", color: "#f87171" },
  expired: { bg: "#280a0a", color: "#f87171" },
  FORFEITED: { bg: "#280a0a", color: "#f87171" },
  RELEASE: { bg: "#0a1a38", color: "#93c5fd" },
  released: { bg: "#061828", color: "#93c5fd" },
  GRANT: { bg: "#18082a", color: "#c4b5fd" },
  grant: { bg: "#18082a", color: "#c4b5fd" },
  CONSUMED: { bg: "#18082a", color: "#c4b5fd" },
  consumed: { bg: "#140820", color: "#c4b5fd" },
  CONSUMED_PARTIALLY: { bg: "#18082a", color: "#a78bfa" },
  PARTIALLY_RELEASED: { bg: "#0a1528", color: "#60a5fa" },
  REVERT: { bg: "#1c1208", color: "#d97706" },
  expiry: { bg: "#1c1008", color: "#fb923c" },
  forfeited: { bg: "#280a0a", color: "#f87171" },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { bg: "#1e2030", color: "#64748b" };
  return (
    <span className="status-badge" style={{ background: c.bg, color: c.color }}>
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
  const [userId, setUserId] = useState("P1001");
  const [clientId, setClientId] = useState("bonus-test-v1");
  const [secret, setSecret] = useState("abc@123456");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId.trim() || !clientId.trim() || !secret.trim()) return;
    onLogin({
      userId: userId.trim(),
      clientId: clientId.trim(),
      secret: secret.trim(),
    });
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
              onChange={(e) => setUserId(e.target.value)}
              placeholder="P1001"
              autoCapitalize="none"
              required
            />
          </div>

          <div className="section-label" style={{ marginTop: 22 }}>
            Server-to-Server Credentials
          </div>
          <div className="input-group">
            <label>Client ID</label>
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
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
              onChange={(e) => setSecret(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ marginTop: 28 }}
          >
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
  onBack,
  mode = "deposit",
}: {
  creds: Creds;
  onDeposited: () => void;
  onBack: () => void;
  mode?: "deposit" | "bet";
}) {
  const isbet = mode === "bet";
  const [amount, setAmount] = useState("500");
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [selectedPromo, setSelectedPromo] = useState<PromoCode | null>(null);
  const [promosLoading, setPromosLoading] = useState(true);
  const [validating, setValidating] = useState(false);
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
          const autoApply = data.find((p) => p.auto_apply);
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
    if (validating || depositing || !amount) return;
    setError(null);

    // Step 1: validate the selected promo code (skip for bet mode or if none selected)
    if (!isbet && selectedPromo) {
      setValidating(true);
      try {
        const vRes = await fetch("/api/validate-code", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...s2sHeaders(creds) },
          body: JSON.stringify({
            user_id: creds.userId,
            chip_type: "cash",
            code: selectedPromo.code,
          }),
        });
        const vData = (await vRes.json()) as {
          valid: boolean;
          reason?: string;
        };
        if (!vData.valid) {
          setError(`Promo code invalid: ${vData.reason ?? "not applicable"}`);
          setValidating(false);
          return;
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Validation failed");
        setValidating(false);
        return;
      }
      setValidating(false);
    }

    // Step 2: send deposit_success event
    setDepositing(true);
    try {
      const txnId = `${isbet ? "bet" : "dep"}_${creds.userId}_${Date.now()}`;
      const res = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...s2sHeaders(creds),
        },
        body: JSON.stringify({
          user_id: creds.userId,
          amount: parseFloat(amount),
          currency: "INR",
          payment_method: paymentMethod,
          transaction_id: txnId,
          event_name: isbet ? "bet_placed" : "deposit_success",
          ...(selectedPromo ? { promo_code: selectedPromo.code } : {}),
        }),
      });
      if (res.status === 202) {
        onDeposited();
      } else {
        const err = (await res.json()) as {
          detail?: string | Array<{ msg: string }>;
        };
        const d = err?.detail;
        setError(
          Array.isArray(d)
            ? d.map((e) => e.msg).join("; ") || `Error ${res.status}`
            : (d ?? `Error ${res.status}`),
        );
        setDepositing(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error");
      setDepositing(false);
    }
  }

  function togglePromo(p: PromoCode) {
    setSelectedPromo((prev) => (prev?.promo_id === p.promo_id ? null : p));
  }

  return (
    <div className="screen">
      <div className="screen-header deposit-header">
        <button className="back-btn" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="header-user-id">{creds.userId}</div>
          <div
            style={{
              fontSize: "0.7rem",
              color: "rgba(255,255,255,0.45)",
              marginTop: 1,
            }}
          >
            {isbet ? "Place a Bet" : "Make a Deposit"}
          </div>
        </div>
      </div>
      <div className="screen-body">
        {error && <div className="error-toast">{error}</div>}
        <form onSubmit={handleDeposit}>
          {isbet ? (
            <div className="input-group" style={{ marginBottom: 24 }}>
              <label>Bet Amount (₹)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                step="1"
                required
              />
            </div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-title">Deposit Details</div>
                <div className="input-row">
                  <div className="input-group" style={{ flex: 2 }}>
                    <label>Amount (₹)</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      min="1"
                      step="1"
                      required
                    />
                  </div>
                  <div className="input-group" style={{ flex: 1.6 }}>
                    <label>Method</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    >
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
                <div className="empty-state-small">
                  No applicable bonuses for this account
                </div>
              ) : (
                <div className="promo-list">
                  {!selectedPromo && (
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "#f87171",
                        marginBottom: 6,
                        paddingLeft: 2,
                      }}
                    >
                      Select a bonus to continue
                    </div>
                  )}
                  {promos.map((p) => (
                    <div
                      key={p.promo_id}
                      className={`promo-card ${selectedPromo?.promo_id === p.promo_id ? "selected" : ""}`}
                      onClick={() => togglePromo(p)}
                    >
                      <div className="promo-top">
                        {p.badge_text && (
                          <span className="promo-badge">{p.badge_text}</span>
                        )}
                        {p.auto_apply && (
                          <span className="promo-badge auto">Auto</span>
                        )}
                        <span className="promo-code">{p.code}</span>
                      </div>
                      <div className="promo-title">
                        {p.display_title ?? p.code}
                      </div>
                      {p.display_description && (
                        <div className="promo-desc">
                          {p.display_description}
                        </div>
                      )}
                      <div className="promo-meta">
                        {p.max_amount && (
                          <span>Up to ₹{fmt(p.max_amount)}</span>
                        )}
                        <span>
                          {p.wager_multiplier}× wager · {p.no_of_chunks} chunk
                          {p.no_of_chunks !== 1 ? "s" : ""}
                        </span>
                        {p.cta_text && <span>{p.cta_text}</span>}
                      </div>
                      <div
                        className={`promo-check ${selectedPromo?.promo_id === p.promo_id ? "checked" : ""}`}
                      >
                        ✓
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <button
            type="submit"
            className="btn-primary"
            style={{ marginTop: isbet ? 0 : 24 }}
            disabled={
              depositing ||
              !amount ||
              (!isbet && !promosLoading && promos.length > 0 && !selectedPromo)
            }
          >
            {depositing
              ? "Processing…"
              : isbet
                ? `Place Bet ₹${amount || "0"}`
                : `Deposit ₹${amount || "0"}`}
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
  const [status, setStatus] = useState("Processing your deposit…");
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
          const cash = data.find((d) => d.chip_type.toLowerCase() === "cash");
          const hasBonus =
            cash &&
            (parseFloat(cash.bonus_balance) > 0 ||
              parseFloat(cash.pending_bonus) > 0);
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

function WalletScreen({ creds, nav }: { creds: Creds; nav: (t: Tab) => void }) {
  const [summary, setSummary] = useState<BonusSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/summary/${encodeURIComponent(creds.userId)}`,
          { headers: s2sHeaders(creds) },
        );
        if (res.ok) setSummary((await res.json()) as BonusSummary[]);
      } catch {
        /* show empty */
      }
      setLoading(false);
    })();
  }, [creds]);

  return (
    <div className="screen has-tabs">
      <div className="screen-header wallet-header">
        <div className="avatar small">
          {creds.userId.slice(0, 2).toUpperCase()}
        </div>
        <span className="header-label">Bonus Wallet</span>
      </div>
      <div className="screen-body">
        {loading && <Spinner />}
        {!loading && summary.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🎁</div>
            <div className="empty-title">No Active Bonus</div>
            <div className="empty-desc">
              Make a deposit with an applicable promo code to unlock a bonus
            </div>
          </div>
        )}
        {summary.map((s) => {
          const released = parseFloat(s.bonus_balance);
          const pending = parseFloat(s.pending_bonus);
          const wagering = parseFloat(s.wagering_required);
          const wageringDone = parseFloat(s.wagering_done ?? "0");
          const total = released + pending;
          const isCash = s.chip_type.toLowerCase() === "cash";
          return (
            <div key={s.chip_type} className="wallet-card">
              <div className="wallet-card-header">
                <span className="chip-badge">
                  {isCash ? "💵 Cash" : `🎮 ${s.chip_type}`}
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
                  <div className="wallet-stat-val">
                    ₹{fmt(s.wagering_required)}
                  </div>
                  <div className="wallet-stat-label">Wager Req.</div>
                </div>
              </div>
              <div style={{ marginBottom: 6 }}>
                <ProgressBar value={released} max={total > 0 ? total : 1} />
              </div>
              <div
                style={{ fontSize: "0.65rem", color: "#334155", marginTop: 4 }}
              >
                {total > 0
                  ? `${((released / total) * 100).toFixed(0)}% released`
                  : "No bonus balance"}
              </div>
              {wagering > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    background: "#0f172a",
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.62rem",
                      color: "#475569",
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      marginBottom: 6,
                    }}
                  >
                    Wagering Progress
                  </div>
                  <ProgressBar
                    value={wageringDone}
                    max={wageringDone + wagering}
                  />
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "#64748b",
                      marginTop: 4,
                    }}
                  >
                    ₹{fmt(wagering)} remaining to unlock pending bonus
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <TabBar active="wallet" nav={nav} />
    </div>
  );
}

// ── Screen 5: TRANSACTIONS ─────────────────────────────────────────────────────

function TransactionsScreen({
  creds,
  onDetail,
  nav,
}: {
  creds: Creds;
  onDetail: (t: Transaction) => void;
  nav: (t: Tab) => void;
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
        <div className="avatar small">
          {creds.userId.slice(0, 2).toUpperCase()}
        </div>
        <span className="header-label">Transactions</span>
      </div>
      <div className="screen-body">
        {loading && <Spinner />}
        {!loading && txns.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div className="empty-title">No Transactions</div>
            <div className="empty-desc">
              Your bonus transactions will appear here
            </div>
          </div>
        )}
        {txns.map((t) => {
          if (t.type === "grant") {
            const expForf =
              parseFloat(t.expiry_amount ?? "0") +
              parseFloat(t.forfeit_amount ?? "0");
            const expForfColor = expForf > 0 ? "#f87171" : "#475569";
            return (
              <div
                key={`grant-${t.txn_id}`}
                className="txn-row txn-row-grant"
                onClick={() => onDetail(t)}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {t.bonus_code && (
                      <span className="txn-code">{t.bonus_code}</span>
                    )}
                    <StatusBadge status="grant" />
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span className="txn-date">{fmtDate(t.created_at)}</span>
                    <span className="txn-arrow">›</span>
                  </div>
                </div>
                {t.player_bonus_id && (
                  <div
                    style={{
                      fontSize: "0.62rem",
                      color: "#475569",
                      marginBottom: 8,
                      fontFamily: "monospace",
                      letterSpacing: "0.03em",
                    }}
                  >
                    ID: {String(t.player_bonus_id)}
                  </div>
                )}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 6,
                  }}
                >
                  {[
                    { label: "Granted", val: t.amount, color: "#cbd5e1" },
                    {
                      label: "Released",
                      val: t.release_amount ?? "0",
                      color: "#93c5fd",
                    },
                    {
                      label: "Consumed",
                      val: t.consumed_amount ?? "0",
                      color: "#c4b5fd",
                    },
                    {
                      label: "Exp+Forf",
                      val: String(expForf),
                      color: expForfColor,
                    },
                  ].map(({ label, val, color }) => (
                    <div
                      key={label}
                      style={{
                        background: "#0f1117",
                        borderRadius: 8,
                        padding: "6px 8px",
                      }}
                    >
                      <div
                        style={{ fontSize: "0.78rem", fontWeight: 700, color }}
                      >{`₹${fmt(val)}`}</div>
                      <div
                        style={{
                          fontSize: "0.6rem",
                          color: "#475569",
                          marginTop: 2,
                        }}
                      >
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          return (
            <div
              key={`${t.type}-${t.txn_id}`}
              className="txn-row"
              onClick={() => onDetail(t)}
            >
              <div className="txn-left">
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
          );
        })}
      </div>
      <TabBar active="transactions" nav={nav} />
    </div>
  );
}

// ── Detail sub-components ─────────────────────────────────────────────────────

function MetaRow({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div
      style={{
        background: "#181824",
        border: "1px solid #252535",
        borderRadius: 12,
        padding: "10px 14px",
        marginBottom: 16,
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      {items.map(({ label, value }) => (
        <div key={label}>
          <div
            style={{
              fontSize: "0.6rem",
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              marginBottom: 2,
            }}
          >
            {label}
          </div>
          <div
            style={{ fontSize: "0.82rem", fontWeight: 700, color: "#94a3b8" }}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function GrantDetail({ detail }: { detail: GrantTxnDetail }) {
  const expTotal = detail.expiry_events.reduce(
    (s, e) => s + parseFloat(e.amount),
    0,
  );
  const expColor = expTotal > 0 ? "#fb923c" : "#475569";
  const forfAmt = detail.forfeit?.amount ?? "0";
  const forfColor = parseFloat(forfAmt) > 0 ? "#f87171" : "#475569";
  return (
    <>
      <div className="amounts-grid" style={{ marginBottom: 16 }}>
        {(
          [
            { label: "Granted", val: detail.grant_amount, color: "#cbd5e1" },
            { label: "Released", val: detail.release_amount, color: "#93c5fd" },
            { label: "Consumed", val: detail.bonus_consumed, color: "#c4b5fd" },
          ] as { label: string; val: string; color: string }[]
        ).map(({ label, val, color }) => (
          <div key={label} className="amount-cell">
            <div className="amount-val" style={{ color }}>
              ₹{fmt(val)}
            </div>
            <div className="amount-label" style={{ color }}>
              {label}
            </div>
          </div>
        ))}
        <div className="amount-cell">
          <div className="amount-val" style={{ color: expColor }}>
            ₹{fmt(expTotal)}
          </div>
          <div className="amount-label" style={{ color: expColor }}>
            Expired
          </div>
        </div>
        <div className="amount-cell">
          <div className="amount-val" style={{ color: forfColor }}>
            ₹{fmt(forfAmt)}
          </div>
          <div className="amount-label" style={{ color: forfColor }}>
            Forfeited
          </div>
        </div>
      </div>

      <MetaRow
        items={[
          {
            label: "Chip",
            value: `${detail.wager_chip_type} → ${detail.credit_chip_type}`,
          },
          { label: "Chunks", value: String(detail.no_of_chunks) },
          { label: "Wager", value: `${detail.wager_multiplier}×` },
          { label: "Granted", value: fmtDate(detail.created_at) },
        ]}
      />

      {detail.forfeit && (
        <div
          style={{
            background: "#200a0a",
            border: "1px solid #450a0a",
            borderRadius: 12,
            padding: "12px 14px",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <span
              style={{ color: "#f87171", fontWeight: 700, fontSize: "0.85rem" }}
            >
              ⛔ Forfeited
            </span>
            <span style={{ color: "#64748b", fontSize: "0.72rem" }}>
              {fmtDate(detail.forfeit.forfeited_at)}
            </span>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div>
              <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                Requested{" "}
              </span>
              <span style={{ color: "#fca5a5", fontWeight: 600 }}>
                ₹{fmt(detail.forfeit.requested_amount)}
              </span>
            </div>
            <div>
              <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                Forfeited{" "}
              </span>
              <span style={{ color: "#f87171", fontWeight: 700 }}>
                ₹{fmt(detail.forfeit.amount)}
              </span>
            </div>
            <div>
              <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                [{detail.forfeit.type}]
              </span>
            </div>
            {detail.forfeit.operator && (
              <div>
                <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                  by {detail.forfeit.operator}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {detail.expiry_events.length > 0 && (
        <div
          style={{
            background: "#1c1008",
            border: "1px solid #431c00",
            borderRadius: 12,
            padding: "12px 14px",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              color: "#fb923c",
              fontWeight: 700,
              fontSize: "0.85rem",
              marginBottom: 8,
            }}
          >
            ⏱ Expiry Events
          </div>
          {detail.expiry_events.map((ev) => (
            <div
              key={ev.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "5px 0",
                borderTop: "1px solid #2d1800",
              }}
            >
              <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>
                Chunk #{ev.chunk_id} · {fmtDate(ev.expired_at)}
              </span>
              <span
                style={{
                  color: "#fb923c",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                }}
              >
                −₹{fmt(ev.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="section-label">Chunks ({detail.chunks.length})</div>
      {detail.chunks.map((c, i) => {
        const wagerDone = parseFloat(c.wager_amount);
        const wagerReq = parseFloat(c.required_wager_amount);
        const pct =
          wagerReq > 0 ? Math.min(100, (wagerDone / wagerReq) * 100) : 0;
        return (
          <div key={c.id ?? i} className="chunk-card">
            <div className="chunk-header">
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span className="chunk-amount">₹{fmt(c.chunk_amount)}</span>
                <span style={{ fontSize: "0.7rem", color: "#475569" }}>
                  {c.chunk_ref}
                </span>
              </div>
              <StatusBadge status={c.status} />
            </div>
            <div className="chunk-wager-label">
              Wagered ₹{fmt(c.wager_amount)} of ₹{fmt(c.required_wager_amount)}
              {wagerReq > 0 && ` (${pct.toFixed(0)}%)`}
            </div>
            <ProgressBar value={wagerDone} max={wagerReq > 0 ? wagerReq : 1} />
            {c.releases.length > 0 && (
              <div className="chunk-events">
                <div
                  className="chunk-events-label"
                  style={{ color: "#93c5fd" }}
                >
                  ↑ Releases ({c.releases.length})
                </div>
                {c.releases.map((r) => (
                  <div key={r.id} className="chunk-event-row release">
                    <div className="chunk-event-main">
                      <span className="chunk-event-ref">{r.wager_ref}</span>
                      <span className="chunk-event-date">
                        {fmtDate(r.created_at)}
                      </span>
                    </div>
                    <div className="chunk-event-amounts">
                      <span style={{ color: "#64748b" }}>
                        Wager ₹{fmt(r.wager_amount)}
                      </span>
                      <span style={{ color: "#4ade80", fontWeight: 700 }}>
                        +₹{fmt(r.release_amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {c.consumes.length > 0 && (
              <div className="chunk-events">
                <div
                  className="chunk-events-label"
                  style={{ color: "#c4b5fd" }}
                >
                  ↓ Consumed ({c.consumes.length})
                </div>
                {c.consumes.map((con) => (
                  <div key={con.id} className="chunk-event-row consume">
                    <div className="chunk-event-main">
                      <span className="chunk-event-ref">
                        {con.consumed_ref}
                      </span>
                      <span className="chunk-event-date">
                        {fmtDate(con.created_at)}
                      </span>
                    </div>
                    <div className="chunk-event-amounts">
                      <span style={{ color: "#64748b" }}>
                        Wager ₹{fmt(con.wager_amount)}
                      </span>
                      <span style={{ color: "#f87171", fontWeight: 700 }}>
                        −₹{fmt(con.consumed_amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function ReleaseDetail({
  detail,
  onGrantDetail,
}: {
  detail: ReleaseTxnDetail;
  onGrantDetail: (id: number) => void;
}) {
  return (
    <>
      <div className="amounts-grid" style={{ marginBottom: 16 }}>
        <div className="amount-cell">
          <div className="amount-val" style={{ color: "#93c5fd" }}>
            ₹{fmt(detail.wager_amount)}
          </div>
          <div className="amount-label" style={{ color: "#93c5fd" }}>
            Wagered
          </div>
        </div>
        <div className="amount-cell">
          <div className="amount-val" style={{ color: "#6ee7b7" }}>
            ₹{fmt(detail.release_amount)}
          </div>
          <div className="amount-label" style={{ color: "#6ee7b7" }}>
            Released
          </div>
        </div>
      </div>
      <MetaRow
        items={[
          { label: "Wager Ref", value: detail.wager_ref },
          { label: "Chip", value: detail.chip_type ?? "—" },
          { label: "Product", value: detail.product ?? "—" },
          { label: "Game Type", value: detail.game_type ?? "—" },
          { label: "Date", value: fmtDate(detail.created_at) },
        ]}
      />
      <div className="section-label">
        Chunks Released ({detail.chunks.length})
      </div>
      {detail.chunks.map((c) => (
        <div key={c.id} className="chunk-card">
          <div className="chunk-header">
            <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontFamily: "monospace" }}>
              {c.chunk_ref}
            </span>
            <span style={{ color: "#6ee7b7", fontWeight: 700, fontSize: "0.88rem" }}>
              +₹{fmt(c.release_amount)}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <span style={{ fontSize: "0.72rem", color: "#475569" }}>
              Wagered ₹{fmt(c.wager_amount)}
            </span>
            <button
              onClick={() => onGrantDetail(c.bonus_grant_id)}
              style={{ fontSize: "0.7rem", color: "#c4b5fd", background: "#18082a", border: "1px solid #2d1545", borderRadius: 6, padding: "3px 9px", cursor: "pointer" }}
            >
              Grant #{c.bonus_grant_id} ›
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

function ConsumeDetail({
  detail,
  onGrantDetail,
}: {
  detail: ConsumeTxnDetail;
  onGrantDetail: (id: number) => void;
}) {
  return (
    <>
      <div className="amounts-grid" style={{ marginBottom: 16 }}>
        <div className="amount-cell">
          <div className="amount-val" style={{ color: "#94a3b8" }}>
            ₹{fmt(detail.amount)}
          </div>
          <div className="amount-label">Requested</div>
        </div>
        <div className="amount-cell">
          <div className="amount-val" style={{ color: "#c4b5fd" }}>
            ₹{fmt(detail.consumed_amount)}
          </div>
          <div className="amount-label" style={{ color: "#c4b5fd" }}>
            Consumed
          </div>
        </div>
        <div className="amount-cell">
          <div className="amount-val" style={{ color: "#93c5fd" }}>
            ₹{fmt(detail.wager_amount)}
          </div>
          <div className="amount-label" style={{ color: "#93c5fd" }}>
            Wager
          </div>
        </div>
      </div>
      <MetaRow
        items={[
          { label: "Wager Ref", value: detail.wager_ref ?? "—" },
          { label: "Chip", value: detail.chip_type ?? "—" },
          { label: "Game", value: detail.game_name ?? detail.product ?? "—" },
          { label: "Date", value: fmtDate(detail.created_at) },
        ]}
      />
      <div className="section-label">Chunks Used ({detail.chunks.length})</div>
      {detail.chunks.map((c) => (
        <div key={c.id} className="chunk-card">
          <div className="chunk-header">
            <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontFamily: "monospace" }}>
              {c.chunk_ref}
            </span>
            <span style={{ color: "#f87171", fontWeight: 700, fontSize: "0.88rem" }}>
              −₹{fmt(c.consumed_amount)}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <button
              onClick={() => onGrantDetail(c.bonus_grant_id)}
              style={{ fontSize: "0.7rem", color: "#c4b5fd", background: "#18082a", border: "1px solid #2d1545", borderRadius: 6, padding: "3px 9px", cursor: "pointer" }}
            >
              Grant #{c.bonus_grant_id} ›
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

function ExpiryDetail({ detail }: { detail: ExpiryTxnDetail }) {
  return (
    <div
      style={{
        background: "#1c1008",
        border: "1px solid #431c00",
        borderRadius: 12,
        padding: "16px 14px",
      }}
    >
      <div
        style={{
          color: "#fb923c",
          fontWeight: 700,
          fontSize: "0.9rem",
          marginBottom: 16,
        }}
      >
        ⏱ Chunk Expiry
      </div>
      <div className="amounts-grid" style={{ marginBottom: 16 }}>
        <div className="amount-cell">
          <div className="amount-val" style={{ color: "#fb923c" }}>
            ₹{fmt(detail.amount)}
          </div>
          <div className="amount-label" style={{ color: "#fb923c" }}>
            Expired
          </div>
        </div>
      </div>
      {(
        [
          { label: "Chunk Ref", value: detail.chunk_ref },
          { label: "Type", value: detail.expiry_type },
          { label: "Operator", value: detail.operator ?? "System" },
          { label: "Expired At", value: fmtDate(detail.expired_at) },
        ] as { label: string; value: string }[]
      ).map(({ label, value }) => (
        <div
          key={label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "7px 0",
            borderTop: "1px solid #2d1800",
          }}
        >
          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{label}</span>
          <span
            style={{ fontSize: "0.82rem", color: "#94a3b8", fontWeight: 600 }}
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ForfeitDetail({ detail }: { detail: ForfeitTxnDetail }) {
  return (
    <div
      style={{
        background: "#200a0a",
        border: "1px solid #450a0a",
        borderRadius: 12,
        padding: "16px 14px",
      }}
    >
      <div
        style={{
          color: "#f87171",
          fontWeight: 700,
          fontSize: "0.9rem",
          marginBottom: 16,
        }}
      >
        ⛔ Bonus Forfeited
      </div>
      <div className="amounts-grid" style={{ marginBottom: 16 }}>
        <div className="amount-cell">
          <div className="amount-val" style={{ color: "#fca5a5" }}>
            ₹{fmt(detail.requested_amount)}
          </div>
          <div className="amount-label">Requested</div>
        </div>
        <div className="amount-cell">
          <div className="amount-val" style={{ color: "#f87171" }}>
            ₹{fmt(detail.amount)}
          </div>
          <div className="amount-label" style={{ color: "#f87171" }}>
            Forfeited
          </div>
        </div>
      </div>
      {(
        [
          { label: "Type", value: detail.forfeit_type },
          { label: "Operator", value: detail.operator ?? "System" },
          { label: "Forfeited At", value: fmtDate(detail.forfeited_at) },
        ] as { label: string; value: string }[]
      ).map(({ label, value }) => (
        <div
          key={label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "7px 0",
            borderTop: "1px solid #450a0a",
          }}
        >
          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{label}</span>
          <span
            style={{ fontSize: "0.82rem", color: "#94a3b8", fontWeight: 600 }}
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function TxnDetailContent({
  detail,
  onGrantDetail,
}: {
  detail: TxnDetailResponse;
  onGrantDetail: (id: number) => void;
}) {
  if (detail.type === "GRANT")   return <GrantDetail detail={detail} />;
  if (detail.type === "RELEASE") return <ReleaseDetail detail={detail} onGrantDetail={onGrantDetail} />;
  if (detail.type === "CONSUME") return <ConsumeDetail detail={detail} onGrantDetail={onGrantDetail} />;
  if (detail.type === "EXPIRY")  return <ExpiryDetail detail={detail} />;
  if (detail.type === "FORFEIT") return <ForfeitDetail detail={detail} />;
  return null;
}

// ── Screen 6: TXN_DETAIL ─────────────────────────────────────────────────────

function TxnDetailScreen({
  creds,
  txn,
  onBack,
  onGrantDetail,
}: {
  creds: Creds;
  txn: Transaction;
  onBack: () => void;
  onGrantDetail: (id: number) => void;
}) {
  const [detail, setDetail] = useState<TxnDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const apiType = TYPE_MAP[txn.type] ?? "GRANT";

  useEffect(() => {
    setDetail(null);
    setFetchError(null);
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/transaction-detail/${encodeURIComponent(creds.userId)}?id=${txn.txn_id}&type=${apiType}`,
          { headers: s2sHeaders(creds) },
        );
        if (res.ok) {
          setDetail((await res.json()) as TxnDetailResponse);
        } else {
          setFetchError(`Error ${res.status}`);
        }
      } catch {
        setFetchError("Network error");
      }
      setLoading(false);
    })();
  }, [creds, txn.txn_id, apiType]);

  const headerTitle =
    txn.type === "grant"
      ? (txn.bonus_code ?? `Grant #${txn.txn_id}`)
      : txn.type === "released"
        ? `Release #${txn.txn_id}`
        : txn.type === "consumed"
          ? `Consume #${txn.txn_id}`
          : txn.type === "expiry"
            ? `Expiry #${txn.txn_id}`
            : `Forfeit #${txn.txn_id}`;

  return (
    <div className="screen">
      <div className="screen-header txn-header">
        <button className="back-btn" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <div className="detail-header-row">
          <span className="header-label">{headerTitle}</span>
          {detail?.type === "GRANT" && <StatusBadge status={detail.status} />}
        </div>
      </div>
      <div className="screen-body">
        {loading && <Spinner />}
        {fetchError && <div className="error-toast">{fetchError}</div>}
        {!loading && !detail && !fetchError && (
          <div className="empty-state">
            <div className="empty-icon">⚠️</div>
            <div className="empty-title">Could not load details</div>
          </div>
        )}
        {detail && <TxnDetailContent detail={detail} onGrantDetail={onGrantDetail} />}
      </div>
    </div>
  );
}

// ── Home screen ────────────────────────────────────────────────────────────────

function HomeScreen({ creds, nav }: { creds: Creds; nav: (t: Tab) => void }) {
  const [summary, setSummary] = useState<BonusSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/summary/${encodeURIComponent(creds.userId)}`,
          { headers: s2sHeaders(creds) },
        );
        if (res.ok) setSummary((await res.json()) as BonusSummary[]);
      } catch {
        /* show empty */
      }
      setLoading(false);
    })();
  }, [creds]);

  const cash = summary.find((s) => s.chip_type.toLowerCase() === "cash");
  const totalBonus = cash
    ? parseFloat(cash.bonus_balance) + parseFloat(cash.pending_bonus)
    : 0;

  return (
    <div className="screen has-tabs">
      <div className="screen-header home-header">
        <div className="home-avatar">
          {creds.userId.slice(0, 2).toUpperCase()}
        </div>
        <div className="home-greeting">
          <div className="home-hi">Hi, {creds.userId} 👋</div>
          <div className="home-subtext">Welcome back</div>
        </div>
      </div>
      <div className="screen-body">
        {/* Bonus balance card */}
        <div className="home-balance-card">
          <div className="home-balance-label">Total Bonus Balance</div>
          {loading ? (
            <div
              className="skeleton-line"
              style={{ height: 40, width: "50%", marginTop: 8 }}
            />
          ) : (
            <div className="home-balance-amount">₹{fmt(totalBonus)}</div>
          )}
          {!loading && cash && (
            <div className="home-balance-row">
              <div className="home-balance-stat">
                <span className="home-balance-stat-val">
                  ₹{fmt(cash.bonus_balance)}
                </span>
                <span className="home-balance-stat-label">Available</span>
              </div>
              <div className="home-balance-stat">
                <span className="home-balance-stat-val">
                  ₹{fmt(cash.pending_bonus)}
                </span>
                <span className="home-balance-stat-label">Pending</span>
              </div>
              <div className="home-balance-stat">
                <span className="home-balance-stat-val">
                  ₹{fmt(cash.wagering_required)}
                </span>
                <span className="home-balance-stat-label">Wager Req.</span>
              </div>
            </div>
          )}
          {!loading && !cash && (
            <div
              style={{
                fontSize: "0.78rem",
                color: "rgba(255,255,255,0.4)",
                marginTop: 8,
              }}
            >
              No active bonus — make a deposit to unlock one
            </div>
          )}
        </div>

        {/* Quick action */}
        <button
          className="btn-primary"
          onClick={() => nav("deposit")}
          style={{ marginTop: 8 }}
        >
          + Make a Deposit
        </button>
      </div>
      <TabBar active="home" nav={nav} />
    </div>
  );
}

// ── Screen: CONSUME ───────────────────────────────────────────────────────────

interface ConsumeResult {
  txn_id: number;
  consume_txn_id: string;
  bonus_amount: string;
  consumed_amount: string;
  chip_type: string;
}

function ConsumeScreen({
  creds,
  nav,
}: {
  creds: Creds;
  nav: (t: Tab) => void;
}) {
  const [bonusAmount, setBonusAmount] = useState("10");
  const [wagerAmount, setWagerAmount] = useState("100");
  const [chipType, setChipType] = useState("CASH");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConsumeResult | null>(null);

  async function handleConsume(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const ts = Date.now();
      const res = await fetch("/api/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...s2sHeaders(creds) },
        body: JSON.stringify({
          user_id: creds.userId,
          consume_txn_id: `con_${creds.userId}_${ts}`,
          wager_tnx_id: `wgr_${creds.userId}_${ts}`,
          bonus_amount: parseFloat(bonusAmount),
          transaction_amount: parseFloat(wagerAmount),
          chip_type: chipType,
        }),
      });
      const data = (await res.json()) as ConsumeResult & {
        detail?: string | Array<{ msg: string; loc?: unknown[] }>;
      };
      if (res.status === 201) {
        setResult(data);
      } else {
        const detail = data.detail;
        if (Array.isArray(detail)) {
          setError(
            detail.map((e) => e.msg).join("; ") || `Error ${res.status}`,
          );
        } else {
          setError(detail ?? `Error ${res.status}`);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setLoading(false);
  }

  return (
    <div className="screen has-tabs">
      <div className="screen-header deposit-header">
        <div className="avatar small">
          {creds.userId.slice(0, 2).toUpperCase()}
        </div>
        <span className="header-label">Consume Bonus</span>
      </div>
      <div className="screen-body">
        {error && <div className="error-toast">{error}</div>}

        {result ? (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title" style={{ color: "#6ee7b7" }}>
              Consumed ✓
            </div>
            <div className="amounts-grid" style={{ marginTop: 12 }}>
              <div className="amount-cell">
                <div className="amount-val">₹{fmt(result.consumed_amount)}</div>
                <div className="amount-label">Consumed</div>
              </div>
              <div className="amount-cell">
                <div className="amount-val">₹{fmt(result.bonus_amount)}</div>
                <div className="amount-label">Bonus Used</div>
              </div>
              <div className="amount-cell">
                <div className="amount-val">#{result.txn_id}</div>
                <div className="amount-label">Txn ID</div>
              </div>
            </div>
            <button
              className="btn-primary"
              style={{ marginTop: 16 }}
              onClick={() => setResult(null)}
            >
              Consume Again
            </button>
          </div>
        ) : (
          <form onSubmit={handleConsume}>
            <div className="input-group" style={{ marginBottom: 16 }}>
              <label>Bonus Amount (₹)</label>
              <input
                type="number"
                value={bonusAmount}
                onChange={(e) => setBonusAmount(e.target.value)}
                min="0.01"
                step="0.01"
                required
              />
            </div>
            <div className="input-group" style={{ marginBottom: 16 }}>
              <label>Wager Amount (₹)</label>
              <input
                type="number"
                value={wagerAmount}
                onChange={(e) => setWagerAmount(e.target.value)}
                min="0"
                step="0.01"
                required
              />
            </div>
            <div className="input-group" style={{ marginBottom: 24 }}>
              <label>Chip Type</label>
              <select
                value={chipType}
                onChange={(e) => setChipType(e.target.value)}
              >
                <option value="CASH">Cash</option>
                <option value="LOYALTY_PINTS">Loyalty Pints</option>
                <option value="FUN_CHIPS">Fun Chips</option>
              </select>
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !bonusAmount || !wagerAmount}
            >
              {loading ? "Consuming…" : `Consume ₹${bonusAmount || "0"}`}
            </button>
          </form>
        )}
      </div>
      <TabBar active="consume" nav={nav} />
    </div>
  );
}

// ── Tab bar ────────────────────────────────────────────────────────────────────

function TabBar({ active, nav }: { active: Tab; nav: (t: Tab) => void }) {
  const tabs: { key: Tab; icon: string; label: string }[] = [
    { key: "home", icon: "🏠", label: "Home" },
    { key: "deposit", icon: "💳", label: "Deposit" },
    { key: "bet", icon: "🎲", label: "Bet" },
    { key: "consume", icon: "🔥", label: "Consume" },
    { key: "wallet", icon: "💰", label: "Wallet" },
    { key: "transactions", icon: "📋", label: "History" },
  ];
  return (
    <div className="tab-bar">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={`tab-item ${active === t.key ? "tab-active" : ""}`}
          onClick={() => nav(t.key)}
        >
          <span className="tab-icon">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────

export default function Home() {
  const [screen, setScreen] = useState<Screen>("LOGIN");
  const [creds, setCreds] = useState<Creds | null>(null);
  const [summary, setSummary] = useState<BonusSummary[]>([]);
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [txnHistory, setTxnHistory] = useState<Transaction[]>([]);

  const handleProcessingDone = useCallback((s: BonusSummary[]) => {
    setSummary(s);
    setScreen("WALLET");
  }, []);

  const handleNav = useCallback((tab: Tab) => {
    const map: Record<Tab, Screen> = {
      home: "HOME",
      deposit: "DEPOSIT",
      bet: "BET",
      consume: "CONSUME",
      wallet: "WALLET",
      transactions: "TRANSACTIONS",
    };
    setScreen(map[tab]);
  }, []);

  return (
    <div className="phone-frame">
      {screen === "LOGIN" && (
        <LoginScreen
          onLogin={(c) => {
            setCreds(c);
            setScreen("HOME");
          }}
        />
      )}
      {screen === "HOME" && creds && (
        <HomeScreen creds={creds} nav={handleNav} />
      )}
      {screen === "DEPOSIT" && creds && (
        <DepositScreen
          creds={creds}
          onDeposited={() => setScreen("PROCESSING")}
          onBack={() => setScreen("HOME")}
        />
      )}
      {screen === "BET" && creds && (
        <DepositScreen
          creds={creds}
          mode="bet"
          onDeposited={() => setScreen("PROCESSING")}
          onBack={() => setScreen("HOME")}
        />
      )}
      {screen === "CONSUME" && creds && (
        <ConsumeScreen creds={creds} nav={handleNav} />
      )}
      {screen === "PROCESSING" && creds && (
        <ProcessingScreen creds={creds} onDone={handleProcessingDone} />
      )}
      {screen === "WALLET" && creds && (
        <WalletScreen creds={creds} nav={handleNav} />
      )}
      {screen === "TRANSACTIONS" && creds && (
        <TransactionsScreen
          creds={creds}
          onDetail={(t) => {
            setSelectedTxn(t);
            setScreen("TXN_DETAIL");
          }}
          nav={handleNav}
        />
      )}
      {screen === "TXN_DETAIL" && creds && selectedTxn && (
        <TxnDetailScreen
          creds={creds}
          txn={selectedTxn}
          onBack={() => {
            if (txnHistory.length > 0) {
              setSelectedTxn(txnHistory[txnHistory.length - 1]);
              setTxnHistory((h) => h.slice(0, -1));
            } else {
              setScreen("TRANSACTIONS");
            }
          }}
          onGrantDetail={(grantId) => {
            setTxnHistory((h) => [...h, selectedTxn]);
            setSelectedTxn({ txn_id: grantId, type: "grant", amount: "0", created_at: new Date().toISOString(), bonus_code: null });
          }}
        />
      )}
    </div>
  );
}
