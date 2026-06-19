"use client";
import { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import { selectHeadById } from "../../../store/slices/headsSlice";
import { selectSubheadById } from "../../../store/slices/subheadsSlice";
import { selectConfigureById } from "../../../store/slices/configuresSlice";
import { fetchBudget, selectBudget } from "../../../store/slices/budgetsSlice";
import Icon from "wynta-react-common/components/Icon";
import DrawerFooter from "../../../components/drawers/DrawerFooter";
import { limitMap, validateBudget } from "../../../utils/budget";
import type { BudgetPeriod, DrawerState } from "../../../types";

interface BudgetFormProps {
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function BudgetForm({
  state,
  submitting,
  onCancel,
  onSubmit,
}: BudgetFormProps) {
  const dispatch = useAppDispatch();
  const scope = state.scope ?? "head";

  const headEntity = useAppSelector(
    scope === "head" && state.id != null
      ? selectHeadById(state.id)
      : () => undefined,
  );
  const subheadEntity = useAppSelector(
    scope === "subhead" && state.id != null
      ? selectSubheadById(state.id)
      : () => undefined,
  );

  const parentHeadId = subheadEntity?.parent_head_id ?? subheadEntity?.head_id;
  const parentHeadEntity = useAppSelector(
    scope === "subhead" && parentHeadId != null
      ? selectHeadById(parentHeadId)
      : () => undefined,
  );

  const configureEntity = useAppSelector(
    scope === "configure" && state.id != null
      ? selectConfigureById(state.id)
      : () => undefined,
  );

  const configureBudget: BudgetPeriod[] =
    useAppSelector(
      scope === "configure" && state.id != null
        ? selectBudget("configure", state.id)
        : () => undefined,
    ) ?? [];

  const budgetFetched = useAppSelector(
    (s) =>
      scope === "configure" && state.id != null
        ? s.budgets.status[`configure:${state.id}`] === "succeeded"
        : true,
  );

  const sourceName: string =
    scope === "head"
      ? (headEntity?.name ?? "")
      : scope === "subhead"
        ? (subheadEntity?.name ?? "")
        : (configureEntity?.name ?? "");

  const ownBudget: BudgetPeriod[] =
    scope === "head"
      ? (headEntity?.budget ?? [])
      : scope === "subhead"
        ? (subheadEntity?.budget ?? [])
        : scope === "configure"
          ? configureBudget
          : [];

  const inherits =
    scope === "configure" && budgetFetched && configureBudget.length === 0;

  const scopeLabel =
    { head: "Head", subhead: "Subhead", configure: "Configure" }[scope] ??
    "Head";
  const scopeIcon =
    { head: "folder", subhead: "folder-tree", configure: "settings-2" }[
      scope
    ] ?? "folder";

  const findLimit = (pt: string) =>
    ownBudget.find((b) => b.period_type === pt)?.limit;

  const findHeadLimit = (pt: string): number | null => {
    if (scope !== "subhead" || !parentHeadEntity) return null;
    const b = parentHeadEntity.budget?.find((b) => b.period_type === pt);
    if (!b) return null;
    const v = b.limit ?? b.budget_limit;
    return v != null ? Number(v) : null;
  };

  const [daily, setDaily] = useState<string>(
    findLimit("DAILY") != null ? String(findLimit("DAILY")) : "",
  );
  const [weekly, setWeekly] = useState<string>(
    findLimit("WEEKLY") != null ? String(findLimit("WEEKLY")) : "",
  );
  const [monthly, setMonthly] = useState<string>(
    findLimit("MONTHLY") != null ? String(findLimit("MONTHLY")) : "",
  );

  const [errors, setErrors] = useState<{
    daily?: string;
    weekly?: string;
    monthly?: string;
  }>({});

  // For configure scope: list endpoint omits budget. Fetch via budgetsSlice so
  // the result lands in isolated storage that won't be overwritten by a
  // concurrent fetchConfiguresBySubhead call.
  useEffect(() => {
    if (scope === "configure" && state.id != null) {
      dispatch(fetchBudget({ scope: "configure", id: state.id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, state.id]);

  // Once budget arrives (async), seed the inputs — but only before the user
  // has made any edits (tracked by the ref).
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || ownBudget.length === 0) return;
    seeded.current = true;
    const d = ownBudget.find((b) => b.period_type === "DAILY");
    const w = ownBudget.find((b) => b.period_type === "WEEKLY");
    const m = ownBudget.find((b) => b.period_type === "MONTHLY");
    const toStr = (p: typeof d) => {
      const v = p?.limit ?? p?.budget_limit;
      return v != null ? String(v) : "";
    };
    setDaily(toStr(d));
    setWeekly(toStr(w));
    setMonthly(toStr(m));
  }, [ownBudget]);

  const validate = (): boolean => {
    const parentLimits =
      scope === "subhead" && parentHeadEntity
        ? limitMap(parentHeadEntity.budget)
        : undefined;
    const errs = validateBudget({ daily, weekly, monthly }, parentLimits);
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      return;
    }
    const periods: BudgetPeriod[] = [
      ...(daily !== ""
        ? [{ period_type: "DAILY" as const, limit: daily }]
        : [{ period_type: "DAILY" as const, limit: null }]),
      ...(weekly !== ""
        ? [{ period_type: "WEEKLY" as const, limit: weekly }]
        : [{ period_type: "WEEKLY" as const, limit: null }]),
      ...(monthly !== ""
        ? [{ period_type: "MONTHLY" as const, limit: monthly }]
        : [{ period_type: "MONTHLY" as const, limit: null }]),
    ];
    onSubmit({ periods });
  };

  const headLimitHint = (pt: "DAILY" | "WEEKLY" | "MONTHLY") => {
    const hl = findHeadLimit(pt);
    return hl != null ? `max ₹${hl} (head cap)` : "leave empty for ∞";
  };

  return (
    <form onSubmit={handle} style={{ display: "contents" }}>
      <div className="drawer-body">
        {sourceName && (
          <div className="field-group">
            <label>{scopeLabel}</label>
            <span className="parent-chip">
              <Icon name={scopeIcon} size={11} /> {sourceName}
            </span>
          </div>
        )}
        {scope === "subhead" && parentHeadEntity && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "var(--r)",
              background: "var(--bp)",
              border: "1px solid var(--bm)",
              fontSize: 12,
              color: "var(--blue)",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="info" size={13} />
            Limits must not exceed the parent head{" "}
            <strong>{parentHeadEntity.name}</strong>.
          </div>
        )}
        {inherits && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "var(--r)",
              background: "var(--bp)",
              border: "1px solid var(--bm)",
              fontSize: 12,
              color: "var(--blue)",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="info" size={13} />
            This configure currently inherits its budget from its subhead. Set
            any limit below to give it its own cap.
          </div>
        )}
        <div className="field-group">
          <label>Daily limit (₹)</label>
          <input
            value={daily}
            onChange={(e) => {
              setDaily(e.target.value);
              setErrors((prev) => ({ ...prev, daily: undefined }));
            }}
            placeholder={
              scope === "subhead" ? headLimitHint("DAILY") : "leave empty for ∞"
            }
            style={errors.daily ? { borderColor: "var(--err)" } : undefined}
          />
          {errors.daily && (
            <span style={{ fontSize: 11, color: "var(--err)", marginTop: 3 }}>
              {errors.daily}
            </span>
          )}
        </div>
        <div className="field-group">
          <label>Weekly limit (₹)</label>
          <input
            value={weekly}
            onChange={(e) => {
              setWeekly(e.target.value);
              setErrors((prev) => ({ ...prev, weekly: undefined }));
            }}
            placeholder={
              scope === "subhead"
                ? headLimitHint("WEEKLY")
                : "leave empty for ∞"
            }
            style={errors.weekly ? { borderColor: "var(--err)" } : undefined}
          />
          {errors.weekly && (
            <span style={{ fontSize: 11, color: "var(--err)", marginTop: 3 }}>
              {errors.weekly}
            </span>
          )}
        </div>
        <div className="field-group">
          <label>Monthly limit (₹)</label>
          <input
            value={monthly}
            onChange={(e) => {
              setMonthly(e.target.value);
              setErrors((prev) => ({ ...prev, monthly: undefined }));
            }}
            placeholder={
              scope === "subhead"
                ? headLimitHint("MONTHLY")
                : "leave empty for ∞"
            }
            style={errors.monthly ? { borderColor: "var(--err)" } : undefined}
          />
          {errors.monthly && (
            <span style={{ fontSize: 11, color: "var(--err)", marginTop: 3 }}>
              {errors.monthly}
            </span>
          )}
        </div>
        <div className="helper" style={{ marginTop: 8 }}>
          When a period limit is hit,{" "}
          {scope === "head"
            ? "all configures under this head"
            : scope === "subhead"
              ? "this subhead's configures"
              : "this configure"}{" "}
          pause until reset.
        </div>
      </div>
      <DrawerFooter
        submitting={submitting}
        onCancel={onCancel}
        label="Save Budget"
      />
    </form>
  );
}
