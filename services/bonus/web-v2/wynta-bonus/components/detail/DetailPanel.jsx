'use client';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { openDrawer, openHistoryDrawer } from '@/store/slices/uiSlice';
import { MOCK_HEADS } from '@/services/mocks/heads';
import { MOCK_SUBHEADS } from '@/services/mocks/subheads';
import { MOCK_CONFIGURES } from '@/services/mocks/configures';
import HeadDetailPanel from '@/components/detail/HeadDetailPanel';
import SubheadDetailPanel from '@/components/detail/SubheadDetailPanel';
import ConfigureDetailPanel from '@/components/detail/ConfigureDetailPanel';
import EmptyState from '@/components/primitives/EmptyState';

export default function DetailPanel({ onAction }) {
  const dispatch = useAppDispatch();
  const selectedNode = useAppSelector(s => s.tree.selectedNode);

  const handleAction = onAction || ((action) => {
    if (action.type === 'OPEN_HISTORY') {
      dispatch(openHistoryDrawer({ nodeType: action.nodeType, id: action.id }));
    } else {
      dispatch(openDrawer(action));
    }
  });

  if (!selectedNode) return <EmptyState/>;

  if (selectedNode.type === 'head') {
    const head = MOCK_HEADS[selectedNode.id];
    if (!head) return <EmptyState/>;
    return <HeadDetailPanel head={head} onAction={handleAction}/>;
  }

  if (selectedNode.type === 'subhead') {
    const sub = MOCK_SUBHEADS[selectedNode.id];
    if (!sub) return <EmptyState/>;
    return <SubheadDetailPanel subhead={sub} onAction={handleAction}/>;
  }

  if (selectedNode.type === 'configure') {
    const cfg = MOCK_CONFIGURES[selectedNode.id];
    if (!cfg) return <EmptyState/>;
    return <ConfigureDetailPanel configure={cfg} onAction={handleAction}/>;
  }

  return <EmptyState/>;
}
