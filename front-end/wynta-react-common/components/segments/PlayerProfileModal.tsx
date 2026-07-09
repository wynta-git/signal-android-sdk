'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon';
import { formatINRCompact } from '../../utils';
import { _initials, _tierClass, _kycClass } from './SegmentUsersList';
import PlayerActivitySection from './PlayerActivityPanels';
import type { Player, Segment } from '../../types';

interface PlayerProfileModalProps {
  player: Player | null;
  segment: Segment | null;
  onClose: () => void;
  siteId?: string | number | null;
  showBonus?: boolean;
}

export default function PlayerProfileModal({ player, segment, onClose, siteId, showBonus = false }: PlayerProfileModalProps) {
  useEffect(() => {
    if (!player) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [player, onClose]);

  if (!player) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-icon"><Icon name="user" size={16}/></span>
          <div className="modal-title-block">
            <span className="modal-title">Player Profile</span>
            <span className="modal-subtitle">{segment ? ('In segment · ' + segment.label) : 'Player lookup'}</span>
          </div>
          <button className="close" style={{ marginLeft: 'auto' }} onClick={onClose} title="Close (Esc)">
            <Icon name="x" size={14}/>
          </button>
        </div>
        <div className="modal-body">
          <div className="player-profile">
            <div className="player-profile-head">
              <span className="avatar-lg">{_initials(player.name)}</span>
              <div className="info">
                <div className="name">
                  {player.name}
                  <span className={'tier-badge ' + _tierClass(player.tier)}>{player.tier}</span>
                  <span className={'kyc-badge ' + _kycClass(player.kyc)}>KYC · {player.kyc}</span>
                </div>
                <div className="sub">
                  <span className="pid">#{player.id}</span>
                  <span className="dot">·</span>
                  <span>{player.email}</span>
                  <span className="dot">·</span>
                  <span>{player.state}, India</span>
                </div>
              </div>
            </div>

            <div className="player-stats">
              <div className="player-stat-tile">
                <div className="label">Lifetime Deposits</div>
                <div className="value">{formatINRCompact(player.lifetimeDep)}</div>
              </div>
              <div className="player-stat-tile">
                <div className="label">Lifetime Wagered</div>
                <div className="value">{formatINRCompact(player.lifetimeWager)}</div>
              </div>
              <div className="player-stat-tile">
                <div className="label">Lifetime GGR</div>
                <div className="value">{formatINRCompact(player.lifetimeGgr)}</div>
              </div>
              <div className="player-stat-tile">
                <div className="label">Bonuses Used</div>
                <div className="value">{player.totalBonuses}</div>
              </div>
            </div>

            <div className="player-section-label">Account</div>
            <div className="player-info-grid">
              <div className="kv"><span className="k">Phone</span><span className="v">{player.phone}</span></div>
              <div className="kv"><span className="k">Joined</span><span className="v">{player.daysAgoReg} days ago</span></div>
              <div className="kv"><span className="k">Last login</span><span className="v">{player.daysAgoLogin === 0 ? 'Today' : player.daysAgoLogin + ' days ago'}</span></div>
              <div className="kv"><span className="k">Sessions (last 7d)</span><span className="v">{player.sessions7}</span></div>
              <div className="kv"><span className="k">Country</span><span className="v">India</span></div>
              <div className="kv"><span className="k">State</span><span className="v">{player.state}</span></div>
              <div className="kv"><span className="k">Preferred product</span><span className="v">{player.product}</span></div>
              <div className="kv"><span className="k">Account status</span><span className="v" style={{ color: 'var(--ok)' }}>Active</span></div>
            </div>

            <PlayerActivitySection
              userId={String(player.id)}
              showBonus={showBonus}
              siteId={siteId}
            />
          </div>
        </div>
        <div className="modal-footer-row" style={{ justifyContent: 'flex-end', gap: 8, display: 'flex' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
          <button className="btn btn-primary btn-sm">
            <Icon name="external-link" size={12}/> Open Full Profile
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
