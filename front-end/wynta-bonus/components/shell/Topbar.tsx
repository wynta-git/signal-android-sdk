'use client';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { selectNode } from '../../store/slices/treeSlice';
import Icon from 'wynta-react-common/components/Icon';

interface Crumb {
  label: string;
  fullLabel?: string;
  current?: boolean;
  onClick?: () => void;
}

export default function Topbar() {
  const dispatch = useAppDispatch();
  const selectedNode      = useAppSelector(s => s.tree.selectedNode);
  const headEntities      = useAppSelector(s => s.heads.entities);
  const subheadEntities   = useAppSelector(s => s.subheads.entities);
  const configureEntities = useAppSelector(s => s.configures.entities);

  const crumbs: Crumb[] = [{ label: 'Bonus', onClick: () => dispatch(selectNode(null)) }];
  if (selectedNode) {
    if (selectedNode.type === 'head') {
      const h = headEntities[selectedNode.id];
      if (h) crumbs.push({ label: h.name, current: true });
    } else if (selectedNode.type === 'subhead') {
      const s = subheadEntities[selectedNode.id];
      if (s) {
        crumbs.push({ label: s.parent_head_name ?? '' });
        crumbs.push({ label: s.name, current: true });
      }
    } else if (selectedNode.type === 'configure') {
      const c = configureEntities[selectedNode.id];
      const s = c && subheadEntities[c.subhead_id];
      if (s) {
        crumbs.push({ label: s.parent_head_name ?? '' });
        crumbs.push({ label: s.name });
        const fullName = c.name;
        const shortName = fullName.split(/\s+[—–-]\s+/)[0];
        crumbs.push({ label: shortName, fullLabel: fullName, current: true });
      }
    }
  }

  return (
    <div className="crumb">
      {crumbs.map((c, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <span className="sep"><Icon name="chevron-right" size={12}/></span>}
          {c.current ? (
            <span className="current" title={c.fullLabel || c.label}>{c.label}</span>
          ) : (
            <span title={c.fullLabel || c.label} style={{ cursor: c.onClick ? 'pointer' : 'default' }} onClick={c.onClick}>{c.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
