'use client';
import Icon from './Icon';

interface WorkspaceItem {
  id: string;
  label: string;
  icon: string;
  iconSrc?: string;
  locked?: boolean;
}

const CHAT_ICON_SRC =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iMCAwIDIwIDIwIiBmaWxsPSJub25lIj48cGF0aCBkPSJNNSA1LjVDNC4xNyA1LjUgMy41IDYuMTcgMy41IDdWMTVDMy41IDE1LjgzIDQuMTcgMTYuNSA1IDE2LjVIOC41VjE5TDEyLjUgMTYuNUgxNUMxNS44MyAxNi41IDE2LjUgMTUuODMgMTYuNSAxNVY3QzE2LjUgNi4xNyAxNS44MyA1LjUgMTUgNS41SDVaIiBzdHJva2U9IiMzRjQ2NTIiIHN0cm9rZS13aWR0aD0iMSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+';

const DEFAULT_ITEMS: WorkspaceItem[] = [
  { id: 'workspace-settings', label: 'Workspace Settings', icon: 'layers'      },
  { id: 'chat',               label: 'Chat',               icon: 'message-circle', iconSrc: CHAT_ICON_SRC },
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
            {item.iconSrc ? (
              <img src={item.iconSrc} width={17} height={17} alt="" />
            ) : (
              <Icon name={item.icon} size={17} strokeWidth={1.6} />
            )}
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
