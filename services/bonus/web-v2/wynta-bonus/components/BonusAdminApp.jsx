'use client';
import { useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchHeads } from '@/store/slices/headsSlice';
import { fetchKpiSnapshot } from '@/store/slices/kpiSlice';
import { openDrawer, openHistoryDrawer, closeContextMenu, openContextMenu, setSelectedBrand, setToast } from '@/store/slices/uiSlice';
import { toggleHead, selectNode, expandAncestorsOf, toggleSubheadExpand } from '@/store/slices/treeSlice';
import { MOCK_HEADS } from '@/services/mocks/heads';
import { MOCK_SUBHEADS } from '@/services/mocks/subheads';
import { MOCK_CONFIGURES } from '@/services/mocks/configures';
import { BRANDS } from '@/services/mocks/constants';
import Sidebar from '@/components/shell/Sidebar';
import Topbar from '@/components/shell/Topbar';
import ContextMenu from '@/components/primitives/ContextMenu';
import Toast from '@/components/primitives/Toast';
import SlideDrawer from '@/components/drawers/SlideDrawer';
import HistoryDrawer from '@/components/drawers/HistoryDrawer';
import DetailPanel from '@/components/detail/DetailPanel';
import KpiStrip from '@/components/shell/KpiStrip';
import HierarchyTree from '@/components/tree/HierarchyTree';

export default function BonusAdminApp() {
  const dispatch = useAppDispatch();

  // Boot: fetch heads + KPI on mount
  useEffect(() => {
    dispatch(fetchHeads());
    dispatch(fetchKpiSnapshot());
  }, [dispatch]);

  const selectedBrand    = useAppSelector(s => s.ui.selectedBrand);
  const toast            = useAppSelector(s => s.ui.toast);
  const contextMenu      = useAppSelector(s => s.ui.contextMenu);
  const expandedHeads    = useAppSelector(s => s.tree.expandedHeads);
  const expandedSubheads = useAppSelector(s => s.tree.expandedSubheads);
  const loadingSubheads  = useAppSelector(s => s.tree.loadingSubheads);
  const selectedNode     = useAppSelector(s => s.tree.selectedNode);

  const heads = Object.values(MOCK_HEADS);

  const expandedHeadsSet    = useMemo(() => new Set(expandedHeads),    [expandedHeads]);
  const expandedSubheadsSet = useMemo(() => new Set(expandedSubheads), [expandedSubheads]);
  const loadingSubheadsSet  = useMemo(() => new Set(loadingSubheads),  [loadingSubheads]);

  const handleSelectNode = (node) => {
    dispatch(selectNode(node));
    dispatch(expandAncestorsOf({ ...node, heads: MOCK_HEADS, subheads: MOCK_SUBHEADS, configures: MOCK_CONFIGURES }));
  };

  // Context menu items per node type
  function getContextItems(type, id) {
    if (type === 'head') {
      return [
        { icon: 'pencil',      label: 'Edit Head',     onClick: () => dispatch(openDrawer({ type: 'EDIT_HEAD', id })) },
        { icon: 'plus-circle', label: 'Add Subhead',   onClick: () => dispatch(openDrawer({ type: 'NEW_SUBHEAD', parentId: id })) },
        { icon: 'wallet',      label: 'Manage Budget', onClick: () => dispatch(openDrawer({ type: 'EDIT_BUDGET', scope: 'head', id })) },
        { sep: true },
        { icon: 'eye',         label: 'View Details',  onClick: () => handleSelectNode({ type: 'head', id }) },
      ];
    }
    if (type === 'subhead') {
      return [
        { icon: 'pencil',      label: 'Edit Subhead',   onClick: () => dispatch(openDrawer({ type: 'EDIT_SUBHEAD', id })) },
        { icon: 'plus-circle', label: 'Add Configure',  onClick: () => dispatch(openDrawer({ type: 'NEW_CONFIGURE', parentId: id })) },
        { icon: 'wallet',      label: 'Manage Budget',  onClick: () => dispatch(openDrawer({ type: 'EDIT_BUDGET', scope: 'subhead', id })) },
        { sep: true },
        { icon: 'eye',         label: 'View Details',   onClick: () => handleSelectNode({ type: 'subhead', id }) },
      ];
    }
    if (type === 'configure') {
      return [
        { icon: 'pencil', label: 'Edit Configure',  onClick: () => dispatch(openDrawer({ type: 'EDIT_CONFIGURE', id })) },
        { icon: 'zap',    label: 'Add Trigger',     onClick: () => dispatch(openDrawer({ type: 'NEW_TRIGGER', parentId: id })) },
        { icon: 'ticket', label: 'Add Promo Code',  onClick: () => dispatch(openDrawer({ type: 'NEW_PROMOCODE', parentId: id })) },
        { icon: 'wallet', label: 'Manage Budget',   onClick: () => dispatch(openDrawer({ type: 'EDIT_BUDGET', scope: 'configure', id })) },
        { sep: true },
        { icon: 'eye',    label: 'View Details',    onClick: () => handleSelectNode({ type: 'configure', id }) },
      ];
    }
    return [];
  }

  const handleAction = (action) => {
    if (action.type === 'OPEN_HISTORY') {
      dispatch(openHistoryDrawer({ type: action.nodeType, id: action.id }));
    } else {
      dispatch(openDrawer(action));
    }
  };

  return (
    <div className="shell" data-screen-label="Bonus Dashboard">
      <Sidebar />
      <main className="main">
        <Topbar />
        <KpiStrip />
        <div className="three-zone">
          <HierarchyTree
            heads={heads}
            expandedHeads={expandedHeadsSet}
            expandedSubheads={expandedSubheadsSet}
            loadingSubheads={loadingSubheadsSet}
            selectedNode={selectedNode}
            onSelectNode={handleSelectNode}
            onToggleHead={(id) => dispatch(toggleHead(id))}
            onToggleSubhead={(id) => dispatch(toggleSubheadExpand(id))}
            onAddHead={() => dispatch(openDrawer({ type: 'NEW_HEAD' }))}
            onMenu={(ctx) => dispatch(openContextMenu(ctx))}
            selectedBrand={selectedBrand}
            onBrandChange={(id) => {
              dispatch(setSelectedBrand(id));
              dispatch(setToast('Switched to ' + (BRANDS.find(b => b.id === id)?.name || id)));
            }}
          />
          <div className="detail-panel">
            <DetailPanel onAction={handleAction}/>
          </div>
        </div>
      </main>

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
      <Toast message={toast}/>
    </div>
  );
}
