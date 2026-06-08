'use client';
import { useState } from 'react';
import Icon from 'wynta-react-common/components/Icon';

/* ------------------------------------------------------------------ */
/* Shared primitives                                                    */
/* ------------------------------------------------------------------ */
const INPUT_STYLE: React.CSSProperties = {
  width: '100%', height: 34,
  border: '1px solid var(--crm-border-md)', borderRadius: 6,
  padding: '0 10px', fontSize: 12.5, color: 'var(--crm-fg1)',
  background: '#fff', outline: 'none', fontFamily: 'inherit',
};

const SELECT_STYLE: React.CSSProperties = {
  width: '100%', height: 36,
  border: '1px solid var(--crm-border-md)', borderRadius: 6,
  padding: '0 10px', fontSize: 13, color: 'var(--crm-fg1)',
  background: '#fff', fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} onClick={onChange}
      style={{
        position: 'relative', width: 40, height: 22, borderRadius: 11,
        border: 'none', background: checked ? 'var(--crm-blue)' : 'var(--crm-border-md)',
        cursor: 'pointer', flexShrink: 0, transition: 'background .15s', padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
      }} />
    </button>
  );
}

function SettingRow({ label, description, checked, onChange, children }: {
  label: string; description: string;
  checked: boolean; onChange: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start',
      padding: '16px 0', borderBottom: '1px solid var(--crm-border)', gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--crm-fg1)' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--crm-fg4)', marginTop: 2 }}>{description}</div>
      </div>
      {children}
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <Icon name={icon} size={16} strokeWidth={1.8} />
      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--crm-fg1)', margin: 0 }}>{title}</h2>
    </div>
  );
}

function StatusBanner({ icon, bold, rest }: { icon: string; bold: string; rest: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 16px', background: '#edfaf3',
      border: '1px solid #b2e8cc', borderRadius: 8, marginBottom: 16,
      fontSize: 12.5, color: 'var(--crm-positive)', fontWeight: 500,
    }}>
      <Icon name={icon} size={15} strokeWidth={2} />
      <span>
        <strong>{bold}</strong>{' '}
        <span style={{ color: 'var(--crm-fg3)', fontWeight: 400 }}>{rest}</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card avatar                                                          */
/* ------------------------------------------------------------------ */
function CardAvatar({ initial, color }: { initial: string; color: string }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 8, background: color, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: 15, flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Push provider card                                                   */
/* ------------------------------------------------------------------ */
interface PushField { label: string; value: string }
interface PushCardProps {
  initial: string; color: string; name: string; subtitle: string;
  description: string; fields: PushField[];
  badge: { count: string; type: 'devices' | 'browsers' };
}

function PushCard({ initial, color, name, subtitle, description, fields, badge }: PushCardProps) {
  const [vals, setVals] = useState(fields.map(f => f.value));
  const [testing, setTesting] = useState(false);
  function test() { setTesting(true); setTimeout(() => setTesting(false), 1500); }
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--crm-border)', borderRadius: 10,
      padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', gap: 14,
      flex: '1 1 260px', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <CardAvatar initial={initial} color={color} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--crm-fg1)', lineHeight: 1.3 }}>{name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--crm-fg4)', marginTop: 1 }}>{subtitle}</div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--crm-fg3)', lineHeight: 1.55, margin: 0 }}>{description}</p>
      {fields.map((f, i) => (
        <div key={f.label}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--crm-fg2)', marginBottom: 5, fontWeight: 500 }}>
            {f.label}
          </label>
          <input type="text" value={vals[i]}
            onChange={e => setVals(p => p.map((v, j) => j === i ? e.target.value : v))}
            style={INPUT_STYLE} />
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600,
          color: 'var(--crm-positive)', background: 'var(--crm-positive-bg)',
          borderRadius: 20, padding: '3px 10px',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--crm-positive)', display: 'inline-block' }} />
          {badge.count} {badge.type}
        </span>
        <button type="button" onClick={test} disabled={testing} style={{
          height: 30, padding: '0 14px', border: '1px solid var(--crm-border-md)',
          borderRadius: 6, background: '#fff', fontSize: 12, color: 'var(--crm-fg2)',
          cursor: testing ? 'default' : 'pointer', fontFamily: 'inherit',
          fontWeight: 500, opacity: testing ? 0.6 : 1,
        }}>
          {testing ? 'Testing…' : 'Test Connection'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* In-App SDK card                                                      */
/* ------------------------------------------------------------------ */
interface SdkCardProps {
  initial: string; color: string; name: string; subtitle: string;
  description: string; fieldLabel: string; fieldValue: string; sdkVersion: string;
}

function SdkCard({ initial, color, name, subtitle, description, fieldLabel, fieldValue, sdkVersion }: SdkCardProps) {
  const [val, setVal] = useState(fieldValue);
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--crm-border)', borderRadius: 10,
      padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', gap: 14,
      flex: '1 1 260px', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <CardAvatar initial={initial} color={color} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--crm-fg1)', lineHeight: 1.3 }}>{name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--crm-fg4)', marginTop: 1 }}>{subtitle}</div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--crm-fg3)', lineHeight: 1.55, margin: 0 }}
        dangerouslySetInnerHTML={{ __html: description }} />
      <div>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--crm-fg2)', marginBottom: 5, fontWeight: 500 }}>
          {fieldLabel}
        </label>
        <input type="text" value={val} onChange={e => setVal(e.target.value)} style={INPUT_STYLE} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600,
          color: '#0077b6', background: '#e0f2fe', borderRadius: 20, padding: '3px 10px',
        }}>
          {sdkVersion}
        </span>
        <button type="button" style={{
          height: 30, padding: '0 14px', border: '1px solid var(--crm-border-md)',
          borderRadius: 6, background: '#fff', fontSize: 12, color: 'var(--crm-fg2)',
          cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
        }}>
          View Docs
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Omni-channel card                                                    */
/* ------------------------------------------------------------------ */
type OmniStatus = 'connected' | 'not-verified' | 'not-connected';
interface OmniField { label: string; placeholder?: string; value?: string; type?: 'text' | 'password' | 'select'; options?: string[] }
interface OmniCardProps {
  initial: string; color: string; name: string; subtitle: string;
  description: string; fields: OmniField[];
  status: OmniStatus; actionLabel?: string;
}

const STATUS_MAP: Record<OmniStatus, { label: string; dot: string; text: string; bg: string }> = {
  'connected':     { label: 'Connected',    dot: 'var(--crm-positive)',  text: 'var(--crm-positive)',  bg: 'var(--crm-positive-bg)' },
  'not-verified':  { label: 'Not verified', dot: '#d97706',              text: '#d97706',              bg: '#fef3c7' },
  'not-connected': { label: 'Not connected',dot: 'var(--crm-fg4)',       text: 'var(--crm-fg3)',       bg: 'var(--crm-bg)' },
};

function OmniCard({ initial, color, name, subtitle, description, fields, status, actionLabel = 'Test Connection' }: OmniCardProps) {
  const [vals, setVals] = useState(fields.map(f => f.value ?? f.placeholder ?? ''));
  const [testing, setTesting] = useState(false);
  function test() { setTesting(true); setTimeout(() => setTesting(false), 1500); }
  const s = STATUS_MAP[status];
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--crm-border)', borderRadius: 10,
      padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', gap: 12,
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <CardAvatar initial={initial} color={color} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--crm-fg1)', lineHeight: 1.3 }}>{name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--crm-fg4)', marginTop: 1 }}>{subtitle}</div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--crm-fg3)', lineHeight: 1.55, margin: 0 }}>{description}</p>
      {fields.map((f, i) => (
        <div key={i}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--crm-fg2)', marginBottom: 5, fontWeight: 500 }}>
            {f.label}
          </label>
          {f.type === 'select' ? (
            <select value={vals[i]} onChange={e => setVals(p => p.map((v, j) => j === i ? e.target.value : v))}
              style={{ ...SELECT_STYLE, height: 34, fontSize: 12.5 }}>
              {(f.options ?? []).map(o => <option key={o}>{o}</option>)}
            </select>
          ) : (
            <input
              type={f.type === 'password' ? 'password' : 'text'}
              value={vals[i]}
              placeholder={f.placeholder}
              onChange={e => setVals(p => p.map((v, j) => j === i ? e.target.value : v))}
              style={INPUT_STYLE}
            />
          )}
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 12, fontWeight: 600, color: s.text, background: s.bg,
          borderRadius: 20, padding: '3px 10px',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
          {s.label}
        </span>
        <button type="button" onClick={test} disabled={testing} style={{
          height: 30, padding: '0 14px', border: '1px solid var(--crm-border-md)',
          borderRadius: 6, background: '#fff', fontSize: 12, color: 'var(--crm-fg2)',
          cursor: testing ? 'default' : 'pointer', fontFamily: 'inherit',
          fontWeight: 500, opacity: testing ? 0.6 : 1,
        }}>
          {testing ? 'Testing…' : actionLabel}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Global settings panel (shared layout)                               */
/* ------------------------------------------------------------------ */
function GlobalSettingsPanel({ title, rows, controls }: {
  title: string;
  rows: { label: string; desc: string; checked: boolean; toggle: () => void }[];
  controls: React.ReactNode;
}) {
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--crm-border)',
      borderRadius: 10, padding: '0 24px',
    }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--crm-fg1)', padding: '18px 0 0', margin: 0 }}>
        {title}
      </h2>
      <div style={{ display: 'flex', gap: 48 }}>
        <div style={{ flex: '0 0 420px' }}>
          {rows.map(r => (
            <SettingRow key={r.label} label={r.label} description={r.desc}
              checked={r.checked} onChange={r.toggle} />
          ))}
        </div>
        <div style={{ flex: 1, padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {controls}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */
export default function IntegrationsPage() {
  const [saved, setSaved] = useState(false);

  /* Push state */
  const [pushDnd,             setPushDnd]             = useState(true);
  const [pushFreqCap,         setPushFreqCap]         = useState(true);
  const [pushQueueing,        setPushQueueing]        = useState(true);
  const [pushSendSmart,       setPushSendSmart]       = useState(false);
  const [pushTtl,             setPushTtl]             = useState('24h');
  const [pushMaxSends,        setPushMaxSends]        = useState('3');
  const [pushThrottle,        setPushThrottle]        = useState('10000');

  /* In-app state */
  const [iamFreqCap,          setIamFreqCap]          = useState(true);
  const [iamDnd,              setIamDnd]              = useState(true);
  const [iamOneAtATime,       setIamOneAtATime]       = useState(true);
  const [iamRespGaming,       setIamRespGaming]       = useState(true);
  const [iamMaxPerDay,        setIamMaxPerDay]        = useState('3');
  const [iamMinGap,           setIamMinGap]           = useState('1h');
  const [iamDndStart,         setIamDndStart]         = useState('23:00');
  const [iamDndEnd,           setIamDndEnd]           = useState('08:00');

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ background: 'var(--crm-bg)', minHeight: '100%', padding: '20px 24px 48px' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--crm-fg1)', margin: 0 }}>Configuration</h1>
          <p style={{ fontSize: 13, color: 'var(--crm-fg3)', margin: '4px 0 0' }}>
            Delivery provider setup for Push Notifications, In-App Messaging and Omni-channel
          </p>
        </div>
        <button type="button" onClick={handleSave} style={{
          height: 36, padding: '0 18px', borderRadius: 7, border: 'none',
          background: saved ? 'var(--crm-positive)' : 'var(--crm-blue)',
          color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
          transition: 'background .15s',
        }}>
          {saved ? <><Icon name="check" size={14} /> Saved</> : 'Save All Changes'}
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* 1. Push Notifications                                        */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: 36 }}>
        <SectionHeader icon="bell" title="Push Notifications" />
        <StatusBanner
          icon="check-circle"
          bold="All push providers connected."
          rest="8,241 opted-in devices reachable right now."
        />
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <PushCard
            initial="F" color="#FF6B35"
            name="FCM — Firebase" subtitle="Android push delivery"
            description="Google Firebase Cloud Messaging for Android players. Supports rich media, action buttons and data payloads."
            fields={[
              { label: 'Server Key', value: 'AIzaSyB··············' },
              { label: 'Sender ID',  value: '481029384756' },
            ]}
            badge={{ count: '5,120', type: 'devices' }}
          />
          <PushCard
            initial="A" color="#555"
            name="APNs — Apple" subtitle="iOS push delivery"
            description="Apple Push Notification service for iPhone and iPad. Requires a .p8 auth key or .p12 certificate."
            fields={[
              { label: 'Auth Key (.p8)', value: 'AuthKey_X9·····.p8' },
              { label: 'Bundle ID',      value: 'com.wynta.casino' },
            ]}
            badge={{ count: '2,904', type: 'devices' }}
          />
          <PushCard
            initial="W" color="#0091E0"
            name="Web Push (VAPID)" subtitle="Browser push delivery"
            description="Browser push for desktop and mobile web players. No app installation required from your players."
            fields={[
              { label: 'VAPID Public Key',  value: 'BM8xqK··············' },
              { label: 'VAPID Private Key', value: '············' },
            ]}
            badge={{ count: '217', type: 'browsers' }}
          />
        </div>
        <GlobalSettingsPanel
          title="Global Delivery Settings"
          rows={[
            { label: 'DND Hours',          desc: 'Block sends between 11 PM and 8 AM in player timezone',   checked: pushDnd,       toggle: () => setPushDnd(v => !v)       },
            { label: 'Frequency Capping',  desc: 'Max 3 push notifications per player per day',            checked: pushFreqCap,   toggle: () => setPushFreqCap(v => !v)   },
            { label: 'Queueing',           desc: 'Retry delivery for temporarily unreachable devices',      checked: pushQueueing,  toggle: () => setPushQueueing(v => !v)  },
            { label: 'Send Intelligently', desc: 'AI picks optimal send time per player',                   checked: pushSendSmart, toggle: () => setPushSendSmart(v => !v) },
          ]}
          controls={<>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--crm-fg2)', marginBottom: 6 }}>
                Default TTL (Time to Live)
              </label>
              <select value={pushTtl} onChange={e => setPushTtl(e.target.value)} style={SELECT_STYLE}>
                <option value="1h">1 hour</option>
                <option value="6h">6 hours</option>
                <option value="12h">12 hours</option>
                <option value="24h">24 hours</option>
                <option value="48h">48 hours</option>
                <option value="72h">72 hours</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--crm-fg2)', marginBottom: 6 }}>
                Max sends per player per day
              </label>
              <input type="number" min={1} max={100} value={pushMaxSends}
                onChange={e => setPushMaxSends(e.target.value)} style={{ ...INPUT_STYLE, height: 36 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--crm-fg2)', marginBottom: 6 }}>
                Throttle rate
              </label>
              <select value={pushThrottle} onChange={e => setPushThrottle(e.target.value)} style={SELECT_STYLE}>
                <option value="1000">1,000 / hour</option>
                <option value="5000">5,000 / hour</option>
                <option value="10000">10,000 / hour</option>
                <option value="50000">50,000 / hour</option>
                <option value="100000">100,000 / hour</option>
                <option value="unlimited">Unlimited</option>
              </select>
            </div>
          </>}
        />
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* 2. In-App Messaging                                          */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: 36 }}>
        <SectionHeader icon="monitor" title="In-App Messaging" />
        <StatusBanner
          icon="check-circle"
          bold="SDK connected on all platforms."
          rest="In-app messaging is active for Android, iOS and Web players."
        />
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <SdkCard
            initial="A" color="#3dbe6c"
            name="Android SDK" subtitle="In-app delivery"
            description='Wynta Android SDK v3.2.1 — In-app notifications delivered natively inside your Android app. Supports Modal, Banner, Nudge and <span style="color:var(--crm-blue);text-decoration:underline;cursor:pointer">Fullscreen layouts</span>.'
            fieldLabel="App ID" fieldValue="com.wynta.casino"
            sdkVersion="SDK v3.2.1"
          />
          <SdkCard
            initial="i" color="#0091E0"
            name="iOS SDK" subtitle="In-app delivery"
            description="Wynta iOS SDK v3.1.8 — In-app notifications for iPhone and iPad. Requires iOS 13+ and Swift / Obj-C integration."
            fieldLabel="Bundle ID" fieldValue="com.wynta.casino"
            sdkVersion="SDK v3.1.8"
          />
          <SdkCard
            initial="W" color="#6B5CE7"
            name="Web SDK" subtitle="In-app delivery"
            description="Wynta Web SDK v2.4.0 — In-app overlays for your web platform. Injected via a single JavaScript snippet. No install required from players."
            fieldLabel="Site domain" fieldValue="casino.wynta.com"
            sdkVersion="SDK v2.4.0"
          />
        </div>
        <GlobalSettingsPanel
          title="Global Display Rules"
          rows={[
            { label: 'Global Frequency Cap',             desc: 'Never show more than 3 in-app messages to a player per day',         checked: iamFreqCap,    toggle: () => setIamFreqCap(v => !v)    },
            { label: 'Respect DND Hours',                desc: 'Do not show messages between 11 PM and 8 AM in player timezone',     checked: iamDnd,        toggle: () => setIamDnd(v => !v)        },
            { label: 'One at a time',                    desc: 'Never show two in-app messages simultaneously; queue the second',    checked: iamOneAtATime, toggle: () => setIamOneAtATime(v => !v) },
            { label: 'Exclude Responsible Gaming flows', desc: 'Never interrupt self-exclusion, limits, or KYC screens',            checked: iamRespGaming, toggle: () => setIamRespGaming(v => !v) },
          ]}
          controls={<>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--crm-fg2)', marginBottom: 6 }}>
                Max in-app messages per player per day
              </label>
              <input type="number" min={1} max={20} value={iamMaxPerDay}
                onChange={e => setIamMaxPerDay(e.target.value)} style={{ ...INPUT_STYLE, height: 36 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--crm-fg2)', marginBottom: 6 }}>
                Minimum gap between messages
              </label>
              <select value={iamMinGap} onChange={e => setIamMinGap(e.target.value)} style={SELECT_STYLE}>
                <option value="15m">15 minutes</option>
                <option value="30m">30 minutes</option>
                <option value="1h">1 hour</option>
                <option value="2h">2 hours</option>
                <option value="4h">4 hours</option>
                <option value="8h">8 hours</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--crm-fg2)', marginBottom: 6 }}>
                DND start time
              </label>
              <input type="time" value={iamDndStart}
                onChange={e => setIamDndStart(e.target.value)} style={{ ...INPUT_STYLE, height: 36 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--crm-fg2)', marginBottom: 6 }}>
                DND end time
              </label>
              <input type="time" value={iamDndEnd}
                onChange={e => setIamDndEnd(e.target.value)} style={{ ...INPUT_STYLE, height: 36 }} />
            </div>
          </>}
        />
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* 3. Omni-channel Messaging                                    */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: 36 }}>
        <SectionHeader icon="mail" title="Omni-channel Messaging" />
        <p style={{ fontSize: 12.5, color: 'var(--crm-fg3)', margin: '-6px 0 16px', lineHeight: 1.55 }}>
          Configure the delivery providers used by Email, SMS, WhatsApp and Telegram campaigns.
          Credentials are read from server environment variables at runtime.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <OmniCard
            initial="SG" color="#1a82e2"
            name="SendGrid" subtitle="Email delivery"
            description="Transactional and bulk email via the SendGrid v3 API. Supports dynamic templates, personalisation and scheduled delivery."
            fields={[
              { label: 'API Key (env: SENDGRID_API_KEY)',  type: 'password', value: 'SG.xxxxxxxxxxxxxxxx' },
              { label: 'From email',                       type: 'text',     value: 'noreply@wynta.com' },
              { label: 'From name',                        type: 'text',     value: 'Wynta Casino' },
            ]}
            status="connected"
          />
          <OmniCard
            initial="Tw" color="#e53935"
            name="Twilio SMS" subtitle="SMS delivery"
            description="SMS messaging via the Twilio REST API. Supports E.164 numbers, alphanumeric sender IDs and international delivery across 180+ countries."
            fields={[
              { label: 'Account SID (env: TWILIO_ACCOUNT_SID)', type: 'password', value: 'ACxxxxxxxxxxxxxxxx' },
              { label: 'Auth Token (env: TWILIO_AUTH_TOKEN)',    type: 'password', value: 'xxxxxxxxxxxxxxxx' },
              { label: 'From number (env: TWILIO_FROM_NUMBER)', type: 'text',     value: '+35699000000' },
            ]}
            status="connected"
          />
          <OmniCard
            initial="W" color="#25d366"
            name="WhatsApp Business API" subtitle="WhatsApp delivery"
            description="Direct Meta Graph API (v18.0) integration. Supports session messages and Meta-approved template campaigns at scale."
            fields={[
              { label: 'Access Token (env: WA_ACCESS_TOKEN)',       type: 'password', value: 'EAAxxxxxxxxxxxxxxxx' },
              { label: 'Phone Number ID (env: WA_PHONE_NUMBER_ID)', type: 'text',     value: '1234567890' },
              { label: 'Business Account ID',                       type: 'text',     placeholder: 'From Meta Business Manager' },
            ]}
            status="not-verified"
            actionLabel="Verify"
          />
          <OmniCard
            initial="T" color="#229ED9"
            name="Telegram Bot API" subtitle="Telegram delivery"
            description="Direct Telegram Bot API integration. Sends to players who have linked their Telegram account and their chat_id is stored in Wynta."
            fields={[
              { label: 'Bot Token (env: TELEGRAM_BOT_TOKEN)', type: 'password', value: 'xxxxxxxxxxxxxxxx' },
              { label: 'Bot username',                         type: 'text',    value: '@WyntaCasinoBot' },
              { label: 'Default parse mode',                   type: 'select',  value: 'Markdown', options: ['Markdown', 'HTML', 'MarkdownV2'] },
            ]}
            status="not-connected"
          />
        </div>
      </section>

    </div>
  );
}
