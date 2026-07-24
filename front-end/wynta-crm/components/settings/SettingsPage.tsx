'use client';
import { useState } from 'react';
import WorkspaceSettingsTabs from 'wynta-react-common/workspace-settings/WorkspaceSettingsTabs';
import ClientsPage from '../clients/ClientsPage';
import ScreenCatalogPage from './ScreenCatalogPage';

interface Props {
  brandId?: number;
}

const TABS = [
  { id: 'clients', label: 'Clients',        icon: 'key' },
  { id: 'screens', label: 'Screen Catalog', icon: 'monitor' },
];

export default function SettingsPage({ brandId }: Props) {
  const [activeTab, setActiveTab] = useState('clients');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WorkspaceSettingsTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'clients'
          ? <ClientsPage brandId={brandId} />
          : <ScreenCatalogPage brandId={brandId} />}
      </div>
    </div>
  );
}
