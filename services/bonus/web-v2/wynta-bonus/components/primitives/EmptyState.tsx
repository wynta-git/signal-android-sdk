'use client';
import Icon from './Icon';

interface EmptyStateProps {
  icon?: string;
  label?: string;
  hint?: string;
}

export default function EmptyState({ icon = 'inbox', label, hint }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="illustration"><Icon name={icon} size={40} color="var(--g300)"/></div>
      {label && <div className="label">{label}</div>}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
