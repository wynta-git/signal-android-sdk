'use client';
import { useState } from 'react';
import Icon from '@/components/primitives/Icon';
import Toggle from '@/components/primitives/Toggle';
import DrawerFooter from '@/components/drawers/DrawerFooter';
import { formatINRCompact, formatDateShort } from '@/services/mocks/utils';

interface ManualCode {
  id: string | number;
  code: string;
  audience_count?: number;
  audience_label?: string;
  audience_type?: string;
  valid_to?: string;
  auto_apply?: boolean;
  per_player_amount?: string | number;
}

interface IssueCodeBonusState {
  type: string;
  code: ManualCode;
}

interface IssueCodeBonusFormProps {
  state: IssueCodeBonusState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function IssueCodeBonusForm({ state, submitting, onCancel, onSubmit }: IssueCodeBonusFormProps) {
  const code = state.code;
  const reach = code.audience_count || 0;
  const [amount, setAmount] = useState(String(code.per_player_amount || '500'));
  const [autoApply, setAutoApply] = useState(!!code.auto_apply);
  const [note, setNote] = useState('');

  const perPlayer = parseFloat(amount) || 0;
  const totalCost = reach * perPlayer;

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ type: 'ISSUE_CODE_BONUS', codeId: code.id, amount, autoApply, note, reach, totalCost });
  };

  return (
    <form onSubmit={handle} style={{ display: 'contents' }}>
      <div className="drawer-body">
        <div className="field-group">
          <label>Promo code</label>
          <span className="parent-chip" style={{ fontFamily: 'var(--mono)', letterSpacing: '0.04em' }}>
            <Icon name="ticket" size={11}/> {code.code}
          </span>
          <div className="helper" style={{ marginTop: 4 }}>
            Sends this bonus to the audience already defined on the code.
          </div>
        </div>

        <div className="field-group">
          <label>Audience</label>
          <span className="audience-chip" title={code.audience_label} style={{ maxWidth: '100%' }}>
            <Icon name={code.audience_type === 'UPLOAD' ? 'upload' : 'users'} size={11}/>
            <span className="lbl">{code.audience_label || 'Untargeted'}</span>
            <span className="cnt">{reach.toLocaleString('en-IN')}</span>
          </span>
          <div className="helper" style={{ marginTop: 4 }}>
            {code.audience_type === 'UPLOAD' ? 'Uploaded player list' : 'Player segment'} · cannot be changed here. Edit the code to retarget.
          </div>
        </div>

        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Bonus amount per player (₹)</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500"/>
            </div>
            <div>
              <label>Valid until</label>
              <input value={formatDateShort(code.valid_to ?? '')} disabled style={{ background: 'var(--g50)', color: 'var(--g500)' }}/>
            </div>
          </div>
          <div className="helper">Amount may be overridden for this issuance. Validity follows the code.</div>
        </div>

        <div className="field-group">
          <Toggle on={autoApply} onChange={setAutoApply} label={autoApply ? 'Auto-credit on issue' : 'Player must redeem code'}/>
        </div>

        <div className="field-group">
          <label>Note <span style={{ color: 'var(--g400)', fontWeight: 400 }}>· internal audit trail</span></label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is this bonus being issued now?" style={{ minHeight: 60 }}/>
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
            <span className="v mono">{code.code}</span>
          </div>
        </div>
      </div>
      <DrawerFooter submitting={submitting} onCancel={onCancel} label={`Issue to ${reach.toLocaleString('en-IN')} players`}/>
    </form>
  );
}
