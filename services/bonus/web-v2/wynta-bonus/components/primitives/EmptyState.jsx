'use client';
import Icon from './Icon';

export default function EmptyState({ icon = 'inbox', label, hint }) {
  return (
    <div className="empty-state">
      <div className="illustration"><Icon name={icon} size={40} color="var(--g300)"/></div>
      {label && <div className="label">{label}</div>}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
