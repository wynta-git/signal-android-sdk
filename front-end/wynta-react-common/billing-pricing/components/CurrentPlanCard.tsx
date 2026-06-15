'use client';
import type { CurrentPlan } from '../types';

interface Props {
  plan: CurrentPlan;
}

export default function CurrentPlanCard({ plan }: Props) {
  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderLeft: '4px solid #0091E0',
      borderRadius: 8,
      background: '#fff',
      padding: '20px 24px',
      marginBottom: 20,
    }}>
      {/* Current Pack badge */}
      <div style={{ marginBottom: 10 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 700, color: '#0091E0',
          border: '1px solid #0091E0', borderRadius: 20,
          padding: '3px 12px', letterSpacing: 0.8,
        }}>
          ✓ CURRENT PACK
        </span>
      </div>

      {/* Plan name + price row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>{plan.planName}</h2>
          <span style={{
            fontSize: 12, fontWeight: 600, color: '#fff',
            background: '#0091E0', borderRadius: 20, padding: '3px 12px',
          }}>
            {plan.badge}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: '#111827' }}>{plan.pricePerMonth}</span>
          <span style={{ fontSize: 13, color: '#6b7280', marginLeft: 4 }}>/ month</span>
        </div>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
        <MetaItem label="ACTIVE BRANDS" value={
          <span style={{
            display: 'inline-block', background: '#374151', color: '#fff',
            fontSize: 13, fontWeight: 600, padding: '2px 10px', borderRadius: 4,
          }}>
            {plan.activeBrands} Brand
          </span>
        } />
        <MetaItem label="BILLING CYCLE" value={plan.billingCycle} />
        <MetaItem label="NEXT INVOICE" value={plan.nextInvoice} />
        <MetaItem label="MEMBER SINCE" value={plan.memberSince} />
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: 0.8, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{value}</div>
    </div>
  );
}
