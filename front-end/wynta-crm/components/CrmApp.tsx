'use client';
import { useState } from 'react';
import { useCommonSelector } from 'wynta-react-common/store/hooks';
import { selectAllBrands } from 'wynta-react-common/store/slices/brandsSlice';
import AppShell from 'wynta-react-common/components/AppShell';
import type { NavSection } from 'wynta-react-common/components/AppShell';

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
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, flexDirection: 'column', gap: 12, color: 'var(--g500)' }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--g700)' }}>Wynta CRM</span>
        <span style={{ fontSize: 13 }}>Coming soon</span>
      </div>
    </AppShell>
  );
}
