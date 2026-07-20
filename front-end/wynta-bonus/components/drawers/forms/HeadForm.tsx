"use client";
import { useMemo, useState } from "react";
import { useAppSelector } from "../../../store/hooks";
import { selectHeadById } from "../../../store/slices/headsSlice";
import { selectAllUsers } from "wynta-react-common/store/slices/usersSlice";
import { selectAllBrands } from "wynta-react-common/store/slices/brandsSlice";
import Toggle from "wynta-react-common/components/Toggle";
import DrawerFooter from "../../../components/drawers/DrawerFooter";
import {
  toBudgetPayload,
  validateBudget,
  type BudgetField,
} from "../../../utils/budget";
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
  const [showErrors, setShowErrors] = useState(false);

  const inputs = { daily, weekly, monthly };
  const errors = useMemo(
    () => (mode === "new" ? validateBudget(inputs) : {}),
    [daily, weekly, monthly, mode], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const DESCRIPTION_MAX = 250;
  const NAME_PATTERN = /^[A-Za-z0-9 _-]*$/;
  const namePatternInvalid = name !== "" && !NAME_PATTERN.test(name);
  const nameError = namePatternInvalid
    ? "Only letters, numbers, spaces, - and _ are allowed."
    : !name.trim()
      ? "This field is required."
      : null;
  const nameVisibleError = namePatternInvalid || (nameError && showErrors) ? nameError : null;

  const ownerError = !owner ? "This field is required." : null;
  const ownerVisibleError = ownerError && showErrors ? ownerError : null;

  const brandError = mode === "new" && !selectedBrand ? "This field is required." : null;
  const brandVisibleError = brandError && showErrors ? brandError : null;

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    const hasBudgetErrors = mode === "new" && Object.keys(errors).length > 0;
    if (hasBudgetErrors || nameError || ownerError || brandError) {
      setShowErrors(true);
      return;
    }
    onSubmit({
      name,
      description,
      owner,
      site_id: selectedBrand,
      active,
      ...(mode === "new" ? { budget: toBudgetPayload(inputs) } : {}),
    });
  };

  const limitField = (
    label: string,
    field: BudgetField,
    value: string,
    setValue: (v: string) => void,
  ) => {
    const error = errors[field];
    return (
      <div className="field-group">
        <label>{label}</label>
        <input
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="leave empty for unlimited"
          style={error ? { borderColor: "#D64545" } : undefined}
        />
        {error && (
          <div className="helper" style={{ color: "#D64545" }}>
            {error}
          </div>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handle} noValidate style={{ display: "contents" }}>
      <div className="drawer-body">
        <div className="field-group">
          <label>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter head name"
            style={nameVisibleError ? { borderColor: "#D64545" } : undefined}
          />
          {nameVisibleError && (
            <div className="helper" style={{ color: "#D64545" }}>
              {nameVisibleError}
            </div>
          )}
        </div>
        <div className="field-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
            placeholder="What does this program do?"
            maxLength={DESCRIPTION_MAX}
          />
          <div className="helper">
            {description.length}/{DESCRIPTION_MAX}
          </div>
        </div>
        {mode === "new" && (
          <div className="field-group">
            <label>Brand</label>
            <input
              value={brandName}
              readOnly
              style={brandVisibleError ? { borderColor: "#D64545" } : undefined}
            />
            {brandVisibleError && (
              <div className="helper" style={{ color: "#D64545" }}>
                {brandVisibleError}
              </div>
            )}
          </div>
        )}
        <div className="field-group">
          <label>Owner</label>
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            style={ownerVisibleError ? { borderColor: "#D64545" } : undefined}
          >
            <option value="" disabled>
              Select owner…
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.display_name}>
                {u.display_name} — {u.role}
              </option>
            ))}
          </select>
          {ownerVisibleError && (
            <div className="helper" style={{ color: "#D64545" }}>
              {ownerVisibleError}
            </div>
          )}
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
            {limitField("Daily limit (₹)", "daily", daily, setDaily)}
            {limitField("Weekly limit (₹)", "weekly", weekly, setWeekly)}
            {limitField("Monthly limit (₹)", "monthly", monthly, setMonthly)}
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
