'use client';
import { useState } from 'react';
import WorkspaceSettingsTabs from './WorkspaceSettingsTabs';
import GeneralSettings    from './tabs/GeneralSettings';
import ProductSettings    from './tabs/ProductSettings';
import UserSettings       from './tabs/UserSettings';
import ConnectorSettings  from './tabs/ConnectorSettings';
import AIModelSettings    from './tabs/AIModelSettings';
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
};

export default function WorkspaceSettingsPage({
  tabs = DEFAULT_TABS,
  defaultTab,
}: WorkspaceSettingsPageProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id ?? 'general');

  const ActiveComponent = TAB_COMPONENTS[activeTab] ?? GeneralSettings;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 42px)', background: '#fff', overflow: 'hidden' }}>
      {/* Fixed header: title + tabs */}
      <div style={{ flexShrink: 0, padding: '24px 24px 0' }}>
        <h3 style={{ fontSize: 18, fontWeight: 500, color: '#222222', margin: '0 0 16px' }}>
          Workspace Settings
        </h3>
        <WorkspaceSettingsTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Scrollable content — sticky elements inside here work correctly */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
        <ActiveComponent />
      </div>

      {/* Footer always visible at bottom */}
      <div style={{
        flexShrink: 0,
        background: '#ffffff',
        color: '#000',
        fontSize: 14,
        padding: '17px 15px 15px',
        textAlign: 'center',
        borderTop: '1px solid #f3f4f6',
      }}>
        © Copyright 2026 Demo Affiliates, Powered by Wynta.
      </div>
    </div>
  );
}
