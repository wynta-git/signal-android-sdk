'use client';
import Icon from 'wynta-react-common/components/Icon';
import type { NavSection } from 'wynta-react-common/components/AppShell';

interface CrmTopbarProps {
  activeNav: string;
  navSections: NavSection[];
  onReset?: () => void;
}

export default function CrmTopbar({ activeNav, navSections, onReset }: CrmTopbarProps) {
  const label = navSections.flatMap(s => s.items).find(i => i.id === activeNav)?.label ?? activeNav;
  return (
    <div className="crumb">
      <span style={{ cursor: onReset ? 'pointer' : 'default' }} onClick={onReset}>CRM</span>
      <span className="sep"><Icon name="chevron-right" size={12}/></span>
      <span className="current">{label}</span>
    </div>
  );
}
