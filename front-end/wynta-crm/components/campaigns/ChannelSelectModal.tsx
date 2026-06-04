'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from 'wynta-react-common/components/Icon';

interface ChannelCard {
  id: string;
  label: string;
  icon: string;
}

const OUTBOUND: ChannelCard[] = [
  { id: 'push',  label: 'Push',  icon: 'bell'           },
  { id: 'email', label: 'Email', icon: 'mail'            },
  { id: 'sms',   label: 'SMS',   icon: 'message-square'  },
];

const INBOUND: ChannelCard[] = [
  { id: 'in_app',  label: 'In-App',  icon: 'smartphone'  },
  { id: 'on_site', label: 'On-Site', icon: 'globe'        },
  { id: 'cards',   label: 'Cards',   icon: 'credit-card'  },
];

const MESSAGING: ChannelCard[] = [
  { id: 'whatsapp', label: 'WhatsApp', icon: 'message-circle' },
  { id: 'telegram', label: 'Telegram', icon: 'send'           },
  { id: 'rcs',      label: 'RCS',      icon: 'message-square' },
];

/** Only Push is enabled; every other channel is coming soon. */
const ENABLED_CHANNELS = new Set(['push']);

interface Props {
  onClose:  () => void;
  onSelect: (channel: string) => void;
}

export default function ChannelSelectModal({ onClose, onSelect }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const Section = ({ title, cards }: { title: string; cards: ChannelCard[] }) => (
    <div className="csp-section">
      <div className="csp-section-label">{title}</div>
      <div className="csp-grid">
        {cards.map(c => {
          const enabled = ENABLED_CHANNELS.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className={'csp-card' + (!enabled ? ' csp-card--disabled' : '')}
              onClick={() => enabled && onSelect(c.id)}
              disabled={!enabled}
              aria-disabled={!enabled}
              title={!enabled ? 'Coming soon' : undefined}
            >
              <Icon name={c.icon} size={22} strokeWidth={1.5} />
              <span>{c.label}</span>
              {!enabled && <span className="csp-card-soon">Soon</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  return createPortal(
    <>
      <div className="csp-backdrop" onClick={onClose} />
      <div className="csp-panel" role="dialog" aria-label="Add Campaign">
        <div className="csp-header">
          <span className="csp-title">Add Campaign</span>
          <button type="button" className="asm-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="csp-body">
          <Section title="OUTBOUND"       cards={OUTBOUND}  />
          <Section title="INBOUND"        cards={INBOUND}   />
          <Section title="MESSAGING APPS" cards={MESSAGING} />
        </div>
      </div>
    </>,
    document.body,
  );
}
