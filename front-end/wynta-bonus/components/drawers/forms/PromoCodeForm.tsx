'use client';
import { useState, useEffect } from 'react';
import { useAppSelector, useAppDispatch } from '../../../store/hooks';
import { selectConfigureById, fetchPromoCode } from '../../../store/slices/configuresSlice';
import type { PromoCode, BonusConfigure } from '../../../types';
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
  { value: 'WITHDRAWAL',      label: 'Withdrawal' },
  { value: 'REGISTRATION',    label: 'Registration' },
  { value: 'IN_APP_PURCHASE', label: 'In-app purchase' },
];

function toDateLocal(val: string | null | undefined): string {
  if (!val) return '';
  return val.slice(0, 10);
}

// Expected: ANYNAME-MONTH-DD-TOTPLAYERSCOUNT-TOTALGRANTAMOUNT.csv
// e.g. WELCOME-JULY-07-100-50000.csv
function validateManualBonusFileName(fileName: string): string | null {
  if (!fileName.toLowerCase().endsWith('.csv')) {
    return 'File must be a CSV file (.csv).';
  }
  const base = fileName.slice(0, fileName.length - 4);
  const parts = base.split('-');
  if (parts.length !== 5 || parts.some(p => p.length === 0)) {
    return 'Filename must follow the format ANYNAME-MONTH-DD-TOTPLAYERSCOUNT-TOTALGRANTAMOUNT.csv';
  }
  const [, , , totalPlayersCount, totalGrantAmount] = parts;
  if (!/^\d+$/.test(totalPlayersCount) || !/^\d+$/.test(totalGrantAmount)) {
    return 'TOTPLAYERSCOUNT and TOTALGRANTAMOUNT in the filename must be numeric.';
  }
  return null;
}

function initState(existing: PromoCode | null, cfg?: BonusConfigure) {
  if (existing) {
    return {
      code:               existing.code               ?? '',
      maxAmount:          String(existing.max_amount  ?? ''),
      validFrom:          toDateLocal(existing.valid_from),
      validTo:            toDateLocal(existing.valid_to),
      displayTitle:       existing.display_title       ?? '',
      displayDescription: existing.display_description ?? '',
      termsUrl:           existing.terms_url           ?? '',
      bannerImageUrl:     existing.banner_image_url    ?? '',
      badgeText:          existing.badge_text          ?? '',
      ctaText:            existing.cta_text            ?? '',
      autoApply:          existing.auto_apply          ?? false,
      systemAutoApply:    existing.system_auto_apply   ?? false,
      displayOrder:       existing.display_order       ?? 0,
      displayOn:          existing.display_on          ?? 'DEPOSIT',
      minDisplayAmount:   String(existing.min_display_amount ?? ''),
      active:             existing.active              ?? true,
      isManualBonus:      existing.is_manual_bonus     ?? false,
    };
  }
  // New promo code — pre-fill limits and dates from parent configure
  return {
    code:               '',
    isManualBonus:      false,
    maxAmount:          cfg?.bonus_amount_max != null ? String(cfg.bonus_amount_max) : '',
    validFrom:          toDateLocal(cfg?.start_date),
    validTo:            toDateLocal(cfg?.end_date),
    displayTitle:       '',
    displayDescription: '',
    termsUrl:           '',
    bannerImageUrl:     '',
    badgeText:          '',
    ctaText:            '',
    autoApply:          false,
    systemAutoApply:    false,
    displayOrder:       0,
    displayOn:          'DEPOSIT',
    minDisplayAmount:   '',
    active:             true,
  };
}

export default function PromoCodeForm({ state, submitting, onCancel, onSubmit }: PromoCodeFormProps) {
  const dispatch = useAppDispatch();
  const isEdit  = state.type === 'EDIT_PROMOCODE';
  const isClone = state.type === 'CLONE_PROMOCODE';

  const cfg = useAppSelector(
    state.parentId != null ? selectConfigureById(state.parentId) : () => undefined
  );
  const storeExisting = cfg?.promo_codes?.find(c => Number(c.id) === state.id) ?? null;

  const [loading, setLoading] = useState(isEdit || isClone);
  const init = initState(storeExisting, (!isEdit && !isClone) ? cfg : undefined);

  const [code,               setCode]               = useState(init.code);
  const [maxAmount,          setMaxAmount]          = useState(init.maxAmount);
  const [validFrom,          setValidFrom]          = useState(init.validFrom);
  const [validTo,            setValidTo]            = useState(init.validTo);
  const [displayTitle,       setDisplayTitle]       = useState(init.displayTitle);
  const [displayDescription, setDisplayDescription] = useState(init.displayDescription);
  const [termsUrl,           setTermsUrl]           = useState(init.termsUrl);
  const [bannerImageUrl,     setBannerImageUrl]     = useState(init.bannerImageUrl);
  const [badgeText,          setBadgeText]          = useState(init.badgeText);
  const [ctaText,            setCtaText]            = useState(init.ctaText);
  const [autoApply,          setAutoApply]          = useState(init.autoApply);
  const [systemAutoApply,    setSystemAutoApply]    = useState(init.systemAutoApply);
  const [displayOrder,       setDisplayOrder]       = useState(init.displayOrder);
  const [displayOn,          setDisplayOn]          = useState(init.displayOn);
  const [minDisplayAmount,   setMinDisplayAmount]   = useState(init.minDisplayAmount);
  const [active,             setActive]             = useState(init.active);

  const [isManualBonus, setIsManualBonus] = useState(isClone ? false : init.isManualBonus);
  const [csvError,      setCsvError]      = useState<string | null>(null);
  const [csvFile,       setCsvFile]       = useState<File | null>(null);

  const isNew = !isEdit && !isClone;
  // Manual bonus codes are created once from a CSV upload and can never be edited afterward.
  const isLocked = isEdit && isManualBonus;

  function handleManualBonusToggle(on: boolean) {
    setIsManualBonus(on);
    setCode('');
    setCsvError(null);
    setCsvFile(null);
    if (on) {
      setMaxAmount('');
      setActive(true);
      setAutoApply(false);
      setSystemAutoApply(false);
    }
  }

  function handleCsvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateManualBonusFileName(file.name);
    setCsvError(error);
    setCode(error ? '' : file.name.replace(/\.csv$/i, ''));
    setCsvFile(error ? null : file);
  }

  useEffect(() => {
    if ((!isEdit && !isClone) || state.id == null) return;
    dispatch(fetchPromoCode(state.id))
      .unwrap()
      .then((fresh) => {
        const s = initState(fresh);
        // Clone: leave code blank so the user must enter a new unique code
        setCode(isClone ? '' : s.code);
        setMaxAmount(s.maxAmount);
        setValidFrom(s.validFrom);
        setValidTo(s.validTo);
        setDisplayTitle(s.displayTitle);
        setDisplayDescription(s.displayDescription);
        setTermsUrl(s.termsUrl);
        setBannerImageUrl(s.bannerImageUrl);
        setBadgeText(s.badgeText);
        setCtaText(s.ctaText);
        setAutoApply(s.autoApply);
        setSystemAutoApply(s.systemAutoApply);
        setDisplayOrder(s.displayOrder);
        setDisplayOn(s.displayOn);
        setMinDisplayAmount(s.minDisplayAmount);
        setActive(s.active);
        setIsManualBonus(isClone ? false : s.isManualBonus);
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    if (isManualBonus && (!code || csvError || !maxAmount || !csvFile)) {
      if (!code || csvError || !csvFile) setCsvError(csvError ?? 'Please upload a valid CSV file.');
      return;
    }
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
      system_auto_apply:   systemAutoApply,
      display_order:       displayOrder,
      display_on:          displayOn,
      min_display_amount:  minDisplayAmount   || null,
      active,
      is_manual_bonus:     isManualBonus,
      ...(isManualBonus && csvFile ? { csv_file: csvFile } : {}),
    });
  };

  if (loading) {
    return (
      <div className="drawer-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <Icon name="loader" size={20} color="var(--g400)"/>
      </div>
    );
  }

  return (
    <form onSubmit={handle} style={{ display: 'contents' }}>
      <div className="drawer-body">
        {cfg && (
          <div className="field-group">
            <label>Configure</label>
            <span className="parent-chip"><Icon name="settings-2" size={11}/> {cfg.name}</span>
          </div>
        )}

        {isLocked && (
          <div className="field-group">
            <div className="helper" style={{ color: 'var(--err)' }}>
              This is a manual bonus code created from a CSV upload — it cannot be edited.
            </div>
          </div>
        )}

        {isNew && (
          <div className="field-group">
            <label>Is Manual Bonus</label>
            <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
              <Toggle on={isManualBonus} onChange={handleManualBonusToggle} label={isManualBonus ? 'On' : 'Off'}/>
            </div>
          </div>
        )}

        {isLocked ? (
          <div className="field-group">
            <label>Promo code</label>
            <div className="mb-upload">
              <span className="mono">{code}</span>
            </div>
          </div>
        ) : isManualBonus ? (
          <>
            <div className="field-group">
              <label>Upload CSV <span className="required">*</span></label>
              <div className="mb-upload">
                <label className="mb-file">
                  <Icon name="upload" size={13}/>
                  <span>Browse CSV</span>
                  <input type="file" accept=".csv,text/csv" onChange={handleCsvFileChange} hidden/>
                </label>
              </div>
              {csvError ? (
                <div className="helper" style={{ color: 'var(--err)' }}>{csvError}</div>
              ) : (
                <div className="helper">Format: ANYNAME-MONTH-DD-TOTPLAYERSCOUNT-TOTALGRANTAMOUNT.csv (e.g. WELCOME-JULY-07-100-50000.csv). The filename becomes the promo code.</div>
              )}
            </div>
            {code && !csvError && (
              <div className="field-group">
                <label>Promo code</label>
                <div className="mb-upload">
                  <span className="mono">{code}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="field-group">
            <label>Code {!isEdit && <span className="required">*</span>}</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. WELCOME100"
              style={{ fontFamily: 'var(--mono)', letterSpacing: '0.04em', fontWeight: 600 }}
              required={!isEdit}
              readOnly={isEdit && !isClone}
            />
            <div className="helper">Alphanumeric + dashes. Unique per site.</div>
          </div>
        )}

        {!isManualBonus && (
        <div className="field-group">
          <label>Display title</label>
          <input value={displayTitle} onChange={(e) => setDisplayTitle(e.target.value)} placeholder="e.g. Welcome Bonus"/>
        </div>
        )}

        {!isManualBonus && (
        <div className="field-group">
          <label>Display description</label>
          <input value={displayDescription} onChange={(e) => setDisplayDescription(e.target.value)} placeholder="Short description shown to player"/>
        </div>
        )}

        {!isManualBonus && (
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
        )}

        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Max bonus amount {isManualBonus && <span className="required">*</span>}</label>
              <input type="number" min="0" step="0.01" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="No limit" required={isManualBonus} disabled={isLocked}/>
            </div>
            {!isManualBonus && (
            <div>
              <label>Min display amount</label>
              <input type="number" min="0" step="0.01" value={minDisplayAmount} onChange={(e) => setMinDisplayAmount(e.target.value)} placeholder="No min"/>
            </div>
            )}
          </div>
        </div>

        {!isManualBonus && (
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
        )}

        {!isManualBonus && (
        <div className="field-group">
          <label>Display on</label>
          <select value={displayOn} onChange={(e) => setDisplayOn(e.target.value)}>
            {DISPLAY_ON_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        )}

        {!isManualBonus && (
        <div className="field-group">
          <label>Display order</label>
          <input type="number" min="0" value={displayOrder} onChange={(e) => setDisplayOrder(+e.target.value)}/>
        </div>
        )}

        {!isManualBonus && (
        <div className="field-group">
          <label>Terms URL</label>
          <input value={termsUrl} onChange={(e) => setTermsUrl(e.target.value)} placeholder="https://…" type="text"/>
        </div>
        )}

        {!isManualBonus && (
        <div className="field-group">
          <label>Banner image URL</label>
          <input value={bannerImageUrl} onChange={(e) => setBannerImageUrl(e.target.value)} placeholder="https://cdn…" type="text"/>
        </div>
        )}

        <div className="field-group">
          <div className="row-2">
            {!isManualBonus && (
            <div>
              <label>Auto-apply</label>
              <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
                <Toggle on={autoApply} onChange={setAutoApply} label={autoApply ? 'On' : 'Off'}/>
              </div>
            </div>
            )}
            <div>
              <label>Status</label>
              <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
                <Toggle on={active} onChange={setActive} label={active ? 'Active' : 'Inactive'} disabled={isLocked}/>
              </div>
            </div>
          </div>
        </div>

        {!isManualBonus && (
        <div className="field-group">
          <label>System auto-apply</label>
          <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
            <Toggle on={systemAutoApply} onChange={setSystemAutoApply} label={systemAutoApply ? 'On' : 'Off'}/>
          </div>
          <div className="helper">
            When on, the system automatically applies this code to an eligible player's bonus when a
            release event fires — no code entry needed. Independent of the front-end "Auto-apply" hint above.
          </div>
        </div>
        )}
      </div>
      <DrawerFooter submitting={submitting} onCancel={onCancel} label={isEdit ? 'Save Changes' : 'Create Code'} disabled={isLocked}/>
    </form>
  );
}
