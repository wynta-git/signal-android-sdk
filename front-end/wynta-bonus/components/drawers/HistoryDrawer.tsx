'use client';
import { useEffect, useState } from 'react';
import { MOCK_CONFIGURES } from '../../services/mocks/configures';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { closeHistoryDrawer } from '../../store/slices/uiSlice';
import { fetchHistory } from '../../store/slices/historySlice';
import { selectHeadById } from '../../store/slices/headsSlice';
import { selectSubheadById } from '../../store/slices/subheadsSlice';
import Icon from 'wynta-react-common/components/Icon';
import ChangeHistory from '../../components/detail/ChangeHistory';
import type { NodeType } from '../../types';

interface NodeMeta {
  kind: string;
  name: string;
}

export default function HistoryDrawer() {
  const dispatch = useAppDispatch();
  const historyDrawer = useAppSelector(s => s.ui.historyDrawer);
  const open = !!historyDrawer;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const drawerType = historyDrawer?.type as NodeType | undefined;
  const drawerId = historyDrawer?.id ?? 0;

  const headEntity = useAppSelector(selectHeadById(drawerType === 'head' ? drawerId : 0));
  const subheadEntity = useAppSelector(selectSubheadById(drawerType === 'subhead' ? drawerId : 0));

  const onClose = () => dispatch(closeHistoryDrawer());

  useEffect(() => {
    if (!open) return;
    function handle(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (historyDrawer) {
      dispatch(fetchHistory({ type: historyDrawer.type, id: historyDrawer.id }));
    }
  }, [historyDrawer?.type, historyDrawer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function nodeMeta(): NodeMeta | null {
    if (!historyDrawer) return null;
    const { type, id } = historyDrawer;
    if (type === 'head')      return { kind: 'Head',      name: headEntity?.name || '—' };
    if (type === 'subhead')   return { kind: 'Subhead',   name: subheadEntity?.name || '—' };
    if (type === 'configure') return { kind: 'Configure', name: MOCK_CONFIGURES[id]?.name || '—' };
    return { kind: 'Node', name: '—' };
  }

  const meta = nodeMeta();

  if (!mounted) return null;

  return (
    <>
      <div className={'drawer-overlay' + (open ? ' open' : '')} onClick={onClose} aria-hidden={!open}/>
      <div className={'drawer' + (open ? ' open' : '')} role="dialog" aria-modal="true" aria-label="Change history">
        {historyDrawer && meta && (
          <>
            <div className="drawer-header">
              <span className="icon"><Icon name="history" size={16}/></span>
              <div className="title-block">
                <div className="title">Change History</div>
                <div className="subtitle">{meta.kind} · {meta.name}</div>
              </div>
              <button className="close" onClick={onClose} aria-label="Close drawer">
                <Icon name="x" size={18}/>
              </button>
            </div>
            <div className="drawer-body history-body">
              <ChangeHistory type={historyDrawer.type} id={historyDrawer.id} alwaysExpanded/>
            </div>
          </>
        )}
      </div>
    </>
  );
}
