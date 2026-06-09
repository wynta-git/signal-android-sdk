"use client";
import { useState } from "react";
import { useAppSelector } from "../../../store/hooks";
import { selectSubheadById } from "../../../store/slices/subheadsSlice";
import { selectConfigureById } from "../../../store/slices/configuresSlice";
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

interface ConfigureFormProps {
  mode: "new" | "edit";
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
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

  const today = new Date().toISOString().slice(0, 10);
  const cfg = cfgFromStore;

  // ── Basic ──────────────────────────────────────────────────────────────────
  const [name, setName] = useState(cfg?.name || "");
  const [description, setDescription] = useState(cfg?.description || "");
  const [freq, setFreq] = useState<string>(
    cfg?.applicability_frequency || "ONCE",
  );
  const [startDate, setStartDate] = useState(
    cfg?.start_date ? String(cfg.start_date).slice(0, 10) : today,
  );
  const [endDate, setEndDate] = useState(
    cfg?.end_date ? String(cfg.end_date).slice(0, 10) : today,
  );
  const [priority, setPriority] = useState(cfg?.priority ?? 1);

  // ── Mechanics ─────────────────────────────────────────────────────────────
  const initMechanicsTab = () => {
    if (
      cfg?.bonus_amount_percent != null &&
      String(cfg.bonus_amount_percent) !== ""
    )
      return "percent";
    return "fixed";
  };
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

  // ── Wager / Chunks ────────────────────────────────────────────────────────
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

  // ── Chip Types ────────────────────────────────────────────────────────────
  const [wagerChip, setWagerChip] = useState(cfg?.wager_chip_type || "CASH");
  const [creditChip, setCreditChip] = useState(cfg?.credit_chip_type || "CASH");

  // ── Cashback ──────────────────────────────────────────────────────────────
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

  // ── Footer ────────────────────────────────────────────────────────────────
  const [bonusExp, setBonusExp] = useState(cfg?.bonus_expiry_days ?? 30);
  const [active, setActive] = useState(cfg ? cfg.active : true);

  const toNum = (v: string) => (v.trim() !== "" ? Number(v) : null);

  const freqMeta = FREQUENCIES.find((f) => f.value === freq);

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      description: description || null,
      applicability_frequency: freq,
      start_date: startDate + "T00:00:00",
      end_date: endDate + "T00:00:00",
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
      cashback_bonus_amount_fixed: cashbackOn ? toNum(cbFixed) : null,
      cashback_bonus_amount_percent: cashbackOn ? toNum(cbPct) : null,
      cashback_bonus_amount_max: cashbackOn ? toNum(cbMax) : null,
      bonus_expiry_days: bonusExp,
      active,
    });
  };

  return (
    <form onSubmit={handle} style={{ display: "contents" }}>
      <div className="drawer-body">
        {/* ── BASIC ─────────────────────────────────────────────────────── */}
        {/* <div
          className="section-divider-label"
          style={{ margin: 0, marginBottom: 12 }}
        >
          Basic
        </div> */}

        {parentSub && (
          <div className="field-group">
            <label>Parent Subhead</label>
            <span className="parent-chip">
              <Icon name="folder" size={11} /> {parentSub.name}
            </span>
          </div>
        )}

        <div className="field-group">
          <label>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. FD Match 100% — Slots"
            required
          />
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
          <label>Duration</label>

          <div className="row-2">
            <div>
              <label>Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label>End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Applicability Frequency with hint */}
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

        {/* ── MECHANICS ─────────────────────────────────────────────────── */}
        <div className="section-divider" />
        <div className="section-divider-label">Mechanics</div>

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
              onChange={(e) => setFixed(e.target.value)}
            />
            <div className="helper">
              Player receives this fixed rupee amount as bonus.
            </div>
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
                  onChange={(e) => setPct(e.target.value)}
                  style={{ paddingRight: 28 }}
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
              <div className="helper">
                Bonus = this % of the qualifying deposit / wager amount.
              </div>
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

        {/* ── CHUNKS & RELEASE ──────────────────────────────────────────── */}
        <div className="section-divider" />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: chunksOn ? 12 : 0,
          }}
        >
          <div className="section-divider-label" style={{ margin: 0 }}>
            Chunked Release
          </div>
          <Toggle
            on={chunksOn}
            onChange={(v) => {
              setChunksOn(v);
              if (!v) {
                setFullRelease(false);
              }
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
                {chunks !== 1 ? "s" : ""}, each released after {wagerMult}×
                wager of its value.
              </div>
            </div>

            <div className="field-group">
              <label>Chunk expiry (days)</label>
              <input
                type="number"
                min={1}
                value={chunkExp}
                onChange={(e) => setChunkExp(+e.target.value)}
                style={{ maxWidth: 120 }}
              />
              <div className="helper">
                Each chunk expires this many days after it is issued.
              </div>
            </div>

            <div className="field-group">
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
          </>
        )}

        {/* ── CASHBACK ──────────────────────────────────────────────────── */}
        {chunksOn && (
          <>
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
                        onChange={(e) => setCbFixed(e.target.value)}
                      />
                    </div>
                    <div>
                      <label>Cashback percent (%)</label>
                      <div style={{ position: "relative" }}>
                        <input
                          value={cbPct}
                          placeholder="e.g. 10"
                          onChange={(e) => setCbPct(e.target.value)}
                          style={{ paddingRight: 28 }}
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
              </>
            )}
          </>
        )}

        {/* ── FOOTER SETTINGS ───────────────────────────────────────────── */}
        <div className="section-divider" />
        <div className="section-divider-label">Status</div>

        <div className="field-group">
          <label>Priority</label>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(+e.target.value)}
            style={{ maxWidth: 100 }}
          />
        </div>

        <div className="field-group">
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
      <DrawerFooter
        submitting={submitting}
        onCancel={onCancel}
        label={mode === "new" ? "Create Configure" : "Save Changes"}
      />
    </form>
  );
}
