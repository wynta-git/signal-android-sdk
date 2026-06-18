"use client";
import { useState } from "react";
import Toggle from "wynta-react-common/components/Toggle";
import DrawerFooter from "../../../components/drawers/DrawerFooter";
import type { DrawerState } from "../../../types";

interface ChunkFormProps {
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function ChunkForm({ state, submitting, onCancel, onSubmit }: ChunkFormProps) {
  const c = state.configure ?? {};

  const n = (key: string, fallback: number) => {
    const v = c[key];
    return v != null && v !== "" ? Number(v) : fallback;
  };
  const s = (key: string, fallback: string) => (c[key] != null ? String(c[key]) : fallback);

  const [wagerMult, setWagerMult] = useState(() => n("wager_multiplier", 1.5));
  const [chunks, setChunks] = useState(() => n("no_of_chunks", 1));
  const [chunkExp, setChunkExp] = useState(() => n("chunk_expiry_days", 7));
  const [wagerChip, setWagerChip] = useState(() => s("wager_chip_type", "CASH"));
  const [creditChip, setCreditChip] = useState(() => s("credit_chip_type", "BONUS"));
  const [bonusExp, setBonusExp] = useState(() => n("bonus_expiry_days", 30));
  const [fullRelease, setFullRelease] = useState(() => c.release_bucket === "FULL");

  const hasCb =
    (c.cashback_bonus_amount_fixed != null && String(c.cashback_bonus_amount_fixed) !== "") ||
    (c.cashback_bonus_amount_percent != null && String(c.cashback_bonus_amount_percent) !== "");
  const [cashbackOn, setCashbackOn] = useState(hasCb);
  const [cbFixed, setCbFixed] = useState(() => c.cashback_bonus_amount_fixed != null ? String(c.cashback_bonus_amount_fixed) : "");
  const [cbPct, setCbPct] = useState(() => c.cashback_bonus_amount_percent != null ? String(c.cashback_bonus_amount_percent) : "");
  const [cbMax, setCbMax] = useState(() => c.cashback_bonus_amount_max != null ? String(c.cashback_bonus_amount_max) : "");

  const toNum = (v: string) => (v.trim() !== "" ? Number(v) : null);

  const handle = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    onSubmit({
      wager_multiplier: wagerMult,
      no_of_chunks: chunks,
      chunk_expiry_days: chunkExp,
      wager_chip_type: wagerChip,
      credit_chip_type: creditChip,
      bonus_expiry_days: bonusExp,
      release_bucket: fullRelease ? "FULL" : null,
      cashback_bonus_amount_fixed: cashbackOn ? toNum(cbFixed) : null,
      cashback_bonus_amount_percent: cashbackOn ? toNum(cbPct) : null,
      cashback_bonus_amount_max: cashbackOn ? toNum(cbMax) : null,
    });
  };

  return (
    <form onSubmit={handle} style={{ display: "contents" }}>
      <div className="drawer-body">
        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Wager multiplier</label>
              <input type="number" min={0} step={0.1} value={wagerMult} onChange={(e) => setWagerMult(+e.target.value)} />
            </div>
            <div>
              <label>No. of chunks</label>
              <input type="number" min={1} value={chunks} onChange={(e) => setChunks(+e.target.value)} />
            </div>
          </div>
          <div className="helper">
            Bonus split into <strong>{chunks}</strong> chunk{chunks !== 1 ? "s" : ""}, each released after {wagerMult}× wager of its value.
          </div>
        </div>

        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Chunk expiry (days)</label>
              <input type="number" min={1} value={chunkExp} onChange={(e) => setChunkExp(+e.target.value)} />
            </div>
            <div>
              <label>Wager chip type</label>
              <select value={wagerChip} onChange={(e) => setWagerChip(e.target.value)}>
                <option>CASH</option>
                <option>BONUS</option>
                <option>COINS</option>
              </select>
            </div>
          </div>
        </div>

        <div className="field-group">
          <Toggle on={fullRelease} onChange={setFullRelease} label={fullRelease ? "Full bucket release" : "Partial release"} />
          <div className="helper" style={{ marginTop: 4 }}>
            Full — entire remaining bonus released at once when wager is met.
          </div>
        </div>

        <div className="section-divider" />
        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Bonus expiry (days)</label>
              <input type="number" min={1} value={bonusExp} onChange={(e) => setBonusExp(+e.target.value)} />
            </div>
            <div>
              <label>Credit chip type</label>
              <select value={creditChip} onChange={(e) => setCreditChip(e.target.value)}>
                <option>BONUS</option>
                <option>COINS</option>
              </select>
            </div>
          </div>
        </div>

        <div className="section-divider" />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: cashbackOn ? 12 : 0 }}>
          <div className="section-divider-label" style={{ margin: 0 }}>Cashback Bonus</div>
          <Toggle on={cashbackOn} onChange={(v) => { setCashbackOn(v); if (!v) { setCbFixed(""); setCbPct(""); setCbMax(""); } }} label={cashbackOn ? "Enabled" : "Disabled"} />
        </div>

        {cashbackOn && (
          <>
            <div className="field-group" style={{ marginTop: 12 }}>
              <div className="row-2">
                <div>
                  <label>Cashback fixed (₹)</label>
                  <input value={cbFixed} placeholder="e.g. 200" onChange={(e) => setCbFixed(e.target.value)} />
                </div>
                <div>
                  <label>Cashback percent (%)</label>
                  <input value={cbPct} placeholder="e.g. 10" onChange={(e) => setCbPct(e.target.value)} />
                </div>
              </div>
              <div className="helper">Use either fixed or percent. Leave the other empty.</div>
            </div>
            <div className="field-group">
              <label>Max cashback (₹)</label>
              <input value={cbMax} placeholder="leave empty for ∞" onChange={(e) => setCbMax(e.target.value)} />
            </div>
          </>
        )}
      </div>
      <DrawerFooter submitting={submitting} onCancel={onCancel} label="Save Changes" />
    </form>
  );
}
