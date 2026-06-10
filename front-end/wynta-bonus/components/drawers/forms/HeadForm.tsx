"use client";
import { useState } from "react";
import { useAppSelector } from "../../../store/hooks";
import { selectHeadById } from "../../../store/slices/headsSlice";
import { selectAllUsers } from "wynta-react-common/store/slices/usersSlice";
import { selectAllBrands } from "wynta-react-common/store/slices/brandsSlice";
import Toggle from "wynta-react-common/components/Toggle";
import DrawerFooter from "../../../components/drawers/DrawerFooter";
import type { DrawerState } from "../../../types";

interface HeadFormProps {
  mode: "new" | "edit";
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function HeadForm({
  mode,
  state,
  submitting,
  onCancel,
  onSubmit,
}: HeadFormProps) {
  const head = useAppSelector(selectHeadById(state.id ?? 0));
  const users = useAppSelector(selectAllUsers);
  const selectedBrand = useAppSelector((s) => s.ui.selectedBrand);
  const brands = useAppSelector(selectAllBrands);
  const brandName =
    brands.find((b) => b.site_id === selectedBrand)?.name ??
    String(selectedBrand ?? "");
  const [name, setName] = useState(head?.name || "");
  const [description, setDescription] = useState(head?.description || "");
  const [owner, setOwner] = useState(head?.owner || "");
  const [active, setActive] = useState(head ? head.active : true);
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
      site_id: selectedBrand,
      active,
      ...(mode === "new" ? { budget } : {}),
    });
  };

  return (
    <form onSubmit={handle} style={{ display: "contents" }}>
      <div className="drawer-body">
        <div className="field-group">
          <label>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Welcome Bonus Program"
            required
          />
        </div>
        <div className="field-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this program do?"
          />
        </div>
        {mode === "new" && (
          <div className="field-group">
            <label>Brand</label>
            <input value={brandName} readOnly />
          </div>
        )}
        <div className="field-group">
          <label>Owner</label>
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            required
          >
            <option value="" disabled>
              Select owner…
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.username}>
                {u.username} — {u.user_type}
              </option>
            ))}
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
          <div className="helper">
            Paused heads stop releasing bonuses across all their configures.
          </div>
        </div>
      </div>
      <DrawerFooter
        submitting={submitting}
        onCancel={onCancel}
        label={mode === "new" ? "Create Head" : "Save Changes"}
      />
    </form>
  );
}
