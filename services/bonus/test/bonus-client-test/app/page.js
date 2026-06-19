'use client';

import { useState } from 'react';

const TABS = ['Applicable Codes', 'Consume', 'Revert', 'Summary', 'Transactions'];

function StatusBadge({ status }) {
  if (!status) return null;
  const cls = status < 300 ? 'ok' : status < 500 ? 'warn' : 'err';
  return <span className={`status-badge ${cls}`}>{status}</span>;
}

function ResponsePanel({ loading, status, data }) {
  return (
    <div className="response-card">
      <h2>Response</h2>
      {loading && <p className="empty-state">Sending…</p>}
      {!loading && !data && <p className="empty-state">Hit Send to see a response</p>}
      {!loading && data !== null && (
        <>
          <StatusBadge status={status} />
          <div className="json-block">{JSON.stringify(data, null, 2)}</div>
        </>
      )}
    </div>
  );
}

function useRequest() {
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]     = useState(null);
  const [data, setData]         = useState(null);

  async function send(url, options = {}) {
    setLoading(true);
    setData(null);
    setStatus(null);
    try {
      const res  = await fetch(url, options);
      const json = await res.json();
      setStatus(res.status);
      setData(json);
    } catch (e) {
      setStatus(0);
      setData({ error: e.message });
    } finally {
      setLoading(false);
    }
  }

  return { loading, status, data, send };
}

// ── Applicable Codes ────────────────────────────────────────────────────────

function ApplicableCodes() {
  const [userId, setUserId]     = useState('P1001');
  const [chipType, setChipType] = useState('cash');
  const { loading, status, data, send } = useRequest();

  function submit(e) {
    e.preventDefault();
    send(`/api/applicable-codes?user_id=${encodeURIComponent(userId)}&chip_type=${chipType}`);
  }

  return (
    <div className="panel">
      <form className="form-card" onSubmit={submit}>
        <h2>Applicable Codes</h2>
        <div className="field">
          <label>user_id</label>
          <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="P1001" required />
        </div>
        <div className="field">
          <label>chip_type</label>
          <select value={chipType} onChange={e => setChipType(e.target.value)}>
            <option value="cash">cash</option>
            <option value="in_app_purchase">in_app_purchase</option>
          </select>
        </div>
        <button className="btn" type="submit" disabled={loading}>Send</button>
      </form>
      <ResponsePanel loading={loading} status={status} data={data} />
    </div>
  );
}

// ── Consume ─────────────────────────────────────────────────────────────────

function Consume({ onConsumed }) {
  const [form, setForm] = useState({
    user_id: 'P1001',
    consume_txn_id: `TXN${Date.now()}`,
    wager_amount: '200.00',
    bonus_amount: '100.00',
    chip_type: 'cash',
    wager_tnx_id: 'W001',
    game_id: 'CRICKET_EXPRESS',
    round_id: 'R001',
  });
  const { loading, status, data, send } = useRequest();

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })); }

  async function submit(e) {
    e.preventDefault();
    const body = { ...form };
    if (!body.game_id) delete body.game_id;
    if (!body.round_id) delete body.round_id;
    await send('/api/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (data?.consume_txn_id) onConsumed(data.consume_txn_id);
  }

  // Save consume_txn_id after data arrives
  const prevData = useState(null);
  if (data?.consume_txn_id && data.consume_txn_id !== prevData[0]) {
    prevData[1](data.consume_txn_id);
    onConsumed(data.consume_txn_id);
  }

  return (
    <div className="panel">
      <form className="form-card" onSubmit={submit}>
        <h2>Consume Bonus</h2>
        {[
          ['user_id', 'user_id', 'P1001'],
          ['consume_txn_id', 'consume_txn_id', 'TXN…'],
          ['wager_amount', 'wager_amount', '200.00'],
          ['bonus_amount', 'bonus_amount', '100.00'],
          ['wager_tnx_id', 'wager_tnx_id', 'W001'],
          ['game_id', 'game_id (optional)', 'CRICKET_EXPRESS'],
          ['round_id', 'round_id (optional)', 'R001'],
        ].map(([key, label, ph]) => (
          <div className="field" key={key}>
            <label>{label}</label>
            <input value={form[key]} onChange={set(key)} placeholder={ph} />
          </div>
        ))}
        <div className="field">
          <label>chip_type</label>
          <select value={form.chip_type} onChange={set('chip_type')}>
            <option value="cash">cash</option>
            <option value="in_app_purchase">in_app_purchase</option>
          </select>
        </div>
        <button className="btn" type="submit" disabled={loading}>Send</button>
      </form>
      <ResponsePanel loading={loading} status={status} data={data} />
    </div>
  );
}

// ── Revert ───────────────────────────────────────────────────────────────────

function Revert({ lastConsumedTxnId }) {
  const [txnId, setTxnId] = useState('');
  const { loading, status, data, send } = useRequest();

  const value = txnId || lastConsumedTxnId || '';

  function submit(e) {
    e.preventDefault();
    send(`/api/consume/${encodeURIComponent(value)}/revert`, { method: 'POST' });
  }

  return (
    <div className="panel">
      <form className="form-card" onSubmit={submit}>
        <h2>Revert Consumption</h2>
        <div className="field">
          <label>consume_txn_id {lastConsumedTxnId && !txnId && <span style={{ color: '#4ade80' }}>(auto-filled from last Consume)</span>}</label>
          <input
            value={value}
            onChange={e => setTxnId(e.target.value)}
            placeholder="TXN20250519001"
            required
          />
        </div>
        <button className="btn" type="submit" disabled={loading || !value}>Send</button>
      </form>
      <ResponsePanel loading={loading} status={status} data={data} />
    </div>
  );
}

// ── Summary ──────────────────────────────────────────────────────────────────

function Summary() {
  const [userId, setUserId] = useState('P1001');
  const { loading, status, data, send } = useRequest();

  function submit(e) {
    e.preventDefault();
    send(`/api/summary/${encodeURIComponent(userId)}`);
  }

  return (
    <div className="panel">
      <form className="form-card" onSubmit={submit}>
        <h2>Player Summary</h2>
        <div className="field">
          <label>user_id</label>
          <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="P1001" required />
        </div>
        <button className="btn" type="submit" disabled={loading}>Send</button>
      </form>
      <ResponsePanel loading={loading} status={status} data={data} />
    </div>
  );
}

// ── Transactions ─────────────────────────────────────────────────────────────

function Transactions() {
  const [userId, setUserId]     = useState('P1001');
  const [chipType, setChipType] = useState('cash');
  const [limit, setLimit]       = useState('50');
  const [offset, setOffset]     = useState('0');
  const { loading, status, data, send } = useRequest();

  function submit(e) {
    e.preventDefault();
    const qs = new URLSearchParams({ chip_type: chipType, limit, offset }).toString();
    send(`/api/transactions/${encodeURIComponent(userId)}?${qs}`);
  }

  return (
    <div className="panel">
      <form className="form-card" onSubmit={submit}>
        <h2>Transactions</h2>
        <div className="field">
          <label>user_id</label>
          <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="P1001" required />
        </div>
        <div className="field">
          <label>chip_type</label>
          <select value={chipType} onChange={e => setChipType(e.target.value)}>
            <option value="cash">cash</option>
            <option value="in_app_purchase">in_app_purchase</option>
          </select>
        </div>
        <div className="field">
          <label>limit</label>
          <input type="number" value={limit} onChange={e => setLimit(e.target.value)} min="1" max="200" />
        </div>
        <div className="field">
          <label>offset</label>
          <input type="number" value={offset} onChange={e => setOffset(e.target.value)} min="0" />
        </div>
        <button className="btn" type="submit" disabled={loading}>Send</button>
      </form>
      <ResponsePanel loading={loading} status={status} data={data} />
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [tab, setTab]                     = useState(0);
  const [lastConsumedTxnId, setLastConsumed] = useState('');

  return (
    <div className="app">
      <h1>Bonus Client Test</h1>
      <p className="subtitle">S2S test client — PAM bonus player APIs · http://localhost:8010</p>

      <div className="tabs">
        {TABS.map((t, i) => (
          <button key={t} className={`tab${tab === i ? ' active' : ''}`} onClick={() => setTab(i)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <ApplicableCodes />}
      {tab === 1 && <Consume onConsumed={setLastConsumed} />}
      {tab === 2 && <Revert lastConsumedTxnId={lastConsumedTxnId} />}
      {tab === 3 && <Summary />}
      {tab === 4 && <Transactions />}
    </div>
  );
}
