'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon';
import { fetchUserProfile } from '../../services/pamUsersApi';
import type { PamUserProfile } from '../../services/pamUsersApi';
import { _initials, _tierClass, _kycClass } from './SegmentUsersList';
import PlayerActivitySection from './PlayerActivityPanels';
import type { Segment } from '../../types';

interface UserProfileModalProps {
  userId: string | null;
  brandId?: string | null;
  segment: Segment | null;
  onClose: () => void;
  showBonus?: boolean;
  siteId?: string | number | null;
}

function displayName(profile: PamUserProfile): string {
  const { first_name, last_name } = profile.traits;
  const name = [first_name, last_name].filter(Boolean).join(' ').trim();
  return name || profile.user_id;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function UserProfileModal({ userId, brandId, segment, onClose, showBonus = false, siteId }: UserProfileModalProps) {
  const [profile, setProfile] = useState<PamUserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setError(null);
      return;
    }
    if (!brandId) {
      setProfile(null);
      setError('brand_id is required');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchUserProfile(userId, brandId)
      .then((p) => { if (!cancelled) setProfile(p); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load user'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, brandId]);

  useEffect(() => {
    if (!userId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [userId, onClose]);

  if (!userId || typeof document === 'undefined') return null;

  const traits = profile?.traits ?? {};

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-icon"><Icon name="user" size={16}/></span>
          <div className="modal-title-block">
            <span className="modal-title">User Profile</span>
            <span className="modal-subtitle">{segment ? ('In segment · ' + segment.label) : 'User lookup'}</span>
          </div>
          <button className="close" style={{ marginLeft: 'auto' }} onClick={onClose} title="Close (Esc)">
            <Icon name="x" size={14}/>
          </button>
        </div>
        <div className="modal-body">
          {loading && (
            <div className="seg-players-empty">
              <Icon name="loader" size={16} color="var(--g400)"/> Loading…
            </div>
          )}
          {error && !loading && (
            <div className="seg-players-empty" style={{ color: 'var(--red)' }}>
              <Icon name="alert-circle" size={16}/> {error}
            </div>
          )}
          {profile && !loading && !error && (
            <div className="player-profile">
              <div className="player-profile-head">
                <span className="avatar-lg">{_initials(displayName(profile))}</span>
                <div className="info">
                  <div className="name">
                    {displayName(profile)}
                    {traits.vip_level && (
                      <span className={'tier-badge ' + _tierClass(traits.vip_level)}>{traits.vip_level}</span>
                    )}
                    {traits.kyc_status && (
                      <span className={'kyc-badge ' + _kycClass(traits.kyc_status)}>KYC · {traits.kyc_status}</span>
                    )}
                  </div>
                  <div className="sub">
                    <span className="pid">{profile.user_id}</span>
                    <span className="dot">·</span>
                    <span>pam_id {profile.pam_id ?? 'not linked'}</span>
                    {traits.email && (
                      <>
                        <span className="dot">·</span>
                        <span>{traits.email}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="player-section-label">Account</div>
              <div className="player-info-grid">
                <div className="kv"><span className="k">Country</span><span className="v">{traits.country ?? '—'}</span></div>
                <div className="kv"><span className="k">Currency</span><span className="v">{traits.currency ?? '—'}</span></div>
                <div className="kv"><span className="k">Language</span><span className="v">{traits.language ?? '—'}</span></div>
                <div className="kv"><span className="k">Date of birth</span><span className="v">{formatDate(traits.date_of_birth)}</span></div>
                <div className="kv"><span className="k">Registered</span><span className="v">{formatDate(traits.registration_date)}</span></div>
                <div className="kv"><span className="k">Last seen</span><span className="v">{formatDate(profile.last_seen_at)}</span></div>
                <div className="kv"><span className="k">First seen</span><span className="v">{formatDate(profile.first_seen_at)}</span></div>
                <div className="kv"><span className="k">Account status</span><span className="v">{traits.account_status ?? '—'}</span></div>
                <div className="kv"><span className="k">Health status</span><span className="v">{profile.health_status ?? '—'}</span></div>
              </div>

              <div className="player-section-label">Segments · {profile.segments.length}</div>
              <div className="segment-chip-list">
                {profile.segments.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--g400)', fontStyle: 'italic' }}>
                    Not a member of any other segments.
                  </span>
                ) : (
                  profile.segments.map((s) => (
                    <span key={s.segment_id} className="segment-chip">{s.name ?? s.segment_id}</span>
                  ))
                )}
              </div>

              <PlayerActivitySection
                userId={profile.user_id}
                brandId={brandId}
                showBonus={showBonus}
                siteId={siteId}
              />
            </div>
          )}
        </div>
        <div className="modal-footer-row" style={{ justifyContent: 'flex-end', gap: 8, display: 'flex' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
