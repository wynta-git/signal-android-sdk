'use client';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import Icon from './Icon';
import BrandSwitcher from './BrandSwitcher';
import { fetchBrands } from '../store/slices/brandsSlice';

export interface NavItem    { id: string; label: string; icon: string; }
export interface NavSection { label: string; items: NavItem[]; }

interface AppShellProps {
  appLabel: string;
  navSections: NavSection[];
  activeNav: string;
  onNavChange: (id: string) => void;
  selectedBrand: number | null;
  onBrandChange: (siteId: number) => void;
  topbarCenter?: React.ReactNode;
  topbarActions?: React.ReactNode;
  overlays?: React.ReactNode;
  children: React.ReactNode;
}

export default function AppShell({
  appLabel, navSections, activeNav, onNavChange,
  selectedBrand, onBrandChange,
  topbarCenter, topbarActions, overlays, children,
}: AppShellProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatch = useDispatch<any>();

  useEffect(() => {
    dispatch(fetchBrands());
  }, [dispatch]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-bar">
          <img src="/wynta-logo.png" alt="Wynta" />
          <span className="brand-suffix">{appLabel}</span>
        </div>
        <div className="nav-scroll">
          {navSections.map((sec, i) => (
            <div key={i}>
              <div className="nav-section-label">{sec.label}</div>
              {sec.items.map(it => (
                <div
                  key={it.id}
                  className={'nav-item' + (activeNav === it.id ? ' active' : '')}
                  onClick={() => onNavChange(it.id)}
                  role="button"
                  aria-current={activeNav === it.id ? 'page' : undefined}
                >
                  <Icon name={it.icon} size={16} strokeWidth={1.8} />
                  <span>{it.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>
      <main className="main">
        <div className="main-topbar">
          <div className="tb-brand">
            <BrandSwitcher value={selectedBrand} onChange={onBrandChange} compact />
          </div>
          {topbarCenter}
          <div className="spacer" />
          {topbarActions}
          <button className="icon-btn" title="Notifications">
            <Icon name="bell" size={15} />
          </button>
          <div className="avatar" title="vanessa@wynta.com">V</div>
        </div>
        {children}
      </main>
      {overlays}
    </div>
  );
}
