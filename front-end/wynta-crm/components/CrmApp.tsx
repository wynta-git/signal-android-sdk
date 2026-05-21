'use client';
import { useState } from 'react';
import { useCommonSelector } from 'wynta-react-common/store/hooks';
import { selectAllBrands } from 'wynta-react-common/store/slices/brandsSlice';
import AppShell from 'wynta-react-common/components/AppShell';
import type { NavSection } from 'wynta-react-common/components/AppShell';
import PlayerSegmentsPanel from 'wynta-react-common/components/segments/PlayerSegmentsPanel';
import CrmTopbar from './shell/CrmTopbar';
import CrmSearch from './shell/CrmSearch';

const CRM_NAV: NavSection[] = [
  {
    label: 'CRM',
    items: [
      { id: 'dashboard',  label: 'Dashboard',  icon: 'home'       },
      { id: 'contacts',   label: 'Contacts',   icon: 'users'      },
      { id: 'pipelines',  label: 'Pipelines',  icon: 'git-branch' },
      { id: 'activities', label: 'Activities', icon: 'calendar'   },
    ],
  },
  {
    label: 'Admin',
    items: [
      { id: 'reports',  label: 'Reports',  icon: 'bar-chart-3' },
      { id: 'settings', label: 'Settings', icon: 'settings'    },
    ],
  },
];

export default function CrmApp() {
  const [activeNav, setActiveNav] = useState('dashboard');
  const brands = useCommonSelector(selectAllBrands);
  const [selectedBrand, setSelectedBrand] = useState<number | null>(
    brands.length > 0 ? brands[0].site_id : null
  );

  return (
    <AppShell
      appLabel="CRM"
      navSections={CRM_NAV}
      activeNav={activeNav}
      onNavChange={setActiveNav}
      selectedBrand={selectedBrand}
      onBrandChange={setSelectedBrand}
      topbarCenter={
        <CrmTopbar activeNav={activeNav} navSections={CRM_NAV} onReset={() => setActiveNav('dashboard')} />
      }
      topbarActions={<CrmSearch />}
    >
      <div className="three-zone">
        <aside className="tree-panel" role="complementary">
          <PlayerSegmentsPanel onCreateSegment={() => {}} />
        </aside>
        <div className="detail-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--g400)', fontSize: 13 }}>
          Select a segment to view players
        </div>
      </div>
    </AppShell>
  );
}
