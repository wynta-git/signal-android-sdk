'use client';
import { useState } from 'react';
import { useAppSelector } from '../../../store/hooks';
import { selectSubheadById } from '../../../store/slices/subheadsSlice';
import { selectConfigureById } from '../../../store/slices/configuresSlice';
import Icon from 'wynta-react-common/components/Icon';
import Toggle from 'wynta-react-common/components/Toggle';
import DrawerFooter from '../../../components/drawers/DrawerFooter';
import type { DrawerState } from '../../../types';

const FREQUENCIES = ['EVERYTIME', 'ONCE', 'MONTHLY', 'WEEKLY'] as const;

interface ConfigureFormProps {
  mode: 'new' | 'edit';
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function ConfigureForm({ mode, state, submitting, onCancel, onSubmit }: ConfigureFormProps) {
  const cfgFromStore = useAppSelector(
    mode === 'edit' && state.id != null ? selectConfigureById(state.id) : () => undefined
  );
  const parentSubId = state.parentId ?? cfgFromStore?.subhead_id;
  const parentSub = useAppSelector(
    parentSubId != null ? selectSubheadById(parentSubId) : () => undefined
  );

  const today = new Date().toISOString().slice(0, 10);
  const cfg = cfgFromStore;

  const [name, setName] = useState(cfg?.name || '');
  const [description, setDescription] = useState(cfg?.description || '');
  const [freq, setFreq] = useState<string>(cfg?.applicability_frequency || 'ONCE');
  const [startDate, setStartDate] = useState(
    cfg?.start_date ? String(cfg.start_date).slice(0, 10) : today
  );
  const [endDate, setEndDate] = useState(
    cfg?.end_date ? String(cfg.end_date).slice(0, 10) : today
  );
  const [priority, setPriority] = useState(cfg?.priority ?? 1);
  const [active, setActive] = useState(cfg ? cfg.active : true);
  const [wagerMult, setWagerMult] = useState(cfg?.wager_multiplier != null ? Number(cfg.wager_multiplier) : 20);
  const [chunks, setChunks] = useState(cfg?.no_of_chunks ?? 1);
  const [fixed, setFixed] = useState<string>(cfg?.bonus_amount_fixed != null ? String(cfg.bonus_amount_fixed) : '');
  const [pct, setPct] = useState<string>(cfg?.bonus_amount_percent != null ? String(cfg.bonus_amount_percent) : '');
  const [max, setMax] = useState<string>(cfg?.bonus_amount_max != null ? String(cfg.bonus_amount_max) : '');
  const [cbFixed, setCbFixed] = useState<string>(cfg?.cashback_bonus_amount_fixed != null ? String(cfg.cashback_bonus_amount_fixed) : '');
  const [cbPct, setCbPct] = useState<string>(cfg?.cashback_bonus_amount_percent != null ? String(cfg.cashback_bonus_amount_percent) : '');
  const [cbMax, setCbMax] = useState<string>(cfg?.cashback_bonus_amount_max != null ? String(cfg.cashback_bonus_amount_max) : '');
  const [wagerChip, setWagerChip] = useState(cfg?.wager_chip_type || 'CASH');
  const [creditChip, setCreditChip] = useState(cfg?.credit_chip_type || 'CASH');
  const [chunkExp, setChunkExp] = useState(cfg?.chunk_expiry_days ?? 7);
  const [bonusExp, setBonusExp] = useState(cfg?.bonus_expiry_days ?? 30);

  const toNum = (v: string) => v.trim() !== '' ? Number(v) : null;

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      description: description || null,
      applicability_frequency: freq,
      start_date: startDate + 'T00:00:00',
      end_date: endDate + 'T00:00:00',
      priority,
      active,
      wager_multiplier: wagerMult,
      no_of_chunks: chunks,
      bonus_amount_fixed: toNum(fixed),
      bonus_amount_percent: toNum(pct),
      bonus_amount_max: toNum(max),
      cashback_bonus_amount_fixed: toNum(cbFixed),
      cashback_bonus_amount_percent: toNum(cbPct),
      cashback_bonus_amount_max: toNum(cbMax),
      wager_chip_type: wagerChip,
      credit_chip_type: creditChip,
      chunk_expiry_days: chunkExp,
      bonus_expiry_days: bonusExp,
    });
  };

  return (
    <form onSubmit={handle} style={{ display: 'contents' }}>
      <div className="drawer-body">
        <div className="section-divider-label" style={{ margin: 0, marginBottom: 12 }}>Basic</div>

        {parentSub && (
          <div className="field-group">
            <label>Parent Subhead</label>
            <span className="parent-chip">
              <Icon name="folder" size={11}/> {parentSub.name}
            </span>
          </div>
        )}

        <div className="field-group">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FD Match 100% — Slots" required/>
        </div>

        <div className="field-group">
          <label>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Concise summary"/>
        </div>

        <div className="field-group">
          <label>Applicability Frequency</label>
          <div className="seg" style={{ '--cols': 4 } as React.CSSProperties}>
            {FREQUENCIES.map(f => (
              <button type="button" key={f} className={freq === f ? 'active' : ''} onClick={() => setFreq(f)}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}/>
            </div>
            <div>
              <label>End date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}/>
            </div>
          </div>
        </div>

        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Priority</label>
              <input type="number" value={priority} onChange={(e) => setPriority(+e.target.value)}/>
            </div>
            <div>
              <label>Status</label>
              <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
                <Toggle on={active} onChange={setActive} label={active ? 'Active' : 'Paused'}/>
              </div>
            </div>
          </div>
        </div>

        <div className="section-divider"/>
        <div className="section-divider-label">Mechanics</div>

        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Bonus fixed</label>
              <input value={fixed} placeholder="e.g. 500.00" onChange={(e) => setFixed(e.target.value)}/>
            </div>
            <div>
              <label>Bonus percent</label>
              <input value={pct} placeholder="e.g. 100" onChange={(e) => setPct(e.target.value)}/>
            </div>
          </div>
          <div className="helper">Use either fixed amount or percent. Leave the other empty.</div>
        </div>

        <div className="field-group">
          <label>Maximum bonus (₹)</label>
          <input value={max} placeholder="leave empty for ∞" onChange={(e) => setMax(e.target.value)}/>
        </div>

        <div className="section-divider"/>
        <div className="section-divider-label">Cashback Bonus</div>

        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Cashback fixed</label>
              <input value={cbFixed} placeholder="e.g. 500.00" onChange={(e) => setCbFixed(e.target.value)}/>
            </div>
            <div>
              <label>Cashback percent</label>
              <input value={cbPct} placeholder="e.g. 10" onChange={(e) => setCbPct(e.target.value)}/>
            </div>
          </div>
          <div className="helper">Use either fixed amount or percent. Leave the other empty.</div>
        </div>

        <div className="field-group">
          <label>Maximum cashback (₹)</label>
          <input value={cbMax} placeholder="leave empty for ∞" onChange={(e) => setCbMax(e.target.value)}/>
        </div>

        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Wager multiplier</label>
              <input type="number" value={wagerMult} onChange={(e) => setWagerMult(+e.target.value)}/>
            </div>
            <div>
              <label>No. of chunks</label>
              <input type="number" value={chunks} onChange={(e) => setChunks(+e.target.value)}/>
            </div>
          </div>
        </div>

        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Wager chip type</label>
              <select value={wagerChip} onChange={(e) => setWagerChip(e.target.value)}>
                <option>BONUS</option><option>BONUS+REAL</option><option>REAL</option><option>CASH</option>
              </select>
            </div>
            <div>
              <label>Credit chip type</label>
              <select value={creditChip} onChange={(e) => setCreditChip(e.target.value)}>
                <option>BONUS</option><option>CASH</option><option>BONUS+CASH</option>
              </select>
            </div>
          </div>
        </div>

        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Chunk expiry (days)</label>
              <input type="number" value={chunkExp} onChange={(e) => setChunkExp(+e.target.value)}/>
            </div>
            <div>
              <label>Bonus expiry (days)</label>
              <input type="number" value={bonusExp} onChange={(e) => setBonusExp(+e.target.value)}/>
            </div>
          </div>
        </div>
      </div>
      <DrawerFooter submitting={submitting} onCancel={onCancel} label={mode === 'new' ? 'Create Configure' : 'Save Changes'}/>
    </form>
  );
}
