'use client';
import { avatarGradient, initial } from '../../services/mocks/utils';
import type { OwnerEntry } from '../../types';

interface OwnerPillProps {
  owner: OwnerEntry;
  isMain?: boolean;
}

export default function OwnerPill({ owner, isMain }: OwnerPillProps) {
  return (
    <div className={'owner-pill' + (isMain ? ' owner-pill-main' : '')}>
      <span className="av" style={{ background: avatarGradient(owner.username) }}>
        {initial(owner.username)}
      </span>
      <span className="name">{owner.username}</span>
      {isMain && (
        <span
          title="Main owner"
          style={{ fontSize: 9, color: 'var(--blue)', fontWeight: 700, letterSpacing: '0.05em' }}
        >
          ★ MAIN
        </span>
      )}
      <span className="role">{owner.role}</span>
      {!owner.active && (
        <span style={{ fontSize: 9, color: 'var(--err)', fontWeight: 700, letterSpacing: '0.05em' }}>OFF</span>
      )}
    </div>
  );
}
