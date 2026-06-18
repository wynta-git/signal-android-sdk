"use client";
import { useState } from "react";
import { useAppSelector } from "../../../store/hooks";
import { selectConfigureById } from "../../../store/slices/configuresSlice";
import Icon from "wynta-react-common/components/Icon";
import Toggle from "wynta-react-common/components/Toggle";
import DrawerFooter from "../../../components/drawers/DrawerFooter";
import type { DrawerState } from "../../../types";

const TRIGGER_TYPES = [
  "DEPOSIT",
  "REGISTRATION",
  "APP_VISIT",
  "BET_PLACED",
  "LEADERBOARD_WON",
  "TOURNAMENT_WON",
  "FRIEND_SIGNUP",
  "LOGIN",
] as const;

interface TriggerFormProps {
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function TriggerForm({
  state,
  submitting,
  onCancel,
  onSubmit,
}: TriggerFormProps) {
  const isEdit = state.type === 'EDIT_TRIGGER';
  const existing = state.trigger;
  const existingConfig = (existing?.trigger_config ?? {}) as Record<string, unknown>;

  const cfg = useAppSelector(
    state.parentId != null
      ? selectConfigureById(state.parentId)
      : () => undefined,
  );

  const [triggerType, setTriggerType] =
    useState<(typeof TRIGGER_TYPES)[number]>(
      (existing?.trigger_type as (typeof TRIGGER_TYPES)[number]) ?? "DEPOSIT"
    );
  const [minAmount, setMinAmount] = useState(existingConfig.min_amount != null ? String(existingConfig.min_amount) : "");
  const [maxAmount, setMaxAmount] = useState(existingConfig.max_amount != null ? String(existingConfig.max_amount) : "");
  const [paymentMethod, setPaymentMethod] = useState((existingConfig.payment_method as string) ?? "");
  const [product, setProduct] = useState((existingConfig.product as string) ?? "");
  const [active, setActive] = useState(existing?.active !== undefined ? Boolean(existing.active) : true);

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    const cfg: Record<string, unknown> = {};
    if (minAmount) cfg.min_amount = Number(minAmount);
    if (maxAmount) cfg.max_amount = Number(maxAmount);
    if (paymentMethod) cfg.payment_method = paymentMethod;
    if (product) cfg.product = product;
    onSubmit({
      trigger_type: triggerType,
      trigger_config: Object.keys(cfg).length ? cfg : null,
      active,
    });
  };

  return (
    <form onSubmit={handle} style={{ display: "contents" }}>
      <div className="drawer-body">
        {cfg && (
          <div className="field-group">
            <label>Configure</label>
            <span className="parent-chip">
              <Icon name="settings-2" size={11} /> {cfg.name}
            </span>
          </div>
        )}
        <div className="field-group">
          <label>Trigger Type</label>
          <div className="seg" style={{ "--cols": 2 } as React.CSSProperties}>
            {TRIGGER_TYPES.map((t) => (
              <button
                type="button"
                key={t}
                className={triggerType === t ? "active" : ""}
                onClick={() => setTriggerType(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Min trigger amount (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                placeholder="500"
              />
            </div>
            <div>
              <label>Max trigger amount (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                placeholder="10000"
              />
            </div>
          </div>
        </div>
        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Payment method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="">Any</option>
                <option>UPI</option>
                <option>NETBANKING</option>
                <option>CARD</option>
                <option>WALLET</option>
              </select>
            </div>
            <div>
              <label>Product</label>
              <select
                value={product}
                onChange={(e) => setProduct(e.target.value)}
              >
                <option value="">Any</option>
                <option>POKER</option>
                <option>CASINO</option>
                <option>RUMMY</option>
              </select>
            </div>
          </div>
        </div>
        <div className="field-group">
          <Toggle
            on={active}
            onChange={setActive}
            label={active ? "Active" : "Inactive"}
          />
        </div>
      </div>
      <DrawerFooter
        submitting={submitting}
        onCancel={onCancel}
        label={isEdit ? "Save Changes" : "Add Trigger"}
      />
    </form>
  );
}
