'use client';
import { useState } from 'react';
import { useAppSelector } from '../../../store/hooks';
import { selectConfigureById } from '../../../store/slices/configuresSlice';
import Icon from 'wynta-react-common/components/Icon';
import Toggle from 'wynta-react-common/components/Toggle';
import DrawerFooter from '../../../components/drawers/DrawerFooter';
import type { DrawerState } from '../../../types';

interface PromoCodeFormProps {
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

const DISPLAY_ON_OPTIONS = [
  { value: 'DEPOSIT',         label: 'Deposit' },
  { value: 'REGISTRATION',    label: 'Registration' },
  { value: 'IN_APP_PURCHASE', label: 'In-app purchase' },
];

function toDateLocal(val: string | null | undefined): string {
  if (!val) return '';
  return val.slice(0, 10);
}

export default function PromoCodeForm({ state, submitting, onCancel, onSubmit }: PromoCodeFormProps) {
  const isEdit = state.type === 'EDIT_PROMOCODE';

  const cfg = useAppSelector(
    state.parentId != null ? selectConfigureById(state.parentId) : () => undefined
  );

  const existing = cfg?.promo_codes?.find(c => Number(c.id) === state.id) ?? null;

  const [code,               setCode]               = useState(existing?.code ?? '');
  const [maxAmount,          setMaxAmount]          = useState(String(existing?.max_amount ?? ''));
  const [validFrom,          setValidFrom]          = useState(toDateLocal(existing?.valid_from));
  const [validTo,            setValidTo]            = useState(toDateLocal(existing?.valid_to));
  const [displayTitle,       setDisplayTitle]       = useState(existing?.display_title ?? '');
  const [displayDescription, setDisplayDescription] = useState(existing?.display_description ?? '');
  const [termsUrl,           setTermsUrl]           = useState(existing?.terms_url ?? '');
  const [bannerImageUrl,     setBannerImageUrl]     = useState(existing?.banner_image_url ?? '');
  const [badgeText,          setBadgeText]          = useState(existing?.badge_text ?? '');
  const [ctaText,            setCtaText]            = useState(existing?.cta_text ?? '');
  const [autoApply,          setAutoApply]          = useState(existing?.auto_apply ?? false);
  const [displayOrder,       setDisplayOrder]       = useState(existing?.display_order ?? 0);
  const [displayOn,          setDisplayOn]          = useState(existing?.display_on ?? 'DEPOSIT');
  const [minDisplayAmount,   setMinDisplayAmount]   = useState(String(existing?.min_display_amount ?? ''));
  const [active,             setActive]             = useState(existing?.active ?? true);

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      code,
      max_amount:          maxAmount          || null,
      valid_from:          validFrom          || null,
      valid_to:            validTo            || null,
      display_title:       displayTitle       || null,
      display_description: displayDescription || null,
      terms_url:           termsUrl           || null,
      banner_image_url:    bannerImageUrl     || null,
      badge_text:          badgeText          || null,
      cta_text:            ctaText            || null,
      auto_apply:          autoApply,
      display_order:       displayOrder,
      display_on:          displayOn,
      min_display_amount:  minDisplayAmount   || null,
      active,
    });
  };

  return (
    <form onSubmit={handle} style={{ display: 'contents' }}>
      <div className="drawer-body">
        {cfg && (
          <div className="field-group">
            <label>Configure</label>
            <span className="parent-chip"><Icon name="settings-2" size={11}/> {cfg.name}</span>
          </div>
        )}

        <div className="field-group">
          <label>Code {!isEdit && <span className="required">*</span>}</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. WELCOME100"
            style={{ fontFamily: 'var(--mono)', letterSpacing: '0.04em', fontWeight: 600 }}
            required={!isEdit}
            readOnly={isEdit}
          />
          <div className="helper">Alphanumeric + dashes. Unique per site.</div>
        </div>

        <div className="field-group">
          <label>Display title</label>
          <input value={displayTitle} onChange={(e) => setDisplayTitle(e.target.value)} placeholder="e.g. Welcome Bonus"/>
        </div>

        <div className="field-group">
          <label>Display description</label>
          <input value={displayDescription} onChange={(e) => setDisplayDescription(e.target.value)} placeholder="Short description shown to player"/>
        </div>

        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Badge text</label>
              <input value={badgeText} onChange={(e) => setBadgeText(e.target.value)} placeholder="e.g. Hot"/>
            </div>
            <div>
              <label>CTA text</label>
              <input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="e.g. Claim Now"/>
            </div>
          </div>
        </div>

        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Max bonus amount</label>
              <input type="number" min="0" step="0.01" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="No limit"/>
            </div>
            <div>
              <label>Min display amount</label>
              <input type="number" min="0" step="0.01" value={minDisplayAmount} onChange={(e) => setMinDisplayAmount(e.target.value)} placeholder="No min"/>
            </div>
          </div>
        </div>

        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Valid from</label>
              <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)}/>
            </div>
            <div>
              <label>Valid to</label>
              <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)}/>
            </div>
          </div>
        </div>

        <div className="field-group">
          <label>Display on</label>
          <select value={displayOn} onChange={(e) => setDisplayOn(e.target.value)}>
            {DISPLAY_ON_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label>Display order</label>
          <input type="number" min="0" value={displayOrder} onChange={(e) => setDisplayOrder(+e.target.value)}/>
        </div>

        <div className="field-group">
          <label>Terms URL</label>
          <input value={termsUrl} onChange={(e) => setTermsUrl(e.target.value)} placeholder="https://…" type="url"/>
        </div>

        <div className="field-group">
          <label>Banner image URL</label>
          <input value={bannerImageUrl} onChange={(e) => setBannerImageUrl(e.target.value)} placeholder="https://cdn…" type="url"/>
        </div>

        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Auto-apply</label>
              <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
                <Toggle on={autoApply} onChange={setAutoApply} label={autoApply ? 'On' : 'Off'}/>
              </div>
            </div>
            <div>
              <label>Status</label>
              <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
                <Toggle on={active} onChange={setActive} label={active ? 'Active' : 'Inactive'}/>
              </div>
            </div>
          </div>
        </div>
      </div>
      <DrawerFooter submitting={submitting} onCancel={onCancel} label={isEdit ? 'Save Changes' : 'Create Code'}/>
    </form>
  );
}
