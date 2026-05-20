'use client';
import { useEffect } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setSelectedBrand, setToast } from '@/store/slices/uiSlice';
import { fetchBrands, selectAllBrands } from '@/store/slices/brandsSlice';
import { selectNode, expandAncestorsOf } from '@/store/slices/treeSlice';
import Icon from '@/components/primitives/Icon';
import BrandSwitcher from './BrandSwitcher';
import GlobalSearch from './GlobalSearch';
import { MOCK_HEADS } from '@/services/mocks/heads';
import { MOCK_SUBHEADS } from '@/services/mocks/subheads';
import { MOCK_CONFIGURES } from '@/services/mocks/configures';
import type { SelectedNode } from '@/types';

interface Crumb {
  label: string;
  fullLabel?: string;
  current?: boolean;
  onClick?: () => void;
}

export default function Topbar() {
  const dispatch = useAppDispatch();
  const selectedNode  = useAppSelector(s => s.tree.selectedNode);
  const selectedBrand = useAppSelector(s => s.ui.selectedBrand);
  const brands = useAppSelector(selectAllBrands);

  useEffect(() => {
    dispatch(fetchBrands());
  }, [dispatch]);

  // Breadcrumb from selectedNode
  const crumbs: Crumb[] = [{ label: 'Bonus', onClick: () => dispatch(selectNode(null)) }];
  if (selectedNode) {
    if (selectedNode.type === 'head') {
      const h = MOCK_HEADS[selectedNode.id];
      if (h) crumbs.push({ label: h.name, current: true });
    } else if (selectedNode.type === 'subhead') {
      const s = MOCK_SUBHEADS[selectedNode.id];
      if (s) {
        crumbs.push({ label: s.parent_head_name ?? '' });
        crumbs.push({ label: s.name, current: true });
      }
    } else if (selectedNode.type === 'configure') {
      const c = MOCK_CONFIGURES[selectedNode.id];
      const s = c && MOCK_SUBHEADS[c.subhead_id];
      if (s) {
        crumbs.push({ label: s.parent_head_name ?? '' });
        crumbs.push({ label: s.name });
        const fullName = c.name;
        const shortName = fullName.split(/\s+[—–-]\s+/)[0];
        crumbs.push({ label: shortName, fullLabel: fullName, current: true });
      }
    }
  }

  const handleSelectNode = (node: SelectedNode) => {
    dispatch(selectNode(node));
    dispatch(expandAncestorsOf({ ...node, heads: MOCK_HEADS, subheads: MOCK_SUBHEADS, configures: MOCK_CONFIGURES }));
  };

  return (
    <div className="main-topbar">
      <div className="tb-brand">
        <BrandSwitcher
          value={selectedBrand}
          onChange={(siteId) => {
            dispatch(setSelectedBrand(siteId));
            dispatch(setToast('Switched to ' + (brands.find(b => b.site_id === siteId)?.name || siteId)));
          }}
          compact
        />
      </div>
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
      <div className="spacer"/>
      <GlobalSearch onSelectNode={handleSelectNode}/>
      <button className="icon-btn" title="Filters"><Icon name="filter" size={15}/></button>
      <button className="icon-btn" title="Notifications"><Icon name="bell" size={15}/></button>
      <div className="avatar" title="vanessa@wynta.com">V</div>
    </div>
  );
}
