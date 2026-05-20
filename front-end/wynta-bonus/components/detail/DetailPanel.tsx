'use client';
import { useEffect } from 'react';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { fetchHead, selectHeadsStatus } from '../../store/slices/headsSlice';
import { openDrawer, openHistoryDrawer } from '../../store/slices/uiSlice';
import { MOCK_SUBHEADS } from '../../services/mocks/subheads';
import { MOCK_CONFIGURES } from '../../services/mocks/configures';
import HeadDetailPanel from '../../components/detail/HeadDetailPanel';
import SubheadDetailPanel from '../../components/detail/SubheadDetailPanel';
import ConfigureDetailPanel from '../../components/detail/ConfigureDetailPanel';
import EmptyState from 'wynta-react-common/components/EmptyState';
import type { DrawerState, HistoryDrawerState } from '../../types';

interface ActionPayload {
  type: string;
  id?: number;
  parentId?: number;
  scope?: string;
  nodeType?: string;
  [key: string]: unknown;
}

interface DetailPanelProps {
  onAction?: (action: ActionPayload) => void;
}

export default function DetailPanel({ onAction }: DetailPanelProps) {
  const dispatch = useAppDispatch();
  const selectedNode = useAppSelector(s => s.tree.selectedNode);

  // Fetch full head detail (owners + subheads + budget) whenever selection changes
  useEffect(() => {
    if (selectedNode?.type === 'head') {
      dispatch(fetchHead(selectedNode.id));
    }
  }, [selectedNode, dispatch]);

  const head        = useAppSelector(s => selectedNode?.type === 'head' ? s.heads.entities[selectedNode.id] : null);
  const headsStatus = useAppSelector(selectHeadsStatus);
  const brandsStatus = useAppSelector(s => s.brands.status);
  const sub  = selectedNode?.type === 'subhead'   ? MOCK_SUBHEADS[selectedNode.id]   : null;
  const cfg  = selectedNode?.type === 'configure' ? MOCK_CONFIGURES[selectedNode.id] : null;

  const handleAction = onAction || ((action: ActionPayload) => {
    if (action.type === 'OPEN_HISTORY') {
      dispatch(openHistoryDrawer({ type: (action.nodeType ?? action.type) as HistoryDrawerState['type'], id: action.id! }));
    } else {
      dispatch(openDrawer(action as unknown as DrawerState));
    }
  });

  if (!selectedNode) return <EmptyState/>;

  if (selectedNode.type === 'head') {
    if (!head || !head.owners) {
      const settled = headsStatus === 'succeeded' || headsStatus === 'failed' || brandsStatus === 'failed';
      if (settled) return <EmptyState/>;
      return (
        <div style={{ padding: 32, color: 'var(--g400)', fontSize: 13 }}>
          Loading…
        </div>
      );
    }
    return <HeadDetailPanel head={head} onAction={handleAction}/>;
  }

  if (selectedNode.type === 'subhead') {
    if (!sub) return <EmptyState/>;
    return <SubheadDetailPanel subhead={sub} onAction={handleAction}/>;
  }

  if (selectedNode.type === 'configure') {
    if (!cfg) return <EmptyState/>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <ConfigureDetailPanel configure={cfg as any} onAction={handleAction}/>;
  }

  return <EmptyState/>;
}
