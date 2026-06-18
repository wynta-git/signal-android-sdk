"use client";
import React, { useState } from "react";
import { useAppSelector } from "../../../store/hooks";
import { selectSubheadById } from "../../../store/slices/subheadsSlice";
import { selectConfigureById } from "../../../store/slices/configuresSlice";
import { selectAllSegments } from "wynta-react-common/store/slices/segmentsSlice";
import Icon from "wynta-react-common/components/Icon";
import Toggle from "wynta-react-common/components/Toggle";
import DrawerFooter from "../../../components/drawers/DrawerFooter";
import type { DrawerState } from "../../../types";

const FREQUENCIES: { value: string; label: string; hint: string }[] = [
  {
    value: "ONCE",
    label: "Once",
    hint: "Triggers once in the player's lifetime.",
  },
  {
    value: "EVERYTIME",
    label: "Every Time",
    hint: "Triggers on every qualifying event.",
  },
  {
    value: "WEEKLY",
    label: "Weekly",
    hint: "Resets each week — triggers once per week.",
  },
  {
    value: "MONTHLY",
    label: "Monthly",
    hint: "Resets each month — triggers once per month.",
  },
];

const TRIGGER_TYPES = [
  "DEPOSIT_SUCCESS",
  "REGISTRATION",
  "APP_VISIT",
  "BET_PLACED",
  "LEADERBOARD_WON",
  "TOURNAMENT_WON",
  "FRIEND_SIGNUP",
  "LOGIN",
] as const;

const WIZARD_STEPS = [
  { id: 1, label: "Basic Config" },
  { id: 2, label: "Release & Trigger" },
  { id: 3, label: "Budget" },
  { id: 4, label: "Segments & Promo" },
  { id: 5, label: "Review & Submit" },
];

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
      <span style={{ color: "var(--g500)" }}>{label}</span>
      <span style={{ fontWeight: 500, color: "var(--g800)", textAlign: "right" }}>{value}</span>
    </div>
  );
}

interface ConfigureFormProps {
  mode: "new" | "edit";
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        marginBottom: 24,
        padding: "0 4px",
      }}
    >
      {WIZARD_STEPS.map((s, i) => {
        const done = step > s.id;
        const active = step === s.id;
        return (
          <React.Fragment key={s.id}>
            {i > 0 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  marginTop: 13,
                  background: step > s.id ? "var(--blue)" : "var(--border)",
                  flexShrink: 1,
                }}
              />
            )}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                width: 52,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: done || active ? "var(--blue)" : "var(--surface2)",
                  border: `2px solid ${done || active ? "var(--blue)" : "var(--border)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: done || active ? "#fff" : "var(--g400)",
                  fontSize: 11,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {done ? <Icon name="check" size={12} /> : s.id}
              </div>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: active ? 600 : 400,
                  color: active ? "var(--blue)" : done ? "var(--text)" : "var(--g400)",
                  whiteSpace: "nowrap",
                  textAlign: "center",
                }}
              >
                {s.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function ConfigureForm({
  mode,
  state,
  submitting,
  onCancel,
  onSubmit,
}: ConfigureFormProps) {
  const cfgFromStore = useAppSelector(
    mode === "edit" && state.id != null
      ? selectConfigureById(state.id)
      : () => undefined,
  );
  const parentSubId = state.parentId ?? cfgFromStore?.subhead_id;
  const parentSub = useAppSelector(
    parentSubId != null ? selectSubheadById(parentSubId) : () => undefined,
  );
  const allSegments = useAppSelector(selectAllSegments);

  const cfg = cfgFromStore;

  const toLocalDT = (utcStr: string) => {
    const d = new Date(utcStr.includes("T") ? utcStr : utcStr + "T00:00:00Z");
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const nowLocalDT = toLocalDT(new Date().toISOString());

  // ── Wizard step ───────────────────────────────────────────────────────────
  const [step, setStep] = useState(1);

  // ── Step 1: Basic ─────────────────────────────────────────────────────────
  const [name, setName] = useState(cfg?.name || "");
  const [description, setDescription] = useState(cfg?.description || "");
  const [freq, setFreq] = useState<string>(
    cfg?.applicability_frequency || "ONCE",
  );
  const [startDate, setStartDate] = useState(
    cfg?.start_date ? toLocalDT(String(cfg.start_date)) : nowLocalDT,
  );
  const [endDate, setEndDate] = useState(
    cfg?.end_date ? toLocalDT(String(cfg.end_date)) : nowLocalDT,
  );
  const [priority, setPriority] = useState(cfg?.priority ?? 1);

  // Mechanics
  const initMechanicsTab = () =>
    cfg?.bonus_amount_percent != null && String(cfg.bonus_amount_percent) !== ""
      ? "percent"
      : "fixed";
  const [mechanicsTab, setMechanicsTab] = useState<"fixed" | "percent">(
    initMechanicsTab,
  );
  const [fixed, setFixed] = useState<string>(
    cfg?.bonus_amount_fixed != null ? String(cfg.bonus_amount_fixed) : "",
  );
  const [pct, setPct] = useState<string>(
    cfg?.bonus_amount_percent != null ? String(cfg.bonus_amount_percent) : "",
  );
  const [max, setMax] = useState<string>(
    cfg?.bonus_amount_max != null ? String(cfg.bonus_amount_max) : "",
  );
  const [creditChip, setCreditChip] = useState(cfg?.credit_chip_type || "CASH");
  const [bonusExp, setBonusExp] = useState(cfg?.bonus_expiry_days ?? 30);

  // Chunked release
  const initChunksOn = () =>
    (cfg?.no_of_chunks ?? 1) > 1 ||
    Number(cfg?.wager_multiplier ?? 0) > 0 ||
    cfg?.release_bucket === "FULL";
  const [chunksOn, setChunksOn] = useState(initChunksOn);
  const [wagerMult, setWagerMult] = useState(
    cfg?.wager_multiplier != null ? Number(cfg.wager_multiplier) : 1.5,
  );
  const [chunks, setChunks] = useState(cfg?.no_of_chunks ?? 1);
  const [fullRelease, setFullRelease] = useState(
    cfg?.release_bucket === "FULL",
  );
  const [chunkExp, setChunkExp] = useState(cfg?.chunk_expiry_days ?? 7);
  const [wagerChip, setWagerChip] = useState(cfg?.wager_chip_type || "CASH");

  // Cashback
  const hasCb =
    (cfg?.cashback_bonus_amount_fixed != null &&
      String(cfg.cashback_bonus_amount_fixed) !== "") ||
    (cfg?.cashback_bonus_amount_percent != null &&
      String(cfg.cashback_bonus_amount_percent) !== "");
  const [cashbackOn, setCashbackOn] = useState(hasCb);
  const [cbFixed, setCbFixed] = useState<string>(
    cfg?.cashback_bonus_amount_fixed != null
      ? String(cfg.cashback_bonus_amount_fixed)
      : "",
  );
  const [cbPct, setCbPct] = useState<string>(
    cfg?.cashback_bonus_amount_percent != null
      ? String(cfg.cashback_bonus_amount_percent)
      : "",
  );
  const [cbMax, setCbMax] = useState<string>(
    cfg?.cashback_bonus_amount_max != null
      ? String(cfg.cashback_bonus_amount_max)
      : "",
  );

  // Active
  const [active, setActive] = useState(cfg ? cfg.active : true);

  // ── Step 2: Budget ────────────────────────────────────────────────────────
  const subLimitVal = (type: "DAILY" | "WEEKLY" | "MONTHLY") => {
    const p = parentSub?.budget?.find((b) => b.period_type === type);
    const v = p?.budget_limit ?? p?.limit;
    return v != null ? Number(v) : null;
  };
  const subLimitStr = (type: "DAILY" | "WEEKLY" | "MONTHLY") => {
    const v = subLimitVal(type);
    return v != null ? String(v) : "";
  };
  const [dailyLimit, setDailyLimit] = useState(() => subLimitStr("DAILY"));
  const [weeklyLimit, setWeeklyLimit] = useState(() => subLimitStr("WEEKLY"));
  const [monthlyLimit, setMonthlyLimit] = useState(() =>
    subLimitStr("MONTHLY"),
  );
  const [isHardLimit, setIsHardLimit] = useState(false);
  const [budgetErrors, setBudgetErrors] = useState<{
    daily?: string;
    weekly?: string;
    monthly?: string;
  }>({});

  const [step1Errors, setStep1Errors] = useState<{
    name?: string;
    dates?: string;
    bonus?: string;
  }>({});
  const [step2Errors, setStep2Errors] = useState<{ cashback?: string }>({});
  const [step4Errors, setStep4Errors] = useState<{
    segment?: string;
    code?: string;
  }>({});

  // ── Step 3: Segments ──────────────────────────────────────────────────────
  const [allPlayers, setAllPlayers] = useState(true);
  const [segmentId, setSegmentId] = useState("");

  // ── Step 2 (trigger part) ─────────────────────────────────────────────────
  const [triggerEnabled, setTriggerEnabled] = useState(false);
  const [triggerType, setTriggerType] = useState<string>("DEPOSIT_SUCCESS");
  const [triggerConfigRows, setTriggerConfigRows] = useState<
    { key: string; value: string }[]
  >([]);

  // ── Step 5: Promo Code ────────────────────────────────────────────────────
  const [codeEnabled, setCodeEnabled] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [codeDisplayOn, setCodeDisplayOn] = useState("DEPOSIT");
  const [codeAutoApply, setCodeAutoApply] = useState(false);

  const toNum = (v: string) => (v.trim() !== "" ? Number(v) : null);
  const freqMeta = FREQUENCIES.find((f) => f.value === freq);

  const buildPayload = () => ({
    name,
    description: description || null,
    applicability_frequency: freq,
    start_date: startDate ? new Date(startDate).toISOString() : null,
    end_date: endDate ? new Date(endDate).toISOString() : null,
    priority,
    wager_multiplier: chunksOn ? wagerMult : 0,
    no_of_chunks: chunksOn ? chunks : 1,
    release_bucket: chunksOn && fullRelease ? "FULL" : null,
    chunk_expiry_days: chunksOn ? chunkExp : null,
    wager_chip_type: wagerChip,
    credit_chip_type: creditChip,
    bonus_amount_fixed: mechanicsTab === "fixed" ? toNum(fixed) : null,
    bonus_amount_percent: mechanicsTab === "percent" ? toNum(pct) : null,
    bonus_amount_max: mechanicsTab === "percent" ? toNum(max) : null,
    cashback_bonus_amount_fixed: cashbackOn && chunksOn ? toNum(cbFixed) : null,
    cashback_bonus_amount_percent: cashbackOn && chunksOn ? toNum(cbPct) : null,
    cashback_bonus_amount_max: cashbackOn && chunksOn ? toNum(cbMax) : null,
    bonus_expiry_days: bonusExp,
    active,
    _budget: [
      {
        period_type: "DAILY",
        budget_limit: toNum(dailyLimit),
        hard_limit: isHardLimit,
      },
      {
        period_type: "WEEKLY",
        budget_limit: toNum(weeklyLimit),
        hard_limit: isHardLimit,
      },
      {
        period_type: "MONTHLY",
        budget_limit: toNum(monthlyLimit),
        hard_limit: isHardLimit,
      },
    ].filter((p) => p.budget_limit != null),
    _segment_id: !allPlayers && segmentId ? segmentId : null,
    _trigger: triggerEnabled
      ? {
          trigger_type: triggerType,
          trigger_config:
            triggerConfigRows.filter((r) => r.key.trim()).length > 0
              ? Object.fromEntries(
                  triggerConfigRows
                    .filter((r) => r.key.trim())
                    .map((r) => [r.key.trim(), r.value]),
                )
              : null,
          active: true,
        }
      : null,
    _code:
      codeEnabled && promoCode
        ? {
            code: promoCode,
            display_on: codeDisplayOn,
            auto_apply: codeAutoApply,
            active: true,
          }
        : null,
  });

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(buildPayload());
  };

  // ── STEP 1 CONTENT ────────────────────────────────────────────────────────
  const step1 = (
    <>
      <div className="field-group">
        <label>Name</label>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setStep1Errors((p) => ({ ...p, name: undefined })); }}
          placeholder="e.g. FD Match 100% — Slots"
          style={step1Errors.name ? { borderColor: "var(--red, #e53e3e)" } : undefined}
        />
        {step1Errors.name && (
          <div style={{ color: "var(--red, #e53e3e)", fontSize: 11, marginTop: 4 }}>
            {step1Errors.name}
          </div>
        )}
      </div>

      <div className="field-group">
        <label>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Concise summary"
        />
      </div>

      <div className="field-group">
        <div className="row-2">
          <div>
            <label>Start date</label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setStep1Errors((p) => ({ ...p, dates: undefined })); }}
            />
          </div>
          <div>
            <label>End date</label>
            <input
              type="datetime-local"
              value={endDate}
              style={step1Errors.dates ? { borderColor: "var(--red, #e53e3e)" } : undefined}
              onChange={(e) => { setEndDate(e.target.value); setStep1Errors((p) => ({ ...p, dates: undefined })); }}
            />
          </div>
        </div>
        {step1Errors.dates && (
          <div style={{ color: "var(--red, #e53e3e)", fontSize: 11, marginTop: 4 }}>
            {step1Errors.dates}
          </div>
        )}
      </div>

      <div className="field-group">
        <label>Applicability Frequency</label>
        <div className="seg" style={{ "--cols": 4 } as React.CSSProperties}>
          {FREQUENCIES.map((f) => (
            <button
              type="button"
              key={f.value}
              className={freq === f.value ? "active" : ""}
              onClick={() => setFreq(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {freqMeta && (
          <div
            className="helper"
            style={{ marginTop: 6, color: "var(--blue)", fontSize: 11.5 }}
          >
            <Icon name="info" size={11} /> {freqMeta.hint}
          </div>
        )}
      </div>

      <div className="field-group">
        <label>Bonus Type</label>
        <div className="seg" style={{ "--cols": 2 } as React.CSSProperties}>
          <button
            type="button"
            className={mechanicsTab === "fixed" ? "active" : ""}
            onClick={() => setMechanicsTab("fixed")}
          >
            Fixed Amount
          </button>
          <button
            type="button"
            className={mechanicsTab === "percent" ? "active" : ""}
            onClick={() => setMechanicsTab("percent")}
          >
            Percentage
          </button>
        </div>
      </div>

      {mechanicsTab === "fixed" && (
        <div className="field-group">
          <label>Fixed bonus amount (₹)</label>
          <input
            value={fixed}
            placeholder="e.g. 500"
            style={step1Errors.bonus ? { borderColor: "var(--red, #e53e3e)" } : undefined}
            onChange={(e) => { setFixed(e.target.value); setStep1Errors((p) => ({ ...p, bonus: undefined })); }}
          />
          {step1Errors.bonus ? (
            <div style={{ color: "var(--red, #e53e3e)", fontSize: 11, marginTop: 4 }}>
              {step1Errors.bonus}
            </div>
          ) : (
            <div className="helper">Player receives this fixed rupee amount as bonus.</div>
          )}
        </div>
      )}

      {mechanicsTab === "percent" && (
        <>
          <div className="field-group">
            <label>Bonus percent (%)</label>
            <div style={{ position: "relative" }}>
              <input
                value={pct}
                placeholder="e.g. 100"
                onChange={(e) => { setPct(e.target.value); setStep1Errors((p) => ({ ...p, bonus: undefined })); }}
                style={{ paddingRight: 28, ...(step1Errors.bonus ? { borderColor: "var(--red, #e53e3e)" } : {}) }}
              />
              <span
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--g400)",
                  fontSize: 13,
                }}
              >
                %
              </span>
            </div>
            {step1Errors.bonus ? (
              <div style={{ color: "var(--red, #e53e3e)", fontSize: 11, marginTop: 4 }}>
                {step1Errors.bonus}
              </div>
            ) : (
              <div className="helper">Bonus = this % of the qualifying deposit / wager amount.</div>
            )}
          </div>
          <div className="field-group">
            <label>Maximum bonus (₹)</label>
            <input
              value={max}
              placeholder="leave empty for ∞"
              onChange={(e) => setMax(e.target.value)}
            />
            <div className="helper">
              Cap on the bonus regardless of deposit size. Leave empty for
              uncapped.
            </div>
          </div>
        </>
      )}

      <div className="field-group">
        <div className="row-2">
          <div>
            <label>Credit chip type</label>
            <select
              value={creditChip}
              onChange={(e) => setCreditChip(e.target.value)}
            >
              <option>BONUS</option>
              <option>COINS</option>
            </select>
          </div>
          <div>
            <label>Bonus expiry (days)</label>
            <input
              type="number"
              min={1}
              value={bonusExp}
              onChange={(e) => setBonusExp(+e.target.value)}
            />
          </div>
        </div>
      </div>

    </>
  );

  // ── STEP 2: RELEASE & TRIGGER ─────────────────────────────────────────────
  const step2 = (
    <>
      {/* Chunked Release */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: chunksOn ? 12 : 0,
        }}
      >
        <div className="section-divider-label" style={{ margin: 0 }}>
          Release in Chunks
        </div>
        <Toggle
          on={chunksOn}
          onChange={(v) => {
            setChunksOn(v);
            if (!v) setFullRelease(false);
          }}
          label={chunksOn ? "Enabled" : "Disabled"}
        />
      </div>

      {chunksOn && (
        <>
          <div className="field-group" style={{ marginTop: 12 }}>
            <div className="row-2">
              <div>
                <label>Wager multiplier</label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={wagerMult}
                  onChange={(e) => setWagerMult(+e.target.value)}
                />
              </div>
              <div>
                <label>No. of chunks</label>
                <input
                  type="number"
                  min={1}
                  value={chunks}
                  onChange={(e) => setChunks(+e.target.value)}
                />
              </div>
            </div>
            <div className="helper">
              Bonus is split into <strong>{chunks}</strong> chunk
              {chunks !== 1 ? "s" : ""}, each released after {wagerMult}× wager
              of its value.
            </div>
          </div>

          <div className="field-group">
            <div className="row-2">
              <div>
                <label>Chunk expiry (days)</label>
                <input
                  type="number"
                  min={1}
                  value={chunkExp}
                  onChange={(e) => setChunkExp(+e.target.value)}
                />
              </div>
              <div>
                <label>Wager chip type</label>
                <select
                  value={wagerChip}
                  onChange={(e) => setWagerChip(e.target.value)}
                >
                  <option>CASH</option>
                  <option>BONUS</option>
                  <option>COINS</option>
                </select>
              </div>
            </div>
          </div>

          <div className="section-divider" />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: cashbackOn ? 12 : 0,
            }}
          >
            <div className="section-divider-label" style={{ margin: 0 }}>
              Cashback Bonus
            </div>
            <Toggle
              on={cashbackOn}
              onChange={(v) => {
                setCashbackOn(v);
                if (!v) {
                  setCbFixed("");
                  setCbPct("");
                  setCbMax("");
                }
              }}
              label={cashbackOn ? "Enabled" : "Disabled"}
            />
          </div>

          {cashbackOn && (
            <>
              <div className="field-group" style={{ marginTop: 12 }}>
                <div className="row-2">
                  <div>
                    <label>Cashback fixed (₹)</label>
                    <input
                      value={cbFixed}
                      placeholder="e.g. 200"
                      style={step2Errors.cashback && !cbFixed.trim() ? { borderColor: "var(--red, #e53e3e)" } : undefined}
                      onChange={(e) => { setCbFixed(e.target.value); setStep2Errors({}); }}
                    />
                  </div>
                  <div>
                    <label>Cashback percent (%)</label>
                    <div style={{ position: "relative" }}>
                      <input
                        value={cbPct}
                        placeholder="e.g. 10"
                        onChange={(e) => { setCbPct(e.target.value); setStep2Errors({}); }}
                        style={{ paddingRight: 28, ...(step2Errors.cashback && !cbPct.trim() ? { borderColor: "var(--red, #e53e3e)" } : {}) }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          right: 10,
                          top: "50%",
                          transform: "translateY(-50%)",
                          color: "var(--g400)",
                          fontSize: 13,
                        }}
                      >
                        %
                      </span>
                    </div>
                  </div>
                </div>
                <div className="helper">
                  Use either fixed or percent. Leave the other empty.
                </div>
              </div>
              <div className="field-group">
                <label>Maximum cashback (₹)</label>
                <input
                  value={cbMax}
                  placeholder="leave empty for ∞"
                  onChange={(e) => setCbMax(e.target.value)}
                />
              </div>
              {step2Errors.cashback && (
                <div style={{ color: "var(--red, #e53e3e)", fontSize: 11, marginTop: 4 }}>
                  {step2Errors.cashback}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Release Trigger */}
      <div className="section-divider" />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: triggerEnabled ? 16 : 0,
        }}
      >
        <div className="section-divider-label" style={{ margin: 0 }}>
          Release Trigger
        </div>
        <Toggle
          on={triggerEnabled}
          onChange={setTriggerEnabled}
          label={triggerEnabled ? "Enabled" : "Skip"}
        />
      </div>

      {triggerEnabled && (
        <>
          <div className="field-group" style={{ marginTop: 12 }}>
            <label>Trigger type</label>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value)}
            >
              {TRIGGER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group" style={{ marginTop: 12 }}>
            <label>
              Trigger config{" "}
              <span style={{ color: "var(--g400)", fontWeight: 400 }}>
                (key-value conditions)
              </span>
            </label>
            {triggerConfigRows.map((row, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input
                  value={row.key}
                  placeholder="key (e.g. min_amount)"
                  style={{ flex: 1 }}
                  onChange={(e) =>
                    setTriggerConfigRows((prev) =>
                      prev.map((r, j) =>
                        j === i ? { ...r, key: e.target.value } : r,
                      ),
                    )
                  }
                />
                <input
                  value={row.value}
                  placeholder="value"
                  style={{ flex: 1 }}
                  onChange={(e) =>
                    setTriggerConfigRows((prev) =>
                      prev.map((r, j) =>
                        j === i ? { ...r, value: e.target.value } : r,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  style={{
                    padding: "0 10px",
                    color: "var(--g400)",
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                  onClick={() =>
                    setTriggerConfigRows((prev) =>
                      prev.filter((_, j) => j !== i),
                    )
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn"
              style={{ marginTop: 4, fontSize: 12 }}
              onClick={() =>
                setTriggerConfigRows((prev) => [
                  ...prev,
                  { key: "", value: "" },
                ])
              }
            >
              + Add condition
            </button>
            <div className="helper" style={{ marginTop: 6 }}>
              Common keys: min_amount, max_amount, payment_method, product,
              occurrence, player_tag, days_of_week
            </div>
          </div>
        </>
      )}
    </>
  );

  // ── STEP 3: BUDGET ────────────────────────────────────────────────────────
  const step3 = (
    <>
      <div className="field-group">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
          }}
        >
          <div>
            <label>Daily limit (₹)</label>
            <input
              type="number"
              min={0}
              value={dailyLimit}
              placeholder="No cap"
              style={
                budgetErrors.daily
                  ? { borderColor: "var(--red, #e53e3e)" }
                  : undefined
              }
              onChange={(e) => {
                setDailyLimit(e.target.value);
                setBudgetErrors((p) => ({ ...p, daily: undefined }));
              }}
            />
            {budgetErrors.daily && (
              <div
                style={{
                  color: "var(--red, #e53e3e)",
                  fontSize: 11,
                  marginTop: 4,
                }}
              >
                {budgetErrors.daily}
              </div>
            )}
          </div>
          <div>
            <label>Weekly limit (₹)</label>
            <input
              type="number"
              min={0}
              value={weeklyLimit}
              placeholder="No cap"
              style={
                budgetErrors.weekly
                  ? { borderColor: "var(--red, #e53e3e)" }
                  : undefined
              }
              onChange={(e) => {
                setWeeklyLimit(e.target.value);
                setBudgetErrors((p) => ({ ...p, weekly: undefined }));
              }}
            />
            {budgetErrors.weekly && (
              <div
                style={{
                  color: "var(--red, #e53e3e)",
                  fontSize: 11,
                  marginTop: 4,
                }}
              >
                {budgetErrors.weekly}
              </div>
            )}
          </div>
          <div>
            <label>Monthly limit (₹)</label>
            <input
              type="number"
              min={0}
              value={monthlyLimit}
              placeholder="No cap"
              style={
                budgetErrors.monthly
                  ? { borderColor: "var(--red, #e53e3e)" }
                  : undefined
              }
              onChange={(e) => {
                setMonthlyLimit(e.target.value);
                setBudgetErrors((p) => ({ ...p, monthly: undefined }));
              }}
            />
            {budgetErrors.monthly && (
              <div
                style={{
                  color: "var(--red, #e53e3e)",
                  fontSize: 11,
                  marginTop: 4,
                }}
              >
                {budgetErrors.monthly}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="field-group">
        <label>Limit type</label>
        <div className="seg" style={{ "--cols": 2 } as React.CSSProperties}>
          <button
            type="button"
            className={!isHardLimit ? "active" : ""}
            onClick={() => setIsHardLimit(false)}
          >
            Soft limit
          </button>
          <button
            type="button"
            className={isHardLimit ? "active" : ""}
            onClick={() => setIsHardLimit(true)}
          >
            Hard limit
          </button>
        </div>
        <div className="helper" style={{ marginTop: 6 }}>
          {isHardLimit
            ? "Hard — bonus issuance stops immediately when the limit is reached."
            : "Soft — tracks usage and alerts, but issuance continues past the limit."}
        </div>
      </div>
    </>
  );

  // ── STEP 4: SEGMENTS ──────────────────────────────────────────────────────
  const step4 = (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: !allPlayers ? 16 : 0,
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            Apply to all players
          </div>
          <div className="helper" style={{ marginTop: 2 }}>
            Disable to restrict this configure to a specific segment.
          </div>
        </div>
        <Toggle
          on={allPlayers}
          onChange={setAllPlayers}
          label={allPlayers ? "All players" : "Segment only"}
        />
      </div>

      {!allPlayers && (
        <div className="field-group" style={{ marginTop: 16 }}>
          <label>Segment</label>
          <select
            value={segmentId}
            style={step4Errors.segment ? { borderColor: "var(--red, #e53e3e)" } : undefined}
            onChange={(e) => { setSegmentId(e.target.value); setStep4Errors((p) => ({ ...p, segment: undefined })); }}
          >
            <option value="">— select a segment —</option>
            {allSegments.map((s) => (
              <option key={String(s.id)} value={String(s.id)}>
                {s.name ?? s.label ?? String(s.id)}
                {s.count != null ? ` (${s.count.toLocaleString()})` : ""}
              </option>
            ))}
          </select>
          {step4Errors.segment ? (
            <div style={{ color: "var(--red, #e53e3e)", fontSize: 11, marginTop: 4 }}>
              {step4Errors.segment}
            </div>
          ) : (
            <div className="helper">Only players in this segment will be eligible.</div>
          )}
        </div>
      )}

      <hr style={{ margin: "20px 0", border: "none", borderTop: "1px solid var(--g200)" }} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: codeEnabled ? 16 : 0,
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Add a promo code</div>
          <div className="helper" style={{ marginTop: 2 }}>
            Attach a promo code players can use to claim this bonus.
          </div>
        </div>
        <Toggle
          on={codeEnabled}
          onChange={setCodeEnabled}
          label={codeEnabled ? "Enabled" : "Skip"}
        />
      </div>

      {codeEnabled && (
        <>
          <div className="field-group" style={{ marginTop: 16 }}>
            <div className="row-2">
              <div>
                <label>Promo code</label>
                <input
                  value={promoCode}
                  style={step4Errors.code ? { borderColor: "var(--red, #e53e3e)" } : undefined}
                  onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setStep4Errors((p) => ({ ...p, code: undefined })); }}
                  placeholder="e.g. WELCOME100"
                />
                {step4Errors.code && (
                  <div style={{ color: "var(--red, #e53e3e)", fontSize: 11, marginTop: 4 }}>
                    {step4Errors.code}
                  </div>
                )}
              </div>
              <div>
                <label>Display on</label>
                <select
                  value={codeDisplayOn}
                  onChange={(e) => setCodeDisplayOn(e.target.value)}
                >
                  <option value="DEPOSIT">DEPOSIT</option>
                  <option value="WITHDRAWAL">WITHDRAWAL</option>
                  <option value="REGISTRATION">REGISTRATION</option>
                </select>
              </div>
            </div>
          </div>

          <div className="field-group">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Toggle
                on={codeAutoApply}
                onChange={setCodeAutoApply}
                label={codeAutoApply ? "Auto-apply" : "Manual entry"}
              />
              <span className="helper" style={{ margin: 0 }}>
                {codeAutoApply
                  ? "Applied automatically — no entry needed."
                  : "Player must enter the code manually."}
              </span>
            </div>
          </div>
        </>
      )}
    </>
  );

  // ── STEP 5: REVIEW & SUBMIT ───────────────────────────────────────────────
  const selectedSegment = segmentId ? allSegments.find((s) => String(s.id) === segmentId) : null;
  const step5 = (
    <>
      <div className="field-group">
        <div className="row-2">
          <div>
            <label>Priority</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(+e.target.value)}
            />
          </div>
          <div>
            <label>Status</label>
            <div style={{ height: 36, display: "flex", alignItems: "center" }}>
              <Toggle
                on={active}
                onChange={setActive}
                label={active ? "Active" : "Paused"}
              />
            </div>
          </div>
        </div>
      </div>

      <hr style={{ margin: "16px 0 12px", border: "none", borderTop: "1px solid var(--g200)" }} />
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--g400)", textTransform: "uppercase", marginBottom: 12 }}>
        Promotion Summary
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
        {/* Basic */}
        <div style={{ background: "var(--g50)", borderRadius: "var(--r)", padding: "10px 12px" }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--g700)" }}>Basic</div>
          <SummaryRow label="Name" value={name || "—"} />
          <SummaryRow label="Frequency" value={freq} />
          {startDate && <SummaryRow label="Start" value={new Date(startDate).toLocaleString()} />}
          {endDate && <SummaryRow label="End" value={new Date(endDate).toLocaleString()} />}
          <SummaryRow
            label="Bonus"
            value={
              mechanicsTab === "fixed"
                ? fixed ? `₹${fixed}${max ? ` (max ₹${max})` : ""}` : "—"
                : pct ? `${pct}%${max ? ` up to ₹${max}` : ""}` : "—"
            }
          />
          {chunksOn && <SummaryRow label="Chunks" value={`${chunks} × ${chunkExp}d expiry`} />}
        </div>

        {/* Release & Trigger */}
        <div style={{ background: "var(--g50)", borderRadius: "var(--r)", padding: "10px 12px" }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--g700)" }}>Release & Trigger</div>
          <SummaryRow label="Chunked release" value={chunksOn ? "Yes" : "No"} />
          <SummaryRow label="Trigger" value={triggerEnabled ? triggerType.replace(/_/g, " ") : "None"} />
        </div>

        {/* Budget */}
        <div style={{ background: "var(--g50)", borderRadius: "var(--r)", padding: "10px 12px" }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--g700)" }}>Budget</div>
          <SummaryRow label="Type" value={isHardLimit ? "Hard limit" : "Soft limit"} />
          {dailyLimit && <SummaryRow label="Daily" value={`₹${Number(dailyLimit).toLocaleString()}`} />}
          {weeklyLimit && <SummaryRow label="Weekly" value={`₹${Number(weeklyLimit).toLocaleString()}`} />}
          {monthlyLimit && <SummaryRow label="Monthly" value={`₹${Number(monthlyLimit).toLocaleString()}`} />}
        </div>

        {/* Segments & Promo */}
        <div style={{ background: "var(--g50)", borderRadius: "var(--r)", padding: "10px 12px" }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--g700)" }}>Segments & Promo</div>
          <SummaryRow
            label="Audience"
            value={allPlayers ? "All players" : selectedSegment ? (selectedSegment.name ?? selectedSegment.label ?? segmentId) : segmentId || "—"}
          />
          <SummaryRow
            label="Promo code"
            value={codeEnabled && promoCode ? `${promoCode} · Display: ${codeDisplayOn}${codeAutoApply ? " · Auto-apply" : ""}` : "None"}
          />
        </div>
      </div>
    </>
  );

  // ── EDIT MODE: flat form ──────────────────────────────────────────────────
  if (mode === "edit") {
    return (
      <form onSubmit={handle} style={{ display: "contents" }}>
        <div className="drawer-body">{step1}</div>
        <DrawerFooter
          submitting={submitting}
          onCancel={onCancel}
          label="Save Changes"
        />
      </form>
    );
  }

  // ── Wizard navigation ─────────────────────────────────────────────────────
  const handleNext = () => {
    if (step === 1) {
      const errors: typeof step1Errors = {};
      if (!name.trim()) {
        errors.name = "Name is required.";
      }
      if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
        errors.dates = "End date must be on or after start date.";
      }
      if (mechanicsTab === "fixed" && (!fixed.trim() || Number(fixed) <= 0)) {
        errors.bonus = "Enter a positive fixed bonus amount.";
      }
      if (mechanicsTab === "percent" && (!pct.trim() || Number(pct) <= 0)) {
        errors.bonus = "Enter a positive bonus percentage.";
      }
      setStep1Errors(errors);
      if (Object.keys(errors).length > 0) return;
    }

    if (step === 2) {
      const errors: typeof step2Errors = {};
      if (cashbackOn && chunksOn) {
        const hasCbFixed = cbFixed.trim() !== "" && Number(cbFixed) > 0;
        const hasCbPct = cbPct.trim() !== "" && Number(cbPct) > 0;
        if (!hasCbFixed && !hasCbPct) {
          errors.cashback = "Enter a cashback fixed amount or percentage (must be > 0).";
        }
      }
      setStep2Errors(errors);
      if (Object.keys(errors).length > 0) return;
    }

    if (step === 3) {
      const errors: typeof budgetErrors = {};
      const caps = {
        daily: subLimitVal("DAILY"),
        weekly: subLimitVal("WEEKLY"),
        monthly: subLimitVal("MONTHLY"),
      };
      if (dailyLimit && Number(dailyLimit) <= 0)
        errors.daily = "Daily limit must be greater than 0.";
      else if (dailyLimit && caps.daily != null && Number(dailyLimit) > caps.daily)
        errors.daily = `Cannot exceed subhead daily limit of ₹${caps.daily.toLocaleString()}`;
      if (weeklyLimit && Number(weeklyLimit) <= 0)
        errors.weekly = "Weekly limit must be greater than 0.";
      else if (weeklyLimit && caps.weekly != null && Number(weeklyLimit) > caps.weekly)
        errors.weekly = `Cannot exceed subhead weekly limit of ₹${caps.weekly.toLocaleString()}`;
      if (monthlyLimit && Number(monthlyLimit) <= 0)
        errors.monthly = "Monthly limit must be greater than 0.";
      else if (monthlyLimit && caps.monthly != null && Number(monthlyLimit) > caps.monthly)
        errors.monthly = `Cannot exceed subhead monthly limit of ₹${caps.monthly.toLocaleString()}`;
      setBudgetErrors(errors);
      if (Object.keys(errors).length > 0) return;
    }

    if (step === 4) {
      const errors: typeof step4Errors = {};
      if (!allPlayers && !segmentId) {
        errors.segment = "Select a segment or switch back to all players.";
      }
      if (codeEnabled && !promoCode.trim()) {
        errors.code = "Enter a promo code or disable the promo code option.";
      }
      setStep4Errors(errors);
      if (Object.keys(errors).length > 0) return;
    }

    setStep((s) => s + 1);
  };

  // ── NEW MODE: wizard ──────────────────────────────────────────────────────
  const stepContent = [step1, step2, step3, step4, step5][step - 1];

  return (
    // Prevent any browser-native form submission in wizard mode — all
    // navigation and final submission are handled explicitly via buttons below.
    <form onSubmit={(e) => e.preventDefault()} style={{ display: "contents" }}>
      <div className="drawer-body">
        <StepIndicator step={step} />
        {stepContent}
      </div>

      <div className="drawer-footer">
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            width: "100%",
          }}
        >
          {step > 1 ? (
            <button
              type="button"
              className="btn"
              style={{ flex: 1 }}
              onClick={() => setStep((s) => s - 1)}
            >
              ← Back
            </button>
          ) : (
            <a
              className="cancel-link"
              style={{ flex: 1, textAlign: "center" }}
              onClick={onCancel}
            >
              Cancel
            </a>
          )}

          {step < WIZARD_STEPS.length ? (
            <button
              key="wizard-next"
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleNext}
            >
              Next →
            </button>
          ) : (
            <button
              key="wizard-submit"
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={submitting}
              onClick={() => onSubmit(buildPayload())}
            >
              {submitting ? (
                <>
                  <span className="spinner" /> Creating…
                </>
              ) : (
                "Create Configure"
              )}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
