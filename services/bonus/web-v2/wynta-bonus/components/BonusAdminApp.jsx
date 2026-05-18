'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchHeads, fetchHead, selectAllHeads } from '@/store/slices/headsSlice';
import { fetchKpiSnapshot } from '@/store/slices/kpiSlice';
import { openDrawer, openHistoryDrawer, closeContextMenu, openContextMenu } from '@/store/slices/uiSlice';
import { toggleHead, selectNode, expandAncestorsOf, toggleSubheadExpand } from '@/store/slices/treeSlice';
import { MOCK_SUBHEADS } from '@/services/mocks/subheads';
import { MOCK_CONFIGURES } from '@/services/mocks/configures';
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

  const selectedBrand    = useAppSelector(s => s.ui.selectedBrand);
  const toast            = useAppSelector(s => s.ui.toast);
  const contextMenu      = useAppSelector(s => s.ui.contextMenu);
  const expandedHeads    = useAppSelector(s => s.tree.expandedHeads);
  const expandedSubheads = useAppSelector(s => s.tree.expandedSubheads);
  const loadingSubheads  = useAppSelector(s => s.tree.loadingSubheads);
  const selectedNode     = useAppSelector(s => s.tree.selectedNode);
  const heads            = useAppSelector(selectAllHeads);
  const headEntities     = useAppSelector(s => s.heads.entities);

  const prevBrandRef = useRef(null);

  useEffect(() => {
    if (!selectedBrand) return;
    const isSwitch = prevBrandRef.current !== null && prevBrandRef.current !== selectedBrand;
    prevBrandRef.current = selectedBrand;
    const nodeAtLoad = isSwitch ? null : selectedNode;

    dispatch(fetchHeads(selectedBrand)).unwrap()
      .then((list) => {
        list.forEach(h => dispatch(fetchHead(h.id)));
        if (!nodeAtLoad && list.length > 0) {
          const first = { type: 'head', id: list[0].id };
          dispatch(selectNode(first));
          dispatch(expandAncestorsOf({ ...first, subheads: MOCK_SUBHEADS, configures: MOCK_CONFIGURES }));
        } else if (nodeAtLoad) {
          dispatch(expandAncestorsOf({ ...nodeAtLoad, subheads: MOCK_SUBHEADS, configures: MOCK_CONFIGURES }));
        }
      })
      .catch(() => {});
    dispatch(fetchKpiSnapshot(selectedBrand));
  }, [dispatch, selectedBrand]);

  const expandedHeadsSet    = useMemo(() => new Set(expandedHeads),    [expandedHeads]);
  const expandedSubheadsSet = useMemo(() => new Set(expandedSubheads), [expandedSubheads]);
  const loadingSubheadsSet  = useMemo(() => new Set(loadingSubheads),  [loadingSubheads]);

  const handleSelectNode = (node) => {
    dispatch(selectNode(node));
    dispatch(expandAncestorsOf({
      ...node,
      heads: headEntities,
      subheads: MOCK_SUBHEADS,
      configures: MOCK_CONFIGURES,
    }));
  };

  function getContextItems(type, id) {
    if (type === 'head') return [
      { icon: 'pencil',      label: 'Edit Head',     onClick: () => dispatch(openDrawer({ type: 'EDIT_HEAD', id })) },
      { icon: 'plus-circle', label: 'Add Subhead',   onClick: () => dispatch(openDrawer({ type: 'NEW_SUBHEAD', parentId: id })) },
      { icon: 'wallet',      label: 'Manage Budget', onClick: () => dispatch(openDrawer({ type: 'EDIT_BUDGET', scope: 'head', id })) },
      { sep: true },
      { icon: 'eye',         label: 'View Details',  onClick: () => handleSelectNode({ type: 'head', id }) },
    ];
    if (type === 'subhead') return [
      { icon: 'pencil',      label: 'Edit Subhead',  onClick: () => dispatch(openDrawer({ type: 'EDIT_SUBHEAD', id })) },
      { icon: 'plus-circle', label: 'Add Configure', onClick: () => dispatch(openDrawer({ type: 'NEW_CONFIGURE', parentId: id })) },
      { icon: 'wallet',      label: 'Manage Budget', onClick: () => dispatch(openDrawer({ type: 'EDIT_BUDGET', scope: 'subhead', id })) },
      { sep: true },
      { icon: 'eye',         label: 'View Details',  onClick: () => handleSelectNode({ type: 'subhead', id }) },
    ];
    if (type === 'configure') return [
      { icon: 'pencil', label: 'Edit Configure', onClick: () => dispatch(openDrawer({ type: 'EDIT_CONFIGURE', id })) },
      { icon: 'zap',    label: 'Add Trigger',    onClick: () => dispatch(openDrawer({ type: 'NEW_TRIGGER', parentId: id })) },
      { icon: 'ticket', label: 'Add Promo Code', onClick: () => dispatch(openDrawer({ type: 'NEW_PROMOCODE', parentId: id })) },
      { icon: 'wallet', label: 'Manage Budget',  onClick: () => dispatch(openDrawer({ type: 'EDIT_BUDGET', scope: 'configure', id })) },
      { sep: true },
      { icon: 'eye',    label: 'View Details',   onClick: () => handleSelectNode({ type: 'configure', id }) },
    ];
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
