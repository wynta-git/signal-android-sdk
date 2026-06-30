'use client';
import { useEffect, useState } from 'react';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { fetchHead, selectHeadsStatus } from '../../store/slices/headsSlice';
import { fetchSubhead } from '../../store/slices/subheadsSlice';
import { fetchConfigure, selectConfigureById } from '../../store/slices/configuresSlice';
import { fetchEntitySpend } from '../../store/slices/spendSlice';
import { openDrawer, openHistoryDrawer } from '../../store/slices/uiSlice';
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
  const [mounted, setMounted] = useState(false);
  const selectedNode = useAppSelector(s => s.tree.selectedNode);

  useEffect(() => { setMounted(true); }, []);

  // Fetch full detail and spend data whenever selection changes
  useEffect(() => {
    if (selectedNode?.type === 'head') {
      dispatch(fetchHead(selectedNode.id));
      dispatch(fetchEntitySpend({ entityType: 'HEAD', entityId: selectedNode.id }));
    }
    if (selectedNode?.type === 'subhead') {
      dispatch(fetchSubhead(selectedNode.id));
      dispatch(fetchEntitySpend({ entityType: 'SUBHEAD', entityId: selectedNode.id }));
    }
    if (selectedNode?.type === 'configure') {
      dispatch(fetchConfigure(selectedNode.id));
      dispatch(fetchEntitySpend({ entityType: 'CONFIGURE', entityId: selectedNode.id }));
    }
  }, [selectedNode, dispatch]);

  const head        = useAppSelector(s => selectedNode?.type === 'head'    ? s.heads.entities[selectedNode.id]    : null);
  const sub         = useAppSelector(s => selectedNode?.type === 'subhead' ? s.subheads.entities[selectedNode.id] : null);
  const headsStatus = useAppSelector(selectHeadsStatus);
  const brandsStatus = useAppSelector(s => s.brands.status);
  const cfgId = selectedNode?.type === 'configure' ? selectedNode.id : 0;
  const cfg = useAppSelector(selectConfigureById(cfgId));

  const handleAction = onAction || ((action: ActionPayload) => {
    if (action.type === 'OPEN_HISTORY') {
      dispatch(openHistoryDrawer({ type: (action.nodeType ?? 'head') as HistoryDrawerState['type'], id: action.id! }));
    } else {
      dispatch(openDrawer(action as unknown as DrawerState));
    }
  });

  if (!mounted) return <EmptyState/>;
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
    if (!sub) return <div style={{ padding: 32, color: 'var(--g400)', fontSize: 13 }}>Loading…</div>;
    return <SubheadDetailPanel subhead={sub} onAction={handleAction}/>;
  }

  if (selectedNode.type === 'configure') {
    if (!cfg) return <EmptyState/>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <ConfigureDetailPanel configure={cfg as any} onAction={handleAction}/>;
  }

  return <EmptyState/>;
}
