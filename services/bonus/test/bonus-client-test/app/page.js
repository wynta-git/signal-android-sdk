'use client';

import { useState } from 'react';

const TABS = ['Applicable Codes', 'Consume', 'Revert', 'Summary', 'Transactions'];

// ── Shared helpers ────────────────────────────────────────────────────────────

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

function useRequest(creds) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState(null);
  const [data, setData]       = useState(null);

  async function send(url, options = {}) {
    setLoading(true);
    setData(null);
    setStatus(null);
    try {
      const headers = {
        ...(options.headers || {}),
        'x-s2s-client-id':     creds.clientId,
        'x-s2s-client-secret': creds.secret,
      };
      const res  = await fetch(url, { ...options, headers });
      const json = await res.json();
      setStatus(res.status);
      setData(json);
      return { status: res.status, data: json };
    } catch (e) {
      setStatus(0);
      setData({ error: e.message });
    } finally {
      setLoading(false);
    }
  }

  return { loading, status, data, send };
}

// ── Credentials bar ───────────────────────────────────────────────────────────

function CredsBar({ creds, setCreds }) {
  return (
    <div className="creds-bar">
      <div className="cred-field">
        <label>Client ID</label>
        <input
          value={creds.clientId}
          onChange={e => setCreds(c => ({ ...c, clientId: e.target.value }))}
          placeholder="game_server"
          spellCheck={false}
        />
      </div>
      <div className="cred-field">
        <label>Client Secret</label>
        <input
          type="password"
          value={creds.secret}
          onChange={e => setCreds(c => ({ ...c, secret: e.target.value }))}
          placeholder="your_shared_secret"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function ApplicableCodes({ creds }) {
  const [userId, setUserId]     = useState('P1001');
  const [chipType, setChipType] = useState('cash');
  const { loading, status, data, send } = useRequest(creds);

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

function Consume({ creds, onConsumed }) {
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
  const { loading, status, data, send } = useRequest(creds);

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })); }

  async function submit(e) {
    e.preventDefault();
    const body = { ...form };
    if (!body.game_id)  delete body.game_id;
    if (!body.round_id) delete body.round_id;
    const result = await send('/api/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (result?.data?.consume_txn_id) onConsumed(result.data.consume_txn_id);
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

function Revert({ creds, lastConsumedTxnId }) {
  const [txnId, setTxnId] = useState('');
  const { loading, status, data, send } = useRequest(creds);
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
          <label>
            consume_txn_id{' '}
            {lastConsumedTxnId && !txnId && (
              <span style={{ color: '#4ade80' }}>(auto-filled)</span>
            )}
          </label>
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

function Summary({ creds }) {
  const [userId, setUserId] = useState('P1001');
  const { loading, status, data, send } = useRequest(creds);

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

function Transactions({ creds }) {
  const [userId, setUserId]     = useState('P1001');
  const [chipType, setChipType] = useState('cash');
  const [limit, setLimit]       = useState('50');
  const [offset, setOffset]     = useState('0');
  const { loading, status, data, send } = useRequest(creds);

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

// ── Root ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const [tab, setTab]               = useState(0);
  const [lastConsumedTxnId, setLastConsumed] = useState('');
  const [creds, setCreds]           = useState({ clientId: '', secret: '' });

  return (
    <div className="app">
      <h1>Bonus Client Test</h1>
      <p className="subtitle">S2S test client — PAM bonus player APIs</p>

      <CredsBar creds={creds} setCreds={setCreds} />

      <div className="tabs">
        {TABS.map((t, i) => (
          <button key={t} className={`tab${tab === i ? ' active' : ''}`} onClick={() => setTab(i)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <ApplicableCodes creds={creds} />}
      {tab === 1 && <Consume creds={creds} onConsumed={setLastConsumed} />}
      {tab === 2 && <Revert creds={creds} lastConsumedTxnId={lastConsumedTxnId} />}
      {tab === 3 && <Summary creds={creds} />}
      {tab === 4 && <Transactions creds={creds} />}
    </div>
  );
}
