"use client";
import { useEffect, useMemo, useRef } from "react";
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
  selectNode,
  expandAncestorsOf,
  toggleSubheadExpand,
} from "../store/slices/treeSlice";
import { MOCK_SUBHEADS } from "../services/mocks/subheads";
import { MOCK_CONFIGURES } from "../services/mocks/configures";
import AppShell from "wynta-react-common/components/AppShell";
import type { NavSection } from "wynta-react-common/components/AppShell";
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

const BONUS_NAV: NavSection[] = [
  {
    label: "Analytics",
    items: [{ id: "dashboard", label: "Dashboard", icon: "home" }],
  },
  {
    label: "Bonus",
    items: [
      { id: "heads", label: "Bonus Heads", icon: "folders" },
      { id: "subheads", label: "Subheads", icon: "folder-tree" },
      { id: "configures", label: "Configures", icon: "settings-2" },
      { id: "codes", label: "Promo Codes", icon: "ticket" },
    ],
  },
  {
    label: "Admin",
    items: [
      { id: "players", label: "Players", icon: "users" },
      { id: "reports", label: "Reports", icon: "bar-chart-3" },
      { id: "settings", label: "Settings", icon: "settings" },
    ],
  },
];

interface ContextItem {
  icon?: string;
  label: string;
  onClick?: () => void;
  sep?: boolean;
}

export default function BonusAdminApp() {
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

  const prevBrandRef = useRef<number | null>(null);

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  useEffect(() => {
    console.log(
      "selectedBrand changed:",
      selectedBrand,
      "authStatus:",
      authStatus,
    );
    if (!selectedBrand || authStatus !== "succeeded") return;
    const isSwitch =
      prevBrandRef.current !== null && prevBrandRef.current !== selectedBrand;
    prevBrandRef.current = selectedBrand;
    const nodeAtLoad = isSwitch ? null : selectedNode;

    dispatch(fetchHeads(selectedBrand))
      .unwrap()
      .then((list) => {
        const headIds = new Set(list.map((h) => h.id));
        list.forEach((h) => dispatch(fetchHead(h.id)));
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
          icon: "filter",
          label: "Add Eligibility",
          onClick: () =>
            dispatch(
              openDrawer({
                type: "NEW_ELIGIBILITY",
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
      navSections={BONUS_NAV}
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
          onToggleSubhead={(id: number) => dispatch(toggleSubheadExpand(id))}
          onAddHead={() =>
            dispatch(openDrawer({ type: "NEW_HEAD" } as DrawerState))
          }
          onReload={() => selectedBrand && dispatch(fetchHeads(selectedBrand))}
          onMenu={(ctx: ContextMenuState) => dispatch(openContextMenu(ctx))}
          selectedBrand={selectedBrand}
        />
        <div className="detail-panel">
          <DetailPanel onAction={handleAction} />
        </div>
      </div>
    </AppShell>
  );
}
