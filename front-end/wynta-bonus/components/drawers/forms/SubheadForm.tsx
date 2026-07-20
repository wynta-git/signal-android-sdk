"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import { fetchHead, selectHeadById } from "../../../store/slices/headsSlice";
import { selectSubheadById } from "../../../store/slices/subheadsSlice";
import { selectAllUsers } from "wynta-react-common/store/slices/usersSlice";
import Icon from "wynta-react-common/components/Icon";
import Toggle from "wynta-react-common/components/Toggle";
import DrawerFooter from "../../../components/drawers/DrawerFooter";
import {
  FIELD_TO_PERIOD,
  limitMap,
  toBudgetPayload,
  validateBudget,
  type BudgetField,
} from "../../../utils/budget";
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
  const dispatch = useAppDispatch();
  const users = useAppSelector(selectAllUsers);
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
  const [owner, setOwner] = useState(sub?.owner ?? "");
  const [active, setActive] = useState(sub?.active ?? true);
  const [daily, setDaily] = useState("");
  const [weekly, setWeekly] = useState("");
  const [monthly, setMonthly] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  // The head summary list has no budget — load the detail so caps are known.
  useEffect(() => {
    if (mode !== "new" || parentHeadId == null) return;
    if (!parentHead || parentHead.budget.length === 0) {
      dispatch(fetchHead(parentHeadId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, parentHeadId]);

  const headLimits = useMemo(
    () => limitMap(parentHead?.budget),
    [parentHead?.budget],
  );

  // Default the subhead limits to the parent head's limits, once, and only if
  // the user hasn't typed anything yet.
  const prefilled = useRef(false);
  useEffect(() => {
    if (mode !== "new" || prefilled.current) return;
    if (!parentHead || parentHead.budget.length === 0) return;
    prefilled.current = true;
    if (daily === "" && weekly === "" && monthly === "") {
      setDaily(headLimits.DAILY != null ? String(headLimits.DAILY) : "");
      setWeekly(headLimits.WEEKLY != null ? String(headLimits.WEEKLY) : "");
      setMonthly(headLimits.MONTHLY != null ? String(headLimits.MONTHLY) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, parentHead, headLimits]);

  const inputs = { daily, weekly, monthly };
  const errors = useMemo(
    () => (mode === "new" ? validateBudget(inputs, headLimits) : {}),
    [daily, weekly, monthly, headLimits, mode], // eslint-disable-line react-hooks/exhaustive-deps
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

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    const hasBudgetErrors = mode === "new" && Object.keys(errors).length > 0;
    if (hasBudgetErrors || nameError || ownerError) {
      setShowErrors(true);
      return;
    }
    onSubmit({
      name,
      description,
      owner,
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
    const cap = headLimits[FIELD_TO_PERIOD[field]];
    const error = errors[field];
    // Errors from typing show immediately; "required" gaps only after submit.
    const visibleError = error && (value !== "" || showErrors) ? error : null;

    const rawPct =
      cap != null && value !== ""
        ? (parseFloat(value) / Number(cap)) * 100
        : null;
    const pct =
      rawPct == null
        ? null
        : rawPct < 1
          ? parseFloat(rawPct.toFixed(2))
          : Math.round(rawPct);

    return (
      <div className="field-group">
        <label>{label}</label>
        <input
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={cap != null ? `up to ₹${cap}` : "leave empty for unlimited"}
          style={visibleError ? { borderColor: "#D64545" } : undefined}
        />
        {visibleError ? (
          <div className="helper" style={{ color: "#D64545" }}>
            {visibleError}
          </div>
        ) : (
          (parentHead?.budget?.length ?? 0) > 0 && (
            <div className="helper">
              Head cap: {cap != null ? `₹${cap}` : "Uncapped"}
              {pct != null && (
                <span
                  style={{
                    marginLeft: 6,
                    color: pct > 100 ? "#D64545" : pct >= 80 ? "#C47C00" : "var(--g500)",
                    fontWeight: 500,
                  }}
                >
                  · {pct}% of head
                </span>
              )}
            </div>
          )
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handle} noValidate style={{ display: "contents" }}>
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
            placeholder="Short summary"
            maxLength={DESCRIPTION_MAX}
          />
          <div className="helper">
            {description.length}/{DESCRIPTION_MAX}
          </div>
        </div>
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
              Budget Limits
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
