'use client';
import { avatarGradient, initial } from '@/services/mocks/utils';

export default function OwnerPill({ owner }) {
  return (
    <div className="owner-pill">
      <span className="av" style={{ background: avatarGradient(owner.username) }}>
        {initial(owner.username)}
      </span>
      <span className="name">{owner.username}</span>
      <span className="role">{owner.role}</span>
      {!owner.active && (
        <span style={{ fontSize: 9, color: 'var(--err)', fontWeight: 700, letterSpacing: '0.05em' }}>OFF</span>
      )}
    </div>
  );
}
