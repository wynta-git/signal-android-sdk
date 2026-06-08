'use client';
import { useState } from 'react';
import Icon from 'wynta-react-common/components/Icon';

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

const CRM_NAV_SECTIONS: NavSection[] = [
  {
    heading: 'CRM',
    items: [
      { id: 'dashboard',     label: 'Dashboard',    icon: 'home'         },
      { id: 'campaigns',     label: 'Campaigns',    icon: 'send'         },
      { id: 'segments',      label: 'Segments',     icon: 'users-round'  },
      { id: 'events',        label: 'Events',       icon: 'zap'          },
      { id: 'flows',         label: 'Flows',        icon: 'git-branch'   },
      {
        id: 'reports', label: 'Reports', icon: 'bar-chart-2',
        children: [
          { id: 'campaign',  label: 'Campaign Stats'    },
          { id: 'segment',   label: 'Segment Analysis'  },
          { id: 'channel',   label: 'Channel Delivery'  },
          { id: 'lifecycle', label: 'Player Lifecycle'  },
          { id: 'churn',     label: 'Churn & Retention' },
        ],
      },
      { id: 'integrations',  label: 'Integrations', icon: 'plug'         },
    ],
  },
  {
    heading: 'Workspace',
    items: [
      { id: 'workspace-settings', label: 'Workspace Settings', icon: 'layers'      },
      { id: 'logs',               label: 'Logs',               icon: 'file-text'   },
      { id: 'marketplace',        label: 'Marketplace',        icon: 'store',       locked: true },
      { id: 'billing',            label: 'Billing & Pricing',  icon: 'credit-card' },
    ],
  },
];

interface CrmSidebarProps {
  activeNav: string;
  onNavChange: (id: string) => void;
}

export default function CrmSidebar({ activeNav, onNavChange }: CrmSidebarProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    reports: activeNav === 'reports' || activeNav.startsWith('reports:'),
  });

  function toggleGroup(id: string) {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <aside className="crm-sidebar">
      <div className="crm-nav-scroll">
        {CRM_NAV_SECTIONS.map(section => (
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
                      if (item.href) { window.location.href = item.href; return; }
                      if (isGroup)   { toggleGroup(item.id); }
                      else           { onNavChange(item.id); }
                    }}
                    onKeyDown={e => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
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
      </div>

      {/* Mobile App CTA */}
      <div className="crm-mobile-cta">
        <p className="crm-mobile-cta__caption">Get the Wynta app on your phone</p>
        <div className="crm-mobile-cta__badges">
          <a className="crm-app-badge" href="https://apps.apple.com/us/app/wynta-ai/id6758648683" target="_blank" rel="noopener noreferrer" aria-label="Download on the App Store">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            <span className="crm-app-badge__text">
              <small>Download on the</small>
              <b>App Store</b>
            </span>
          </a>
          <a className="crm-app-badge" href="https://play.google.com/store/apps/details?id=com.wynta&hl=en_IN&pli=1" target="_blank" rel="noopener noreferrer" aria-label="Get it on Google Play">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3.6 1.9c-.4.2-.6.6-.6 1.2v18c0 .5.2.9.6 1.1l10.6-10.2L3.6 1.9z" fill="#00CCBC" />
              <path d="M14.2 12L3.6 22.2c.2.1.4.1.6.1.3 0 .6-.1.9-.3l12.4-7.1L14.2 12z" fill="#FF3C2D" />
              <path d="M17.5 14.9l3.6-2c.6-.3.9-.8.9-1.3 0-.5-.3-1-.9-1.3l-3.6-2.1L14.2 12l3.3 2.9z" fill="#FFC107" />
              <path d="M3.6 1.9L14.2 12 17.5 8.2 5.1 1.1c-.3-.2-.6-.3-.9-.3-.2 0-.4.1-.6.1z" fill="#00E676" />
            </svg>
            <span className="crm-app-badge__text">
              <small>GET IT ON</small>
              <b>Google Play</b>
            </span>
          </a>
        </div>
      </div>

      <div className="crm-nav-cta">
        <a href="https://wynta.com/pricing/" target="_blank" rel="noopener noreferrer" className="crm-btn-upgrade">
          <Icon name="zap" size={14} />
          Upgrade
        </a>
      </div>
    </aside>
  );
}
