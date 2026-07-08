'use client';
import { useState, useEffect, useRef } from 'react';
import { getBudget, getUsage, isBudgetInherited, formatINRCompact, formatDateShort, formatRelative, usageGranted } from '../../services/mocks/utils';
import type { BudgetPeriod } from '../../types';
import BudgetRing from 'wynta-react-common/components/BudgetRing';
import LifecycleBar from '../../components/primitives/LifecycleBar';
import UsageBreakdown from '../../components/primitives/UsageBreakdown';
import Icon from 'wynta-react-common/components/Icon';
import Badge from 'wynta-react-common/components/Badge';
import { useAppDispatch } from '../../store/hooks';
import { openDrawer } from '../../store/slices/uiSlice';
import type { DrawerState } from '../../types';

interface ManualPromoCode {
  id: string | number;
  code: string;
  manual?: boolean;
  audience_label?: string;
  audience_type?: string;
  audience_count?: number;
  max_amount?: number | null;
  valid_from?: string;
  valid_to?: string;
  auto_apply?: boolean;
  system_auto_apply?: boolean | null;
  display_order?: number;
  active?: boolean;
  issued_by?: string;
  issued_at?: string;
  campaign_note?: string;
  per_player_amount?: string | number;
  is_manual_bonus?: boolean;
  manual_bonus_status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL_SUCCESS' | 'FAILED' | null;
  manual_bonus_total_players?: number | null;
  manual_bonus_total_amount?: string | number | null;
  manual_bonus_success_players?: number | null;
  manual_bonus_success_amount?: string | number | null;
  manual_bonus_failed_players?: number | null;
  manual_bonus_failed_amount?: string | number | null;
}

const MANUAL_BONUS_STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING:         { label: 'Pending',         color: 'var(--g500, #6b7280)' },
  PROCESSING:      { label: 'Processing',      color: 'var(--blue, #0091e0)' },
  COMPLETED:       { label: 'Completed',       color: 'var(--success, #10b981)' },
  PARTIAL_SUCCESS: { label: 'Partial success', color: 'var(--warn, #f59e0b)' },
  FAILED:          { label: 'Failed',          color: 'var(--err, #ef4444)' },
};

interface PromoCodeRowProps {
  code: ManualPromoCode;
  configureId: number;
  highlight?: boolean;
}

export default function PromoCodeRow({ code, configureId, highlight }: PromoCodeRowProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const codeIdNum = typeof code.id === 'string' ? parseInt(code.id, 10) : code.id;
  const usage = getUsage('code', codeIdNum);
  const budget = getBudget('code', codeIdNum);
  const inherited = isBudgetInherited('code', codeIdNum);

  // Listen for "highlight this code" events fired by global search.
  useEffect(() => {
    const onHi = (e: Event) => {
      const ce = e as CustomEvent<{ codeId: string | number }>;
      if (ce.detail && ce.detail.codeId === code.id) {
        setOpen(true);
        setFlash(true);
        if (cardRef.current) {
          const rect = cardRef.current.getBoundingClientRect();
          const target = window.scrollY + rect.top - 120;
          window.scrollTo({ top: target, behavior: 'smooth' });
        }
        const t = setTimeout(() => setFlash(false), 2400);
        return () => clearTimeout(t);
      }
    };
    window.addEventListener('wynta:highlight-code', onHi);
    return () => window.removeEventListener('wynta:highlight-code', onHi);
  }, [code.id]);

  // Apply external highlight prop on mount/change
  useEffect(() => {
    if (highlight) {
      setOpen(true);
      setFlash(true);
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect();
        const target = window.scrollY + rect.top - 120;
        window.scrollTo({ top: target, behavior: 'smooth' });
      }
      const t = setTimeout(() => setFlash(false), 2400);
      return () => clearTimeout(t);
    }
  }, [highlight]);

  const handleIssueBonus = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch(openDrawer({ type: 'ISSUE_CODE_BONUS', code, configureId } as unknown as DrawerState));
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch(openDrawer({ type: 'EDIT_PROMOCODE', id: codeIdNum, parentId: configureId } as DrawerState));
  };

  const handleClone = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch(openDrawer({ type: 'CLONE_PROMOCODE', id: codeIdNum, parentId: configureId } as DrawerState));
  };

  return (
    <div className={'code-card' + (flash ? ' is-highlighted' : '')} ref={cardRef}>
      <div className="code-top" onClick={() => setOpen(o => !o)}>
        <span className="code-string">{code.code}</span>
        {code.manual && code.audience_label && (
          <span className="audience-chip" title={code.audience_label}>
            <Icon name={code.audience_type === 'UPLOAD' ? 'upload' : 'users'} size={11}/>
            <span className="lbl">{code.audience_label}</span>
            <span className="cnt">{(code.audience_count || 0).toLocaleString('en-IN')}</span>
          </span>
        )}
        <div className="code-meta">
          <div className="kv">
            <span className="k">Max</span>
            <span className="v">{code.max_amount === null ? '∞' : formatINRCompact(code.max_amount ?? 0)}</span>
          </div>
          <div className="kv">
            <span className="k">Valid</span>
            <span className="v">{formatDateShort(code.valid_from ?? '')} → {formatDateShort(code.valid_to ?? '')}</span>
          </div>
          {!code.is_manual_bonus && (
            <>
              <div className="kv">
                <span className="k">Auto-apply</span>
                <span className="v">{code.auto_apply ? 'Yes' : 'No'}</span>
              </div>
              <div className="kv">
                <span className="k">System auto-apply</span>
                <span className="v">{code.system_auto_apply ? 'Yes' : 'No'}</span>
              </div>
              <div className="kv">
                <span className="k">Order</span>
                <span className="v">#{code.display_order}</span>
              </div>
            </>
          )}
        </div>
        <div style={{ flex: '0 0 110px', minWidth: 0 }}>
          <LifecycleBar usage={usage} size="sm"/>
          <div style={{ fontSize: 10.5, color: 'var(--g500)', marginTop: 4, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {formatINRCompact(code.is_manual_bonus ? Number(code.manual_bonus_success_amount ?? 0) : usageGranted(usage))} granted
          </div>
        </div>
        {code.manual && (
          <button
            className="btn btn-primary btn-sm"
            onClick={handleIssueBonus}
            title="Issue this bonus to its audience"
          >
            <Icon name="send" size={12}/> Issue Bonus
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm btn-icon-only"
          aria-label="Edit promo code"
          onClick={handleEdit}
        >
          <Icon name="pencil" size={13}/>
        </button>
        <button
          className="btn btn-ghost btn-sm btn-icon-only"
          aria-label="Clone promo code"
          onClick={handleClone}
        >
          <Icon name="copy" size={13}/>
        </button>
        <button
          className="btn btn-ghost btn-sm btn-icon-only"
          aria-label="Copy code"
          onClick={(e) => { e.stopPropagation(); navigator.clipboard && navigator.clipboard.writeText(code.code); }}
        >
          <Icon name="copy" size={13}/>
        </button>
        <Badge active={code.active}/>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color="var(--g400)"/>
      </div>
      {code.is_manual_bonus && (
        <div className="code-manual-row">
          <span
            className="audience-chip"
            title="Manual bonus — created from a CSV upload"
            style={{ color: MANUAL_BONUS_STATUS_META[code.manual_bonus_status ?? 'PENDING']?.color }}
          >
            <Icon name="upload" size={11}/>
            <span className="lbl">Manual</span>
            <span className="cnt">{MANUAL_BONUS_STATUS_META[code.manual_bonus_status ?? 'PENDING']?.label ?? code.manual_bonus_status}</span>
          </span>
        </div>
      )}
      {open && (
        <div className="code-bottom">
          <div className="bcol">
            <div className="label">
              <Icon name="wallet" size={11}/> Budget
              {inherited && <span className="inherits-chip"><Icon name="link" size={10}/> Inherits from configure</span>}
            </div>
            <div className="code-mini-rings">
              {budget.length === 0 ? (
                <div style={{ fontSize: 11.5, color: 'var(--g400)', fontStyle: 'italic' }}>No budget caps.</div>
              ) : budget.map((b: BudgetPeriod) => (
                <div key={b.period_type} className="code-mini-ring">
                  <BudgetRing used={Number(b.used ?? 0)} limit={b.limit !== undefined && b.limit !== null ? Number(b.limit) : null} size={44} stroke={4}/>
                  <div className="mtext">
                    <span className="pname">{b.period_type}</span>
                    <span className="used">{formatINRCompact(b.used)}</span>
                    <span> of {b.limit === null || b.limit === undefined ? '∞' : formatINRCompact(b.limit)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bcol">
            <div className="label"><Icon name="activity" size={11}/> Lifecycle</div>
            <UsageBreakdown usage={usage} dense/>
            {code.manual && (
              <div className="manual-campaign-meta">
                <div className="mcm-row">
                  <Icon name="user" size={11}/>
                  <span>Issued by <strong>{code.issued_by || '—'}</strong></span>
                </div>
                <div className="mcm-row">
                  <Icon name="clock" size={11}/>
                  <span>Issued {code.issued_at ? formatRelative(code.issued_at) : '—'}</span>
                </div>
                {code.campaign_note && (
                  <div className="mcm-note">
                    <Icon name="message-square" size={11}/>
                    <span>{code.campaign_note}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          {code.is_manual_bonus && (
            <div className="bcol">
              <div className="label">
                <Icon name="upload" size={11}/> Manual bonus batch
                <span
                  className="audience-chip"
                  style={{ color: MANUAL_BONUS_STATUS_META[code.manual_bonus_status ?? 'PENDING']?.color }}
                >
                  {MANUAL_BONUS_STATUS_META[code.manual_bonus_status ?? 'PENDING']?.label ?? code.manual_bonus_status}
                </span>
              </div>
              <div className="manual-campaign-meta">
                <div className="mcm-row">
                  <Icon name="users" size={11}/>
                  <span>Total <strong>{code.manual_bonus_total_players ?? 0}</strong> players, {formatINRCompact(Number(code.manual_bonus_total_amount ?? 0))}</span>
                </div>
                <div className="mcm-row">
                  <Icon name="check-circle" size={11} color="var(--success, #10b981)"/>
                  <span>Success <strong>{code.manual_bonus_success_players ?? 0}</strong> players, {formatINRCompact(Number(code.manual_bonus_success_amount ?? 0))}</span>
                </div>
                <div className="mcm-row">
                  <Icon name="x-circle" size={11} color="var(--err, #ef4444)"/>
                  <span>Failed <strong>{code.manual_bonus_failed_players ?? 0}</strong> players, {formatINRCompact(Number(code.manual_bonus_failed_amount ?? 0))}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
