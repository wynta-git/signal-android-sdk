'use client';
import type { WorkspaceSettingsTab } from './types';

interface WorkspaceSettingsTabsProps {
  tabs: WorkspaceSettingsTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export default function WorkspaceSettingsTabs({ tabs, activeTab, onTabChange }: WorkspaceSettingsTabsProps) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            style={{
              display: 'block',
              padding: '14px 18px',
              fontSize: 13.5,
              color: isActive ? '#0091E0' : '#6b7280',
              borderBottom: isActive ? '2px solid #0091E0' : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
              textDecoration: 'none',
              fontWeight: 500,
              transition: 'color 0.15s',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              whiteSpace: 'nowrap',
              outline: 'none',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
