'use client';
import { useEffect } from 'react';
import { MOCK_HEADS } from '@/services/mocks/heads';
import { MOCK_SUBHEADS } from '@/services/mocks/subheads';
import { MOCK_CONFIGURES } from '@/services/mocks/configures';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { closeHistoryDrawer } from '@/store/slices/uiSlice';
import { fetchHistory } from '@/store/slices/historySlice';
import Icon from '@/components/primitives/Icon';
import ChangeHistory from '@/components/detail/ChangeHistory';

function nodeNameFor({ type, id }) {
  if (type === 'head')      return { kind: 'Head',      name: MOCK_HEADS[id]?.name || '—' };
  if (type === 'subhead')   return { kind: 'Subhead',   name: MOCK_SUBHEADS[id]?.name || '—' };
  if (type === 'configure') return { kind: 'Configure', name: MOCK_CONFIGURES[id]?.name || '—' };
  return { kind: 'Node', name: '—' };
}

export default function HistoryDrawer() {
  const dispatch = useAppDispatch();
  const historyDrawer = useAppSelector(s => s.ui.historyDrawer);
  const open = !!historyDrawer;

  const onClose = () => dispatch(closeHistoryDrawer());

  useEffect(() => {
    if (!open) return;
    function handle(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open]);

  useEffect(() => {
    if (historyDrawer) {
      dispatch(fetchHistory({ type: historyDrawer.type, id: historyDrawer.id }));
    }
  }, [historyDrawer?.type, historyDrawer?.id]);

  const meta = historyDrawer && nodeNameFor(historyDrawer);

  return (
    <>
      <div className={'drawer-overlay' + (open ? ' open' : '')} onClick={onClose} aria-hidden={!open}/>
      <div className={'drawer' + (open ? ' open' : '')} role="dialog" aria-modal="true" aria-label="Change history">
        {historyDrawer && (
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
