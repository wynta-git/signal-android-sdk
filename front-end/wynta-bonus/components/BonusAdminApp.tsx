"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { getToken, setBrandId } from "wynta-react-common/services/tokenRegistry";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import {
  fetchHeads,
  fetchHead,
  selectAllHeads,
} from "../store/slices/headsSlice";
import { fetchKpiSnapshot } from "../store/slices/kpiSlice";
import {
  fetchUsers,
  selectAuthStatus,
} from "wynta-react-common/store/slices/usersSlice";
import { setCopilotModule } from "wynta-react-common/store/slices/copilotSlice";
import { selectAllBrands } from "wynta-react-common/store/slices/brandsSlice";
import {
  openDrawer,
  openHistoryDrawer,
  closeContextMenu,
  openContextMenu,
  setSidebarActive,
  setSelectedBrand,
  setToast,
} from "../store/slices/uiSlice";
import {
  toggleHead,
  expandAll,
  collapseAll,
  selectNode,
  expandAncestorsOf,
  toggleSubheadExpand,
} from "../store/slices/treeSlice";
import { MOCK_SUBHEADS } from "../services/mocks/subheads";
import { MOCK_CONFIGURES } from "../services/mocks/configures";
import AppShell from "wynta-react-common/components/AppShell";
import BonusSidebar from "../components/BonusSidebar";
import Topbar from "../components/shell/Topbar";
import GlobalSearch from "../components/shell/GlobalSearch";
import ContextMenu from "wynta-react-common/components/ContextMenu";
import Icon from "wynta-react-common/components/Icon";
import Toast from "../components/primitives/Toast";
import SlideDrawer from "../components/drawers/SlideDrawer";
import HistoryDrawer from "../components/drawers/HistoryDrawer";
import DetailPanel from "../components/detail/DetailPanel";
import KpiStrip from "../components/shell/KpiStrip";
import HierarchyTree from "../components/tree/HierarchyTree";
import type {
  ContextMenuState,
  DrawerState,
  HistoryDrawerState,
  SelectedNode,
} from "../types";

const WorkspaceSettingsPage = dynamic(
  () => import("wynta-react-common/workspace-settings/WorkspaceSettingsPage"),
  { ssr: false },
);
const BillingPricingPage = dynamic(
  () => import("wynta-react-common/billing-pricing/BillingPricingPage"),
  { ssr: false },
);
const SegmentsPage = dynamic(
  () => import("wynta-react-common/components/segments/SegmentsPage"),
  { ssr: false },
);
const EventsPage = dynamic(
  () => import("wynta-react-common/components/events/EventsPage"),
  { ssr: false },
);
const ChatPage = dynamic(
  () => import("wynta-react-common/components/chat/ChatPage"),
  { ssr: false },
);
const BonusDashboardPage = dynamic(
  () => import("./dashboard/BonusDashboardPage"),
  { ssr: false },
);

interface ContextItem {
  icon?: string;
  label: string;
  onClick?: () => void;
  sep?: boolean;
}

/**
 * All other API calls (heads, users, kpi, brands, segments, …) must only fire
 * after the exchange_token flow completes — either DjHeaderSlot's bridge-token
 * exchange or the token prompt — so BonusShell (which does that fetching) is
 * not mounted until tokenRegistry has a token. Mirrors wynta-crm/components/CrmApp.tsx.
 */
export default function BonusAdminApp() {
  // Check synchronously first — token may already be set if DjHeaderSlot ran earlier
  const [ready, setReady] = useState(() => !!getToken());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (ready) return;
    // Poll tokenRegistry until DjHeaderSlot registers a token (bridge or portal)
    intervalRef.current = setInterval(() => {
      if (getToken()) {
        setReady(true);
        clearInterval(intervalRef.current!);
      }
    }, 200);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [ready]);

  if (!ready) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 16,
          background: "var(--crm-bg, #f7f8fa)",
        }}
      >
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: "3px solid var(--crm-border-md, #e5e7eb)",
            borderTopColor: "var(--crm-blue, #3b82f6)",
            animation: "crm-spin 0.75s linear infinite",
            display: "inline-block",
          }}
        />
        <span style={{ color: "var(--crm-fg4, #9ca3af)", fontSize: 13 }}>
          Connecting…
        </span>
      </div>
    );
  }

  return <BonusShell />;
}

function BonusShell() {
  const dispatch = useAppDispatch();

  const selectedBrand = useAppSelector((s) => s.ui.selectedBrand);
  const sidebarActive = useAppSelector((s) => s.ui.sidebarActive);
  const toast = useAppSelector((s) => s.ui.toast);
  const contextMenu = useAppSelector((s) => s.ui.contextMenu);
  const expandedHeads = useAppSelector((s) => s.tree.expandedHeads);
  const expandedSubheads = useAppSelector((s) => s.tree.expandedSubheads);
  const loadingSubheads = useAppSelector((s) => s.tree.loadingSubheads);
  const selectedNode = useAppSelector((s) => s.tree.selectedNode);
  const heads = useAppSelector(selectAllHeads);
  const headEntities = useAppSelector((s) => s.heads.entities);
  const brands = useAppSelector(selectAllBrands);
  const authStatus = useAppSelector(selectAuthStatus);
  const kpiStatus = useAppSelector((s) => s.kpi.status);

  const prevBrandRef = useRef<number | null>(null);
  const prevKpiStatusRef = useRef(kpiStatus);

  useEffect(() => {
    dispatch(setCopilotModule("bonus"));
  }, [dispatch]);

  // Keep the shared tokenRegistry site id in sync with this app's own brand
  // selection (manual switch or the default-brand fallback in uiSlice) so
  // shared code like copilotSlice, which has no access to `ui.selectedBrand`,
  // still sees the correct site_id.
  useEffect(() => {
    if (selectedBrand != null) setBrandId(selectedBrand);
  }, [selectedBrand]);

  // kpiSlice flips status back to 'idle' after any head/subhead/configure/promo
  // code create or edit so the header stats don't go stale — refetch here.
  useEffect(() => {
    const wasSucceeded = prevKpiStatusRef.current === "succeeded";
    prevKpiStatusRef.current = kpiStatus;
    if (wasSucceeded && kpiStatus === "idle" && selectedBrand) {
      dispatch(fetchKpiSnapshot(selectedBrand));
    }
  }, [kpiStatus, selectedBrand, dispatch]);

  useEffect(() => {
    if (!selectedBrand || authStatus !== "succeeded") return;
    const isSwitch =
      prevBrandRef.current !== null && prevBrandRef.current !== selectedBrand;
    prevBrandRef.current = selectedBrand;
    const nodeAtLoad = isSwitch ? null : selectedNode;

    dispatch(fetchUsers(selectedBrand));
    dispatch(fetchHeads(selectedBrand))
      .unwrap()
      .then(async (list) => {
        const headIds = new Set(list.map((h) => h.id));
        const detailedHeads = await Promise.all(
          list.map((h) => dispatch(fetchHead(h.id)).unwrap()),
        );
        dispatch(
          expandAll({
            headIds: list.map((h) => h.id),
            subheadIds: detailedHeads.flatMap((h) =>
              h.subheads.map((s) => s.id),
            ),
          }),
        );
        const nodeIsValid =
          !nodeAtLoad ||
          nodeAtLoad.type !== "head" ||
          headIds.has(nodeAtLoad.id);
        const effectiveNode = nodeIsValid ? nodeAtLoad : null;
        if (!effectiveNode && list.length > 0) {
          const first: SelectedNode = { type: "head", id: list[0].id };
          dispatch(selectNode(first));
          dispatch(
            expandAncestorsOf({
              ...first,
              subheads: MOCK_SUBHEADS,
              configures: MOCK_CONFIGURES,
            }),
          );
        } else if (effectiveNode) {
          dispatch(
            expandAncestorsOf({
              ...effectiveNode,
              subheads: MOCK_SUBHEADS,
              configures: MOCK_CONFIGURES,
            }),
          );
        } else {
          dispatch(selectNode(null));
        }
      })
      .catch(() => {});
    dispatch(fetchKpiSnapshot(selectedBrand));
  }, [dispatch, selectedBrand, authStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const expandedHeadsSet = useMemo(
    () => new Set(expandedHeads),
    [expandedHeads],
  );
  const expandedSubheadsSet = useMemo(
    () => new Set(expandedSubheads),
    [expandedSubheads],
  );
  const loadingSubheadsSet = useMemo(
    () => new Set(loadingSubheads),
    [loadingSubheads],
  );

  const handleSelectNode = (node: SelectedNode) => {
    dispatch(selectNode(node));
    dispatch(
      expandAncestorsOf({
        ...node,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        heads: headEntities as any,
        subheads: MOCK_SUBHEADS,
        configures: MOCK_CONFIGURES,
      }),
    );
  };

  function getContextItems(type: string, id: number): ContextItem[] {
    if (type === "head")
      return [
        {
          icon: "pencil",
          label: "Edit Head",
          onClick: () =>
            dispatch(openDrawer({ type: "EDIT_HEAD", id } as DrawerState)),
        },
        {
          icon: "plus-circle",
          label: "Add Subhead",
          onClick: () =>
            dispatch(
              openDrawer({ type: "NEW_SUBHEAD", parentId: id } as DrawerState),
            ),
        },
        {
          icon: "wallet",
          label: "Manage Budget",
          onClick: () =>
            dispatch(
              openDrawer({
                type: "EDIT_BUDGET",
                scope: "head",
                id,
              } as DrawerState),
            ),
        },
        {
          icon: "users",
          label: "Manage Owners",
          onClick: () =>
            dispatch(
              openDrawer({
                type: "EDIT_OWNERS",
                scope: "head",
                id,
              } as DrawerState),
            ),
        },
        { sep: true, label: "" },
        {
          icon: "eye",
          label: "View Details",
          onClick: () => handleSelectNode({ type: "head", id }),
        },
      ];
    if (type === "subhead")
      return [
        {
          icon: "pencil",
          label: "Edit Subhead",
          onClick: () =>
            dispatch(openDrawer({ type: "EDIT_SUBHEAD", id } as DrawerState)),
        },
        {
          icon: "plus-circle",
          label: "Add Configure",
          onClick: () =>
            dispatch(
              openDrawer({
                type: "NEW_CONFIGURE",
                parentId: id,
              } as DrawerState),
            ),
        },
        {
          icon: "wallet",
          label: "Manage Budget",
          onClick: () =>
            dispatch(
              openDrawer({
                type: "EDIT_BUDGET",
                scope: "subhead",
                id,
              } as DrawerState),
            ),
        },
        {
          icon: "users",
          label: "Manage Owners",
          onClick: () =>
            dispatch(
              openDrawer({
                type: "EDIT_OWNERS",
                scope: "subhead",
                id,
              } as DrawerState),
            ),
        },
        { sep: true, label: "" },
        {
          icon: "eye",
          label: "View Details",
          onClick: () => handleSelectNode({ type: "subhead", id }),
        },
      ];
    if (type === "configure")
      return [
        {
          icon: "pencil",
          label: "Edit Configure",
          onClick: () =>
            dispatch(openDrawer({ type: "EDIT_CONFIGURE", id } as DrawerState)),
        },
        {
          icon: "zap",
          label: "Add Trigger",
          onClick: () =>
            dispatch(
              openDrawer({ type: "NEW_TRIGGER", parentId: id } as DrawerState),
            ),
        },
        {
          icon: "ticket",
          label: "Add Promo Code",
          onClick: () =>
            dispatch(
              openDrawer({
                type: "NEW_PROMOCODE",
                parentId: id,
              } as DrawerState),
            ),
        },
        {
          icon: "wallet",
          label: "Manage Budget",
          onClick: () =>
            dispatch(
              openDrawer({
                type: "EDIT_BUDGET",
                scope: "configure",
                id,
              } as DrawerState),
            ),
        },
        { sep: true, label: "" },
        {
          icon: "eye",
          label: "View Details",
          onClick: () => handleSelectNode({ type: "configure", id }),
        },
      ];
    return [];
  }

  const handleAction = (action: {
    type: string;
    nodeType?: string;
    id?: number;
    [key: string]: unknown;
  }) => {
    if (action.type === "OPEN_HISTORY") {
      dispatch(
        openHistoryDrawer({
          type: (action.nodeType ?? "head") as HistoryDrawerState["type"],
          id: action.id!,
        }),
      );
    } else {
      dispatch(openDrawer(action as unknown as DrawerState));
    }
  };

  return (
    <AppShell
      appLabel="BONUS"
      sidebar={
        <BonusSidebar
          activeNav={sidebarActive}
          onNavChange={(id) => dispatch(setSidebarActive(id))}
        />
      }
      activeNav={sidebarActive}
      onNavChange={(id) => dispatch(setSidebarActive(id))}
      selectedBrand={selectedBrand}
      onBrandChange={(siteId) => {
        dispatch(setSelectedBrand(siteId));
        dispatch(
          setToast(
            "Switched to " +
              (brands.find((b) => b.site_id === siteId)?.name || siteId),
          ),
        );
      }}
      topbarCenter={<Topbar />}
      topbarActions={
        <>
          <GlobalSearch onSelectNode={handleSelectNode} />
          <button className="icon-btn" title="Filters">
            <Icon name="filter" size={15} />
          </button>
        </>
      }
      overlays={
        <>
          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              items={getContextItems(contextMenu.type, contextMenu.id)}
              onClose={() => dispatch(closeContextMenu())}
            />
          )}
          <SlideDrawer />
          <HistoryDrawer />
          <Toast message={toast} />
        </>
      }
    >
      {sidebarActive === "workspace-settings" ? (
        <WorkspaceSettingsPage />
      ) : sidebarActive === "billing" ? (
        <BillingPricingPage />
      ) : sidebarActive === "dashboard" ? (
        <BonusDashboardPage brandId={selectedBrand ?? undefined} />
      ) : sidebarActive === "segments" ? (
        <SegmentsPage brandId={selectedBrand ?? undefined} />
      ) : sidebarActive === "events" ? (
        <EventsPage brandId={selectedBrand ?? undefined} />
      ) : sidebarActive === "chat" ? (
        <ChatPage />
      ) : sidebarActive === "logs" ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            minHeight: "60vh",
            color: "var(--crm-fg4)",
            fontSize: 14,
          }}
        />
      ) : (
        <>
          <KpiStrip />
          <div className="three-zone">
            <HierarchyTree
              heads={heads}
              expandedHeads={expandedHeadsSet}
              expandedSubheads={expandedSubheadsSet}
              loadingSubheads={loadingSubheadsSet}
              selectedNode={selectedNode}
              onSelectNode={handleSelectNode}
              onToggleHead={(id: number) => dispatch(toggleHead(id))}
              onToggleSubhead={(id: number) =>
                dispatch(toggleSubheadExpand(id))
              }
              onExpandAll={() =>
                dispatch(
                  expandAll({
                    headIds: heads.map((h) => h.id),
                    subheadIds: heads.flatMap((h) =>
                      h.subheads.map((s) => s.id),
                    ),
                  }),
                )
              }
              onCollapseAll={() => dispatch(collapseAll())}
              onAddHead={() =>
                dispatch(openDrawer({ type: "NEW_HEAD" } as DrawerState))
              }
              onReload={() => {
                if (!selectedBrand) return;
                dispatch(fetchHeads(selectedBrand))
                  .unwrap()
                  .then((list) =>
                    list.forEach((h) => dispatch(fetchHead(h.id))),
                  );
              }}
              onMenu={(ctx: ContextMenuState) => dispatch(openContextMenu(ctx))}
              selectedBrand={selectedBrand}
            />
            <div className="detail-panel">
              <DetailPanel onAction={handleAction} />
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
