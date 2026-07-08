'use client';
import { ConnectorSettings } from 'wynta-react-common/workspace-settings';

export default function IntegrationsPage() {
  return (
    <div style={{ background: 'var(--crm-bg)', minHeight: '100%', padding: '20px 24px 48px' }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--crm-fg1)', margin: 0 }}>Configuration</h1>
        <p style={{ fontSize: 13, color: 'var(--crm-fg3)', margin: '4px 0 0' }}>
          Connect your Email and Push providers.
        </p>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* Connectors (Email & Push)                                    */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: 36 }}>
        <ConnectorSettings />
      </section>

    </div>
  );
}
