"use client";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import Icon from "./Icon";
import BrandSwitcher from "./BrandSwitcher";
import DjSidebarSlot from "./DjSidebarSlot";
import CopilotPanel from "./copilot/CopilotPanel";
import { fetchBrands } from "../store/slices/brandsSlice";

export interface NavItem {
  id: string;
  label: string;
  icon: string;
}
export interface NavSection {
  label: string;
  items: NavItem[];
}

interface AppShellProps {
  appLabel: string;
  navSections?: NavSection[];
  activeNav: string;
  onNavChange: (id: string) => void;
  selectedBrand: number | null;
  onBrandChange: (siteId: number) => void;
  topbarCenter?: React.ReactNode;
  topbarActions?: React.ReactNode;
  overlays?: React.ReactNode;
  sidebar?: React.ReactNode;
  children: React.ReactNode;
}

export default function AppShell({
  appLabel,
  navSections,
  activeNav,
  onNavChange,
  selectedBrand,
  onBrandChange,
  topbarCenter,
  topbarActions,
  overlays,
  sidebar,
  children,
}: AppShellProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatch = useDispatch<any>();

  useEffect(() => {
    dispatch(fetchBrands());
  }, [dispatch]);

  return (
    <div className="shell">
      {sidebar ?? <DjSidebarSlot onNavChange={onNavChange} activeNav={activeNav} />}
      <main className="main">
        <div className="main-topbar">
          <div className="tb-brand">
            <BrandSwitcher
              value={selectedBrand}
              onChange={onBrandChange}
              compact
            />
          </div>
          {topbarCenter}
          <div className="spacer" />
          {topbarActions}
          <button className="icon-btn" title="Notifications">
            <Icon name="bell" size={15} />
          </button>
          <div className="avatar" title="vanessa@wynta.com">
            V
          </div>
        </div>
        {children}
      </main>
      <CopilotPanel />
      {overlays}
    </div>
  );
}
