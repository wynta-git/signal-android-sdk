'use client';
import { useState } from 'react';
import Icon from 'wynta-react-common/components/Icon';
import WorkspaceMenu from 'wynta-react-common/components/WorkspaceMenu';
import MobileAppCTA from 'wynta-react-common/components/MobileAppCTA';
import UpgradeCTA from 'wynta-react-common/components/UpgradeCTA';

interface NavChild {
  id: string;
  label: string;
}

interface NavItem {
  id: string;
  label: string;
  icon: string;
  children?: NavChild[];
  href?: string;
  locked?: boolean;
}

interface NavSection {
  heading: string;
  items: NavItem[];
}

const BONUS_NAV_SECTIONS: NavSection[] = [
  {
    heading: 'CRM',
    items: [
      { id: 'dashboard',     label: 'Dashboard',    icon: 'home'         },
      { id: 'wynta-ai',     label: 'Wynta AI',     icon: 'sparkles',    locked: true },
      { id: 'bonus',         label: 'Bonus',        icon: 'gift'         },
      { id: 'segments',      label: 'Segments',     icon: 'users-round'  },
      { id: 'events',        label: 'Events',       icon: 'zap',         locked: true },
      { id: 'flows',         label: 'Flows',        icon: 'git-branch',  locked: true },
      {
        id: 'reports', label: 'Reports', icon: 'bar-chart-2', locked: true,
        children: [
          { id: 'campaign',  label: 'Campaign Stats'    },
          { id: 'segment',   label: 'Segment Analysis'  },
          { id: 'channel',   label: 'Channel Delivery'  },
          { id: 'lifecycle', label: 'Player Lifecycle'  },
          { id: 'churn',     label: 'Churn & Retention' },
        ],
      }
    ],
  },
];

interface BonusSidebarProps {
  activeNav: string;
  onNavChange: (id: string) => void;
}

export default function BonusSidebar({ activeNav, onNavChange }: BonusSidebarProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  function toggleGroup(id: string) {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <aside className="crm-sidebar">
      <div className="crm-nav-scroll">
        {BONUS_NAV_SECTIONS.map(section => (
          <div key={section.heading}>
            <div className="crm-nav-heading">{section.heading}</div>
            {section.items.map(item => {
              const isGroup    = !!item.children;
              const isActive   = !isGroup && activeNav === item.id;
              const isGroupActive = isGroup && (activeNav === item.id || activeNav.startsWith(item.id + ':'));

              return (
                <div key={item.id}>
                  <div
                    className={'crm-nav-item' + ((isActive || isGroupActive) ? ' active' : '')}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (item.locked) return;
                      if (item.href) { window.location.href = item.href; return; }
                      if (isGroup)   { toggleGroup(item.id); }
                      else           { onNavChange(item.id); }
                    }}
                    onKeyDown={e => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      if (item.locked) return;
                      if (isGroup) toggleGroup(item.id);
                      else onNavChange(item.id);
                    }}
                  >
                    <span className="crm-nav-icon">
                      <Icon name={item.icon} size={17} strokeWidth={1.6} />
                    </span>
                    <span className="crm-nav-label">{item.label}</span>
                    {item.locked && (
                      <span className="crm-nav-chev">
                        <Icon name="lock" size={13} strokeWidth={1.75} />
                      </span>
                    )}
                    {isGroup && (
                      <span className="crm-nav-chev">
                        <Icon
                          name={openGroups[item.id] ? 'chevron-down' : 'chevron-right'}
                          size={15}
                          strokeWidth={1.75}
                        />
                      </span>
                    )}
                  </div>

                  {isGroup && openGroups[item.id] && (
                    <div className="crm-nav-children">
                      {item.children!.map(child => (
                        <div
                          key={child.id}
                          className={'crm-nav-child' + (activeNav === item.id + ':' + child.id ? ' active' : '')}
                          role="button"
                          tabIndex={0}
                          onClick={() => onNavChange(item.id + ':' + child.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onNavChange(item.id + ':' + child.id);
                            }
                          }}
                        >
                          {child.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <WorkspaceMenu activeNav={activeNav} onNavChange={onNavChange} />
      </div>

      <MobileAppCTA />
      <UpgradeCTA />
    </aside>
  );
}
