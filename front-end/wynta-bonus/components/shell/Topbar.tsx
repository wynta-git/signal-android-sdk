'use client';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { selectNode, expandAncestorsOf } from '../../store/slices/treeSlice';
import Icon from 'wynta-react-common/components/Icon';
import { MOCK_CONFIGURES } from '../../services/mocks/configures';
import type { BonusSubhead } from '../../types';

interface Crumb {
  label: string;
  fullLabel?: string;
  current?: boolean;
  onClick?: () => void;
}

export default function Topbar() {
  const dispatch          = useAppDispatch();
  const selectedNode      = useAppSelector(s => s.tree.selectedNode);
  const headEntities      = useAppSelector(s => s.heads.entities);
  const headIds           = useAppSelector(s => s.heads.ids);
  const configureEntities = useAppSelector(s => s.configures.entities);

  function findSubhead(subId: number) {
    for (const hid of headIds) {
      const h = headEntities[hid];
      const s = h?.subheads?.find(sub => sub.id === subId);
      if (s && h) return { sub: s, head: h };
    }
    return null;
  }

  const crumbs: Crumb[] = [{ label: 'Bonus', onClick: () => dispatch(selectNode(null)) }];

  if (selectedNode) {
    if (selectedNode.type === 'head') {
      const h = headEntities[selectedNode.id];
      if (h) crumbs.push({ label: h.name, current: true });

    } else if (selectedNode.type === 'subhead') {
      const found = findSubhead(selectedNode.id);
      if (found) {
        crumbs.push({
          label: found.head.name,
          onClick: () => {
            dispatch(selectNode({ type: 'head', id: found.head.id }));
            dispatch(expandAncestorsOf({ type: 'head', id: found.head.id }));
          },
        });
        crumbs.push({ label: found.sub.name, current: true });
      }

    } else if (selectedNode.type === 'configure') {
      const c = configureEntities[selectedNode.id] ?? MOCK_CONFIGURES[selectedNode.id];
      if (c) {
        const found = findSubhead(c.subhead_id);
        if (found) {
          crumbs.push({
            label: found.head.name,
            onClick: () => {
              dispatch(selectNode({ type: 'head', id: found.head.id }));
              dispatch(expandAncestorsOf({ type: 'head', id: found.head.id }));
            },
          });
          crumbs.push({
            label: found.sub.name,
            onClick: () => {
              dispatch(selectNode({ type: 'subhead', id: found.sub.id }));
              dispatch(expandAncestorsOf({
                type: 'subhead',
                id: found.sub.id,
                subheads: { [found.sub.id]: { head_id: found.head.id } as BonusSubhead },
              }));
            },
          });
        }
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
            <span
              title={c.fullLabel || c.label}
              style={{ cursor: c.onClick ? 'pointer' : 'default' }}
              onClick={c.onClick}
            >
              {c.label}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
