"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAppSelector, useAppDispatch } from "../../store/hooks";
import { closeDrawer } from "../../store/slices/uiSlice";
import {
  createHead,
  updateHead,
  fetchHead,
  selectAllHeads,
} from "../../store/slices/headsSlice";
import {
  createSubhead,
  updateSubhead,
  fetchSubhead,
  selectSubheadById,
} from "../../store/slices/subheadsSlice";
import {
  createConfigure,
  updateConfigure,
  fetchConfigure,
  fetchConfiguresBySubhead,
  createTrigger,
  createPromoCode,
  updatePromoCode,
  createEligibility,
} from "../../store/slices/configuresSlice";
import { updateBudget } from "../../store/slices/budgetsSlice";
import { updateOwners } from "../../store/slices/ownersSlice";
import type { BudgetPeriod, OwnerEntry } from "../../types";
import Icon from "wynta-react-common/components/Icon";
import DrawerForm from "./DrawerForm";
import type { DrawerType } from "../../types";

interface DrawerMeta {
  title: string;
  icon: string;
}

const DRAWER_TITLES: Record<DrawerType, DrawerMeta> = {
  NEW_HEAD: { title: "Add Bonus Head", icon: "folder-plus" },
  EDIT_HEAD: { title: "Edit Bonus Head", icon: "pencil" },
  NEW_SUBHEAD: { title: "Add Subhead", icon: "plus-circle" },
  EDIT_SUBHEAD: { title: "Edit Subhead", icon: "pencil" },
  NEW_CONFIGURE: { title: "Add Bonus Configure", icon: "settings-2" },
  EDIT_CONFIGURE: { title: "Edit Configure", icon: "pencil" },
  NEW_PROMOCODE: { title: "Add Promo Code", icon: "ticket" },
  EDIT_PROMOCODE: { title: "Edit Promo Code", icon: "pencil" },
  NEW_ELIGIBILITY: { title: "Add Eligibility Criterion", icon: "filter" },
  NEW_TRIGGER: { title: "Add Release Trigger", icon: "zap" },
  EDIT_BUDGET: { title: "Manage Budget", icon: "wallet" },
  EDIT_OWNERS: { title: "Manage Owners", icon: "users" },
  NEW_MANUAL_BONUS: { title: "New Manual Campaign", icon: "send" },
  ISSUE_CODE_BONUS: { title: "Issue Manual Bonus", icon: "send" },
};

export default function SlideDrawer() {
  const dispatch = useAppDispatch();
  const drawerState = useAppSelector((s) => s.ui.drawerState);
  const selectedBrand = useAppSelector((s) => s.ui.selectedBrand);
  const bridgeData = useAppSelector((s) => s.users.bridgeData);
  const currentUser: string =
    (bridgeData?.user as { username?: string } | null)?.username ?? "system";
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const open = !!drawerState;
  const cfg = drawerState && DRAWER_TITLES[drawerState.type];
  const allHeads = useAppSelector(selectAllHeads);
  // Try the full subhead entity first; fall back to the summary embedded in the head
  const parentSubhead = useAppSelector(
    drawerState?.type === "NEW_CONFIGURE" && drawerState.parentId != null
      ? selectSubheadById(drawerState.parentId)
      : () => undefined,
  );
  const parentHead = (() => {
    if (drawerState?.type !== "NEW_CONFIGURE" || drawerState.parentId == null)
      return undefined;
    // If we have the full entity, use its parent_head_id
    if (parentSubhead?.parent_head_id != null) {
      return allHeads.find((h) => h.id === parentSubhead.parent_head_id);
    }
    // Otherwise scan head.subheads summaries
    return allHeads.find((h) =>
      h.subheads?.some((s) => s.id === drawerState.parentId),
    );
  })();
  const breadcrumbSubName =
    parentSubhead?.name ??
    allHeads
      .flatMap((h) => h.subheads ?? [])
      .find((s) => s.id === drawerState?.parentId)?.name;

  useEffect(() => {
    setSubmitting(false);
    setSubmitError(null);
  }, [drawerState]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const onClose = () => dispatch(closeDrawer());

  const doSubmit = async (data: Record<string, unknown>) => {
    console.log("doSubmit", data);
    setSubmitting(true);
    setSubmitError(null);
    // API identifier fields reject '@' — strip email domain for owner/actor values
    const actor =
      typeof data.owner === "string" ? data.owner.split("@")[0] : "system";
    const ownerIdent = actor;
    try {
      if (drawerState?.type === "NEW_HEAD") {
        await dispatch(
          createHead({
            ...data,
            site_id: selectedBrand,
            owner: ownerIdent,
            created_by: actor,
          } as unknown as Parameters<typeof createHead>[0]),
        ).unwrap();
      } else if (drawerState?.type === "EDIT_HEAD" && drawerState.id != null) {
        await dispatch(
          updateHead({
            id: drawerState.id,
            patch: {
              ...data,
              owner: ownerIdent,
              updated_by: actor,
            } as unknown as Partial<import("../../types").BonusHead>,
          }),
        ).unwrap();
      } else if (
        drawerState?.type === "NEW_SUBHEAD" &&
        drawerState.parentId != null
      ) {
        await dispatch(
          createSubhead({
            parentId: drawerState.parentId,
            payload: {
              site_id: selectedBrand,
              name: data.name,
              description: data.description,
              active: data.active,
              budget: data.budget,
              owner: ownerIdent,
              created_by: actor,
            },
          }),
        ).unwrap();
        // Refresh parent head so its subheads list includes the new entry
        dispatch(fetchHead(drawerState.parentId));
      } else if (
        drawerState?.type === "EDIT_SUBHEAD" &&
        drawerState.id != null
      ) {
        const updated = await dispatch(
          updateSubhead({
            id: drawerState.id,
            patch: {
              name: data.name,
              description: data.description,
              active: data.active,
              owner: ownerIdent,
              updated_by: actor,
            } as unknown as import("../../types").BonusSubhead,
          }),
        ).unwrap();
        // Refresh parent head so the tree shows the updated subhead name/status
        if (updated?.head_id) dispatch(fetchHead(updated.head_id));
        dispatch(closeDrawer());
      } else if (
        drawerState?.type === "NEW_CONFIGURE" &&
        drawerState.parentId != null
      ) {
        const { _budget, _trigger, _code, _segment_id, ...configureFields } =
          data;
        const newCfg = await dispatch(
          createConfigure({
            parentId: drawerState.parentId,
            payload: {
              ...configureFields,
              site_id: selectedBrand,
              created_by: currentUser,
            },
          }),
        ).unwrap();
        const warnings: string[] = [];
        if (
          Array.isArray(_budget) &&
          (_budget as BudgetPeriod[]).length > 0 &&
          newCfg?.id
        ) {
          await dispatch(
            updateBudget({
              scope: "configure",
              id: newCfg.id,
              periods: _budget as BudgetPeriod[],
              updatedBy: currentUser,
            }),
          )
            .unwrap()
            .catch((e: unknown) => {
              warnings.push(
                `Budget: ${e instanceof Error ? e.message : "failed to save"}`,
              );
            });
        }
        if (_trigger && newCfg?.id) {
          await dispatch(
            createTrigger({
              configureId: newCfg.id,
              payload: {
                ...(_trigger as Record<string, unknown>),
                site_id: selectedBrand,
                created_by: currentUser,
              },
            }),
          )
            .unwrap()
            .catch((e: unknown) => {
              warnings.push(
                `Release trigger: ${e instanceof Error ? e.message : "failed to save"}`,
              );
            });
        }
        if (_code && newCfg?.id) {
          await dispatch(
            createPromoCode({
              configureId: newCfg.id,
              payload: {
                ...(_code as Record<string, unknown>),
                site_id: selectedBrand,
                created_by: currentUser,
              },
            }),
          )
            .unwrap()
            .catch((e: unknown) => {
              warnings.push(
                `Promo code: ${e instanceof Error ? e.message : "failed to save"}`,
              );
            });
        }
        if (_segment_id && newCfg?.id) {
          await dispatch(
            createEligibility({
              configureId: newCfg.id,
              payload: {
                site_id: selectedBrand,
                eligibility_key: "segment_id",
                eligibility_value: String(_segment_id),
                eligibility_value_type: "INT",
                active: true,
                created_by: currentUser,
              },
            }),
          )
            .unwrap()
            .catch((e: unknown) => {
              warnings.push(
                `Eligibility: ${e instanceof Error ? e.message : "failed to save"}`,
              );
            });
        }
        dispatch(fetchConfiguresBySubhead(drawerState.parentId));
        if (warnings.length > 0) {
          setSubmitError(
            `Configure created, but some settings failed to save:\n• ${warnings.join("\n• ")}`,
          );
          return;
        }
        dispatch(closeDrawer());
      } else if (
        drawerState?.type === "EDIT_CONFIGURE" &&
        drawerState.id != null
      ) {
        await dispatch(
          updateConfigure({
            id: drawerState.id,
            patch: {
              ...data,
              updated_by: currentUser,
            } as unknown as import("../../types").BonusConfigure,
          }),
        ).unwrap();
        dispatch(closeDrawer());
      } else if (
        drawerState?.type === "EDIT_BUDGET" &&
        drawerState.id != null
      ) {
        const scope = drawerState.scope ?? "head";
        await dispatch(
          updateBudget({
            scope,
            id: drawerState.id,
            periods: data.periods as BudgetPeriod[],
            updatedBy: currentUser,
          }),
        ).unwrap();
        if (scope === "head") dispatch(fetchHead(drawerState.id));
        if (scope === "subhead") dispatch(fetchSubhead(drawerState.id));
        if (scope === "configure") dispatch(fetchConfigure(drawerState.id));
        dispatch(closeDrawer());
      } else if (
        drawerState?.type === "EDIT_OWNERS" &&
        drawerState.id != null
      ) {
        const scope = drawerState.scope === "subhead" ? "subhead" : "head";
        await dispatch(
          updateOwners({
            scope,
            id: drawerState.id,
            owners: data.owners as OwnerEntry[],
            updatedBy: currentUser,
          }),
        ).unwrap();
        if (scope === "head") dispatch(fetchHead(drawerState.id));
        else dispatch(fetchSubhead(drawerState.id));
      } else if (
        drawerState?.type === "NEW_TRIGGER" &&
        drawerState.parentId != null
      ) {
        await dispatch(
          createTrigger({
            configureId: drawerState.parentId,
            payload: {
              ...data,
              site_id: selectedBrand,
              created_by: currentUser,
            },
          }),
        ).unwrap();
        dispatch(fetchConfigure(drawerState.parentId));
        dispatch(closeDrawer());
      } else if (
        drawerState?.type === "NEW_ELIGIBILITY" &&
        drawerState.parentId != null
      ) {
        await dispatch(
          createEligibility({
            configureId: drawerState.parentId,
            payload: {
              ...data,
              site_id: selectedBrand,
              created_by: currentUser,
            },
          }),
        ).unwrap();
        dispatch(closeDrawer());
      } else if (
        drawerState?.type === "NEW_PROMOCODE" &&
        drawerState.parentId != null
      ) {
        await dispatch(
          createPromoCode({
            configureId: drawerState.parentId,
            payload: { ...data, site_id: selectedBrand },
          }),
        ).unwrap();
        dispatch(closeDrawer());
      } else if (
        drawerState?.type === "EDIT_PROMOCODE" &&
        drawerState.id != null
      ) {
        await dispatch(
          updatePromoCode({
            codeId: drawerState.id,
            patch: { ...data },
          }),
        ).unwrap();
        dispatch(closeDrawer());
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isDialog = drawerState?.type === "NEW_CONFIGURE";

  const content = (
    <>
      <div
        className={"drawer-overlay" + (open ? " open" : "")}
        onClick={isDialog ? undefined : onClose}
        aria-hidden={!open}
      />
      <div
        className={
          isDialog
            ? "cfg-dialog" + (open ? " open" : "")
            : "drawer" + (open ? " open" : "")
        }
        role="dialog"
        aria-modal="true"
        aria-label={cfg ? cfg.title : ""}
      >
        {drawerState && cfg && (
          <>
            <div className="drawer-header">
              <span className="icon">
                <Icon name={cfg.icon} size={16} />
              </span>
              {breadcrumbSubName ? (
                <div className="title-block">
                  <span className="title">{cfg.title}</span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 3,
                      background: "var(--g100)",
                      border: "1px solid var(--g200)",
                      borderRadius: "var(--r)",
                      padding: "1px 8px",
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: "var(--g600)",
                      letterSpacing: "0.02em",
                      width: "fit-content",
                    }}
                  >
                    {parentHead && (
                      <>
                        <span style={{ color: "var(--g500)", fontWeight: 500 }}>
                          {parentHead.name}
                        </span>
                        <span style={{ color: "var(--g400)" }}>→</span>
                      </>
                    )}
                    <span>{breadcrumbSubName}</span>
                  </span>
                </div>
              ) : (
                <span className="title">{cfg.title}</span>
              )}
              <button
                className="close"
                onClick={onClose}
                aria-label="Close dialog"
              >
                <Icon name="x" size={18} />
              </button>
            </div>
            {submitError && <div className="drawer-error">{submitError}</div>}
            <DrawerForm
              state={drawerState}
              submitting={submitting}
              onCancel={onClose}
              onSubmit={doSubmit}
            />
          </>
        )}
      </div>
    </>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
