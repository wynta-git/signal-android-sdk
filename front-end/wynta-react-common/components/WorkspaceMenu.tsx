'use client';
import Icon from './Icon';

interface WorkspaceItem {
  id: string;
  label: string;
  icon: string;
  locked?: boolean;
}

const DEFAULT_ITEMS: WorkspaceItem[] = [
  { id: 'workspace-settings', label: 'Workspace Settings', icon: 'layers'      },
  { id: 'logs',               label: 'Logs',               icon: 'file-text'   },
  { id: 'marketplace',        label: 'Marketplace',        icon: 'store',       locked: true },
  { id: 'billing',            label: 'Billing & Pricing',  icon: 'credit-card' },
];

interface WorkspaceMenuProps {
  activeNav: string;
  onNavChange: (id: string) => void;
  items?: WorkspaceItem[];
  classPrefix?: string;
}

export default function WorkspaceMenu({
  activeNav,
  onNavChange,
  items = DEFAULT_ITEMS,
  classPrefix = 'crm',
}: WorkspaceMenuProps) {
  return (
    <div>
      <div className={`${classPrefix}-nav-heading`}>Workspace</div>
      {items.map(item => (
        <div
          key={item.id}
          className={`${classPrefix}-nav-item${activeNav === item.id ? ' active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => { if (!item.locked) onNavChange(item.id); }}
          onKeyDown={e => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            if (!item.locked) onNavChange(item.id);
          }}
        >
          <span className={`${classPrefix}-nav-icon`}>
            <Icon name={item.icon} size={17} strokeWidth={1.6} />
          </span>
          <span className={`${classPrefix}-nav-label`}>{item.label}</span>
          {item.locked && (
            <span className={`${classPrefix}-nav-chev`}>
              <Icon name="lock" size={13} strokeWidth={1.75} />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
