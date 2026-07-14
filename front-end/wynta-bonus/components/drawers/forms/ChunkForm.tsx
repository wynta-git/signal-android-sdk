"use client";
import { useEffect, useState } from "react";
import { useAppSelector } from "../../../store/hooks";
import Toggle from "wynta-react-common/components/Toggle";
import DrawerFooter from "../../../components/drawers/DrawerFooter";
import { api } from "../../../services/api";
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

  const [chunksOn, setChunksOn] = useState(() => n("no_of_chunks", 1) > 1 || n("wager_multiplier", 0) > 0);
  const [wagerMult, setWagerMult] = useState(() => n("wager_multiplier", 1.5));
  const [chunks, setChunks] = useState(() => n("no_of_chunks", 1));
  const [chunkExp, setChunkExp] = useState(() => n("chunk_expiry_days", 7));
  const [wagerChip, setWagerChip] = useState(() => s("wager_chip_type", "CASH"));
  const [creditChip, setCreditChip] = useState(() => s("credit_chip_type", "BONUS"));
  const [bonusExp, setBonusExp] = useState(() => n("bonus_expiry_days", 30));
  const [fullRelease, setFullRelease] = useState(() => c.release_bucket === "FULL");

  // Per-product wager multiplier overrides — same add-button row pattern as
  // ConfigureForm.tsx. Product list comes from the site's wager_multiplier_config
  // (site-configure API, a JSON array of product names). Rows are pre-populated
  // only from this bonus's existing saved overrides.
  const selectedBrand = useAppSelector((s) => s.ui.selectedBrand);
  const [wagerMultProducts, setWagerMultProducts] = useState<string[]>([]);
  const [productMultRows, setProductMultRows] = useState<
    { product: string; multiplier: number }[]
  >(() => {
    const raw = c.product_wager_multiplier;
    if (!raw || typeof raw !== "object") return [];
    return Object.entries(raw as Record<string, unknown>).map(([product, multiplier]) => ({
      product,
      multiplier: Number(multiplier),
    }));
  });

  useEffect(() => {
    if (selectedBrand == null) return;
    api
      .getSiteConfigure(selectedBrand)
      .then((res) => {
        const raw = res?.wager_multiplier_config;
        if (!raw) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return;
        }
        if (!Array.isArray(parsed)) return;
        setWagerMultProducts(parsed.filter((p): p is string => typeof p === "string"));
      })
      .catch(() => {
        // site-configure fetch failed — fall back to the default wager multiplier only
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrand]);

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
      wager_multiplier: chunksOn ? wagerMult : null,
      product_wager_multiplier:
        chunksOn && productMultRows.some((r) => r.product.trim() !== "")
          ? Object.fromEntries(
              productMultRows
                .filter((r) => r.product.trim() !== "")
                .map((r) => [r.product, r.multiplier]),
            )
          : null,
      no_of_chunks: chunksOn ? chunks : null,
      chunk_expiry_days: chunksOn ? chunkExp : null,
      wager_chip_type: chunksOn ? wagerChip : null,
      release_bucket: chunksOn && fullRelease ? "FULL" : null,
      credit_chip_type: creditChip,
      bonus_expiry_days: bonusExp,
      cashback_bonus_amount_fixed: cashbackOn ? toNum(cbFixed) : null,
      cashback_bonus_amount_percent: cashbackOn ? toNum(cbPct) : null,
      cashback_bonus_amount_max: cashbackOn ? toNum(cbMax) : null,
    });
  };

  return (
    <form onSubmit={handle} style={{ display: "contents" }}>
      <div className="drawer-body">
        <div className="section-divider" />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: chunksOn ? 12 : 0 }}>
          <div className="section-divider-label" style={{ margin: 0 }}>Release in Chunks</div>
          <Toggle on={chunksOn} onChange={(v) => { setChunksOn(v); if (!v) setFullRelease(false); }} label={chunksOn ? "Enabled" : "Disabled"} />
        </div>

        {chunksOn && (
          <>
            <div className="field-group" style={{ marginTop: 12 }}>
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

            {(wagerMultProducts.length > 0 || productMultRows.length > 0) && (
              <div className="field-group">
                <label>
                  Product-based wager multipliers{" "}
                  <span style={{ color: "var(--g400)", fontWeight: 400 }}>
                    (optional — overrides the wager multiplier above for specific products)
                  </span>
                </label>
                {productMultRows.map((row, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <select
                      value={row.product}
                      style={{ flex: 1 }}
                      onChange={(e) =>
                        setProductMultRows((prev) =>
                          prev.map((r, j) => (j === i ? { ...r, product: e.target.value } : r)),
                        )
                      }
                    >
                      <option value="">— select product —</option>
                      {wagerMultProducts
                        .filter(
                          (p) => p === row.product || !productMultRows.some((r) => r.product === p),
                        )
                        .map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      placeholder="Multiplier"
                      style={{ flex: 1 }}
                      value={row.multiplier}
                      onChange={(e) =>
                        setProductMultRows((prev) =>
                          prev.map((r, j) => (j === i ? { ...r, multiplier: +e.target.value } : r)),
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
                        setProductMultRows((prev) => prev.filter((_, j) => j !== i))
                      }
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {wagerMultProducts.some(
                  (p) => !productMultRows.some((r) => r.product === p),
                ) && (
                  <button
                    type="button"
                    className="btn"
                    style={{ marginTop: 4, fontSize: 12 }}
                    onClick={() =>
                      setProductMultRows((prev) => [
                        ...prev,
                        {
                          product:
                            wagerMultProducts.find(
                              (p) => !prev.some((r) => r.product === p),
                            ) ?? "",
                          multiplier: wagerMult,
                        },
                      ])
                    }
                  >
                    + Add product multiplier
                  </button>
                )}
              </div>
            )}

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
          </>
        )}

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
