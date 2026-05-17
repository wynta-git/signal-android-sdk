'use client';
import { useState, useMemo } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { createManualBonus } from '@/store/slices/subheadsSlice';
import Icon from '@/components/primitives/Icon';
import Toggle from '@/components/primitives/Toggle';
import DrawerFooter from '@/components/drawers/DrawerFooter';
import { MOCK_CONFIGURES } from '@/services/mocks/configures';
import { MANUAL_SEGMENTS } from '@/services/mocks/constants';
import { formatINRCompact } from '@/services/mocks/utils';

export default function ManualBonusForm({ state, submitting, onCancel, onSubmit }) {
  const cfg = MOCK_CONFIGURES[state.parentId] || MOCK_CONFIGURES[261];

  const today = new Date();
  const stamp = today.getFullYear().toString().slice(2)
    + String(today.getMonth() + 1).padStart(2, '0')
    + String(today.getDate()).padStart(2, '0');

  const [campaign, setCampaign]   = useState('');
  const [code, setCode]           = useState('MB_' + stamp);
  const [amount, setAmount]       = useState('500');
  const [validDays, setValidDays] = useState(14);
  const [mode, setMode]           = useState('SEGMENT');
  const [segmentId, setSegmentId] = useState('VIP_T3');
  const [idsText, setIdsText]     = useState('');
  const [autoApply, setAutoApply] = useState(false);
  const [note, setNote]           = useState('');

  const parsedRows = useMemo(() => {
    if (!idsText.trim()) return [];
    return idsText.split(/\r?\n/)
      .map(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return null;
        const parts = t.split(/[,\t;]\s*/);
        const pid = parts[0]?.trim();
        if (!pid) return null;
        const amt = parts[1] ? parseFloat(parts[1]) : null;
        return { pid, amt: isNaN(amt) ? null : amt };
      })
      .filter(Boolean);
  }, [idsText]);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => setIdsText(String(ev.target.result || ''));
    reader.readAsText(f);
  };

  const seg = MANUAL_SEGMENTS.find(s => s.id === segmentId);
  const reach = mode === 'SEGMENT' ? (seg?.count || 0) : parsedRows.length;
  const perPlayer = parseFloat(amount) || 0;
  const totalCost = parsedRows.length && mode === 'UPLOAD' && parsedRows.some(r => r.amt !== null)
    ? parsedRows.reduce((acc, r) => acc + (r.amt !== null ? r.amt : perPlayer), 0)
    : reach * perPlayer;

  const handle = (e) => {
    e.preventDefault();
    onSubmit({
      type: 'NEW_MANUAL_BONUS',
      campaign, code, amount, validDays, mode,
      segment: mode === 'SEGMENT' ? seg : null,
      ids: mode === 'UPLOAD' ? parsedRows : null,
      autoApply, note, reach, totalCost,
    });
  };

  return (
    <form onSubmit={handle} style={{ display: 'contents' }}>
      <div className="drawer-body">
        {cfg && (
          <div className="field-group">
            <label>Under</label>
            <span className="parent-chip"><Icon name="folder-tree" size={11}/> Manual Bonus</span>
            <div className="helper" style={{ marginTop: 4 }}>
              Each issue creates a fresh promo code under <strong style={{ color: 'var(--g700)' }}>{cfg.name}</strong>.
            </div>
          </div>
        )}

        <div className="field-group">
          <label>Campaign name <span style={{ color: 'var(--g400)', fontWeight: 400 }}>· optional</span></label>
          <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="e.g. May VIP Loyalty Thank-You"/>
        </div>

        <div className="field-group">
          <label>Promo code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
            placeholder="MB_XXXXX"
            style={{ fontFamily: 'var(--mono)', fontWeight: 600, letterSpacing: '0.04em' }}
            maxLength={32}
          />
          <div className="helper">Uppercase letters, digits, underscore.</div>
        </div>

        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Bonus amount per player (₹)</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500"/>
            </div>
            <div>
              <label>Valid for (days)</label>
              <input type="number" min="1" max="365" value={validDays} onChange={(e) => setValidDays(parseInt(e.target.value || '0'))}/>
            </div>
          </div>
        </div>

        <div className="section-divider"/>
        <div className="section-divider-label">Audience</div>

        <div className="field-group">
          <div className="seg" style={{ '--cols': 2 }}>
            <button type="button" className={mode === 'SEGMENT' ? 'active' : ''} onClick={() => setMode('SEGMENT')}>
              Player Segment
            </button>
            <button type="button" className={mode === 'UPLOAD' ? 'active' : ''} onClick={() => setMode('UPLOAD')}>
              Upload IDs
            </button>
          </div>
        </div>

        {mode === 'SEGMENT' && (
          <div className="field-group">
            <label>Choose a segment</label>
            <div className="mb-seg-grid">
              {MANUAL_SEGMENTS.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={'mb-seg-card' + (s.id === segmentId ? ' active' : '')}
                  onClick={() => setSegmentId(s.id)}
                >
                  <div className="top">
                    <span className="dot"/>
                    <span className="lbl">{s.label}</span>
                    <span className="cnt">{s.count.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="hint">{s.hint}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'UPLOAD' && (
          <>
            <div className="field-group">
              <label>Upload CSV / paste player IDs</label>
              <div className="mb-upload">
                <label className="mb-file">
                  <Icon name="upload" size={13}/>
                  <span>Upload CSV / TXT</span>
                  <input type="file" accept=".csv,.txt,text/plain,text/csv" onChange={handleFile} hidden/>
                </label>
                <span className="mb-or">or paste below</span>
              </div>
              <textarea
                value={idsText}
                onChange={(e) => setIdsText(e.target.value)}
                placeholder={"PLAYER_123\nPLAYER_456,1000\nPLAYER_789,500\n# Lines starting with # are ignored"}
                style={{ fontFamily: 'var(--mono)', fontSize: 12, minHeight: 130 }}
              />
              <div className="helper">
                One player ID per line. Optional second column = bonus for that player (overrides default).
              </div>
            </div>
          </>
        )}

        <div className="field-group">
          <Toggle on={autoApply} onChange={setAutoApply} label={autoApply ? 'Auto-credit on issue' : 'Player must redeem code'}/>
        </div>

        <div className="field-group">
          <label>Note <span style={{ color: 'var(--g400)', fontWeight: 400 }}>· internal</span></label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is this bonus being issued? (audit trail)" style={{ minHeight: 60 }}/>
        </div>

        <div className="mb-summary">
          <div className="mb-summary-row">
            <span className="k">Reach</span>
            <span className="v">{reach.toLocaleString('en-IN')} <span className="ct">players</span></span>
          </div>
          <div className="mb-summary-row">
            <span className="k">Per player</span>
            <span className="v">{perPlayer ? formatINRCompact(perPlayer) : '—'}</span>
          </div>
          <div className="mb-summary-row total">
            <span className="k">Total cost</span>
            <span className="v">{totalCost ? formatINRCompact(totalCost) : '—'}</span>
          </div>
          <div className="mb-summary-row">
            <span className="k">Promo code</span>
            <span className="v mono">{code || '—'}</span>
          </div>
        </div>
      </div>
      <DrawerFooter submitting={submitting} onCancel={onCancel} label={`Issue Bonus${reach ? ' to ' + reach.toLocaleString('en-IN') : ''}`}/>
    </form>
  );
}
