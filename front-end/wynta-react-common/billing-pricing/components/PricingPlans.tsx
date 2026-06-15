'use client';
import { useState } from 'react';
import type { Plan, PlanTier } from '../types';

interface Props {
  plans: Plan[];
  currentPlanId: PlanTier;
  onContactUs?: () => void;
}

export default function PricingPlans({ plans, currentPlanId, onContactUs }: Props) {
  const [hoveredPlan, setHoveredPlan] = useState<PlanTier | null>(null);

  return (
    <div style={{ position: 'relative', marginBottom: 40 }}>
      <div style={{ display: 'flex', gap: 16, position: 'relative', alignItems: 'stretch' }}>
        {plans.map(plan => {
          const isCurrent = plan.id === currentPlanId;
          return (
            <div key={plan.id} style={{ flex: 1, position: 'relative', paddingTop: isCurrent ? 0 : 36, display: 'flex', flexDirection: 'column' }}>

              {/* "Your Pack" bubble */}
              {isCurrent && (
                <div style={{ display: 'flex', justifyContent: 'center', height: 36, alignItems: 'flex-end' }}>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <div style={{
                      background: '#1f2937', color: '#fff',
                      fontSize: 12, fontWeight: 600,
                      padding: '5px 14px', borderRadius: 20,
                      whiteSpace: 'nowrap',
                    }}>
                      Your Pack
                    </div>
                    <div style={{
                      position: 'absolute', bottom: -7, left: '50%',
                      transform: 'translateX(-50%)',
                      width: 0, height: 0,
                      borderLeft: '7px solid transparent',
                      borderRight: '7px solid transparent',
                      borderTop: '7px solid #1f2937',
                    }} />
                  </div>
                </div>
              )}

              {/* Card */}
              <div
                onMouseEnter={() => setHoveredPlan(plan.id)}
                onMouseLeave={() => setHoveredPlan(null)}
                style={{
                  border: `1px solid ${hoveredPlan === plan.id || isCurrent ? '#0091E0' : '#e5e7eb'}`,
                  borderRadius: 8,
                  background: '#fff',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'border-color 0.15s',
                  flex: 1,
                }}
              >
                {/* Header */}
                <div style={{
                  background: '#0091E0',
                  paddingTop: 10, paddingBottom: 10,
                  textAlign: 'center',
                  fontSize: 18, fontWeight: 700, color: '#fff',
                  marginBottom: 0,
                }}>
                  {plan.label}
                </div>

                {/* Price block — #f7f9fc bg */}
                <div style={{ background: '#f7f9fc', textAlign: 'center', paddingTop: 20 }}>
                  {plan.isCustom ? (
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#0091E0' }}>
                      Custom Pricing
                    </div>
                  ) : (
                    <div style={{ fontSize: 32, fontWeight: 700, color: '#0091E0' }}>
                      <span style={{ fontSize: 20 }}>£</span>
                      {plan.priceLabel?.replace('£', '')}
                    </div>
                  )}
                  {/* Sub-label */}
                  <p style={{
                    fontSize: 14, textAlign: 'center',
                    background: '#f7f9fc', marginTop: -30,
                    marginBottom: 0, paddingTop: 20, paddingBottom: 10,
                    color: '#6b7280',
                  }}>
                    {plan.subLabel}
                  </p>

                  {/* Description */}
                  <p style={{
                    fontSize: 14, textAlign: 'left',
                    width: '100%', margin: 0,
                    borderTop: '1px solid #e2e2e2',
                    paddingTop: 12, background: '#f7f9fc',
                    paddingBottom: 12, paddingLeft: 24,
                    paddingRight: 16,
                    color: '#374151', lineHeight: 1.6,
                    boxSizing: 'border-box',
                  }}>
                    {plan.description}
                  </p>
                </div>

                {/* Features list */}
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1 }}>
                  {plan.features.map((feature, fi) => (
                    <li
                      key={fi}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '9px 16px 9px 20px',
                        borderBottom: '1px solid #e2e2e2',
                        fontSize: 12.5, color: '#374151',
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M2.5 7L5.5 10L11.5 4" stroke="#0091E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Footer note */}
                {plan.footerNote && (
                  <p style={{
                    fontSize: 11.5, marginTop: -1,
                    textAlign: 'left', paddingLeft: 22, paddingRight: 16,
                    paddingTop: 10, paddingBottom: 10,
                    color: '#afaeae',
                  }}>
                    {plan.footerNote}
                  </p>
                )}

                {/* CTA button */}
                {plan.ctaLabel && (
                  <div style={{ padding: '0 20px 20px' }}>
                    <button
                      type="button"
                      onClick={onContactUs}
                      style={{
                        display: 'block', width: '100%',
                        padding: '10px 0',
                        background: '#0091E0', color: '#fff',
                        border: 'none', borderRadius: 24,
                        fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                    >
                      {plan.ctaLabel}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
