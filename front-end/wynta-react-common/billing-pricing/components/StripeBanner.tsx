'use client';

export default function StripeBanner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '16px 20px',
      background: '#f5f3ff',
      border: '1px solid #ede9fe',
      borderRadius: 8,
      marginBottom: 32,
    }}>
      {/* Stripe S icon */}
      <div style={{
        width: 36, height: 36, borderRadius: 6, flexShrink: 0,
        background: '#635bff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 700, color: '#fff', fontFamily: 'serif',
        fontStyle: 'italic',
      }}>
        S
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#6562b8', display: 'block', marginBottom: 3 }}>
          Billing is powered by Stripe
        </div>
        <div style={{ fontSize: 12, color: '#7c3aed', lineHeight: 1.5 }}>
          All subscriptions, invoicing and payments are securely managed via Stripe's enterprise-grade payment infrastructure. Credit card payments only.
        </div>
      </div>
    </div>
  );
}
