'use client';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { setSidebarActive } from '../../store/slices/uiSlice';
import Icon from 'wynta-react-common/components/Icon';

interface NavItem {
  id: string;
  label: string;
  icon: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    label: 'Analytics',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'home' },
    ],
  },
  {
    label: 'Bonus',
    items: [
      { id: 'heads',      label: 'Bonus Heads', icon: 'folders'     },
      { id: 'subheads',   label: 'Subheads',    icon: 'folder-tree' },
      { id: 'configures', label: 'Configures',  icon: 'settings-2'  },
      { id: 'codes',      label: 'Promo Codes', icon: 'ticket'      },
    ],
  },
  {
    label: 'Admin',
    items: [
      { id: 'players',  label: 'Players',  icon: 'users'       },
      { id: 'reports',  label: 'Reports',  icon: 'bar-chart-3' },
      { id: 'settings', label: 'Settings', icon: 'settings'    },
    ],
  },
];

export default function Sidebar() {
  const dispatch = useAppDispatch();
  const active = useAppSelector(s => s.ui.sidebarActive);

  return (
    <aside className="sidebar">
      <div className="brand-bar">
        <img src="/wynta-logo.png" alt="Wynta"/>
        <span className="brand-suffix">BONUS</span>
      </div>
      <div className="nav-scroll">
        {SECTIONS.map((sec, i) => (
          <div key={i}>
            <div className="nav-section-label">{sec.label}</div>
            {sec.items.map(it => (
              <div
                key={it.id}
                className={'nav-item' + (active === it.id ? ' active' : '')}
                onClick={() => dispatch(setSidebarActive(it.id))}
                role="button"
                aria-current={active === it.id ? 'page' : undefined}
              >
                <Icon name={it.icon} size={16} strokeWidth={1.8}/>
                <span>{it.label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
