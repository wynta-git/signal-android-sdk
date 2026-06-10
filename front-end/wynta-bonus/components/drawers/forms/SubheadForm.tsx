"use client";
import { useState } from "react";
import { useAppSelector } from "../../../store/hooks";
import { selectHeadById } from "../../../store/slices/headsSlice";
import { selectSubheadById } from "../../../store/slices/subheadsSlice";
import Icon from "wynta-react-common/components/Icon";
import Toggle from "wynta-react-common/components/Toggle";
import DrawerFooter from "../../../components/drawers/DrawerFooter";
import type { DrawerState } from "../../../types";

interface SubheadFormProps {
  mode: "new" | "edit";
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function SubheadForm({
  mode,
  state,
  submitting,
  onCancel,
  onSubmit,
}: SubheadFormProps) {
  const subFromStore = useAppSelector(
    state.id != null ? selectSubheadById(state.id) : () => undefined,
  );
  const sub = mode === "edit" ? subFromStore : undefined;

  const parentHeadId = state.parentId ?? sub?.head_id ?? sub?.parent_head_id;
  const parentHead = useAppSelector(
    parentHeadId != null ? selectHeadById(parentHeadId) : () => undefined,
  );

  const [name, setName] = useState(sub?.name ?? "");
  const [description, setDescription] = useState(sub?.description ?? "");
  const [owner, setOwner] = useState(sub?.owner ?? "vanessa@wynta.com");
  const [active, setActive] = useState(sub?.active ?? true);
  const [daily, setDaily] = useState("");
  const [weekly, setWeekly] = useState("");
  const [monthly, setMonthly] = useState("");

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    const budget = [
      { period_type: "DAILY" as const, budget_limit: Number(daily) },
      { period_type: "WEEKLY" as const, budget_limit: Number(weekly) },
      { period_type: "MONTHLY" as const, budget_limit: Number(monthly) },
    ];
    onSubmit({
      name,
      description,
      owner,
      active,
      ...(mode === "new" ? { budget } : {}),
    });
  };

  return (
    <form onSubmit={handle} style={{ display: "contents" }}>
      <div className="drawer-body">
        {parentHead && (
          <div className="field-group">
            <label>Parent Head</label>
            <span className="parent-chip">
              <Icon name="folder" size={11} /> {parentHead.name}
            </span>
          </div>
        )}
        <div className="field-group">
          <label>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. First Deposit Match"
            required
          />
        </div>
        <div className="field-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short summary"
          />
        </div>
        <div className="field-group">
          <label>Owner</label>
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option>vanessa@wynta.com</option>
            <option>demo@wynta.com</option>
            <option>priya@wynta.com</option>
            <option>ops@wynta.com</option>
          </select>
        </div>
        {mode === "new" && (
          <>
            <div
              style={{
                fontWeight: 600,
                fontSize: 12,
                color: "var(--g600)",
                marginBottom: 4,
                marginTop: 4,
              }}
            >
              Budget
            </div>
            <div className="field-group">
              <label>Daily limit (₹)</label>
              <input
                type="number"
                min="0"
                value={daily}
                onChange={(e) => setDaily(e.target.value)}
                placeholder="leave empty for ∞"
                required
              />
            </div>
            <div className="field-group">
              <label>Weekly limit (₹)</label>
              <input
                type="number"
                min="0"
                value={weekly}
                onChange={(e) => setWeekly(e.target.value)}
                placeholder="leave empty for ∞"
                required
              />
            </div>
            <div className="field-group">
              <label>Monthly limit (₹)</label>
              <input
                type="number"
                min="0"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
                placeholder="leave empty for ∞"
                required
              />
            </div>
          </>
        )}
        <div className="field-group">
          <Toggle
            on={active}
            onChange={setActive}
            label={active ? "Active" : "Paused"}
          />
        </div>
      </div>
      <DrawerFooter
        submitting={submitting}
        onCancel={onCancel}
        label={mode === "new" ? "Create Subhead" : "Save Changes"}
      />
    </form>
  );
}
