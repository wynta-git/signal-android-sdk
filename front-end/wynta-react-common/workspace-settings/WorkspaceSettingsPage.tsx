'use client';
import { useState } from 'react';
import WorkspaceSettingsTabs from './WorkspaceSettingsTabs';
import GeneralSettings    from './tabs/GeneralSettings';
import ProductSettings    from './tabs/ProductSettings';
import UserSettings       from './tabs/UserSettings';
import ConnectorSettings  from './tabs/ConnectorSettings';
import AIModelSettings    from './tabs/AIModelSettings';
import BillingPricingPage from '../billing-pricing/BillingPricingPage';
import { DEFAULT_TABS }   from './constants';
import type { WorkspaceSettingsTab } from './types';

interface WorkspaceSettingsPageProps {
  tabs?: WorkspaceSettingsTab[];
  defaultTab?: string;
}

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  general:    GeneralSettings,
  products:   ProductSettings,
  users:      UserSettings,
  connectors: ConnectorSettings,
  'ai-model': AIModelSettings,
  'billing':  BillingPricingPage,
};

export default function WorkspaceSettingsPage({
  tabs = DEFAULT_TABS,
  defaultTab,
}: WorkspaceSettingsPageProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id ?? 'general');

  const ActiveComponent = TAB_COMPONENTS[activeTab] ?? GeneralSettings;

  return (
    <div style={{ padding: '0px 24px 24px', minHeight: '100%', background: 'rgb(255, 255, 255)', position: 'relative' }}>
      <h3 style={{ fontSize: 18, fontWeight: 500, color: '#222222', margin: '0 0 16px' }}>
        Workspace Settings
      </h3>

      <WorkspaceSettingsTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <ActiveComponent />

      <div style={{
        background: '#ffffff',
        color: '#000',
        left: 0,
        fontSize: 14,
        padding: '17px 15px 15px',
        position: 'absolute',
        bottom: 0,
        right: 0,
        textAlign: 'center',
      }}>
        © Copyright 2026 Demo Affiliates, Powered by Wynta.
      </div>
    </div>
  );
}
