'use client';
import CurrentPlanCard from './components/CurrentPlanCard';
import StripeBanner    from './components/StripeBanner';
import PricingPlans    from './components/PricingPlans';
import FAQ             from './components/FAQ';
import { CURRENT_PLAN, PLANS, FAQ_ITEMS } from './constants/mockData';

interface BillingPricingPageProps {
  onContactUs?: () => void;
}

export default function BillingPricingPage({ onContactUs }: BillingPricingPageProps) {
  return (
    <div style={{
      padding: '0px 24px 24px',
      minHeight: '100%',
      background: 'rgb(255, 255, 255)',
      position: 'relative',
    }}>
      {/* Page title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 20px', paddingTop: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 500, color: '#222222', margin: 0 }}>
          Billing &amp; Pricing
        </h3>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: '#9ca3af', flexShrink: 0 }}>
          <circle cx="8" cy="8" r="7" stroke="#9ca3af" strokeWidth="1.5"/>
          <path d="M8 7v5M8 5.5v.5" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Current plan */}
      <CurrentPlanCard plan={CURRENT_PLAN} />

      {/* Stripe banner */}
      <StripeBanner />

      {/* Pricing plans */}
      <PricingPlans
        plans={PLANS}
        currentPlanId={CURRENT_PLAN.planId}
        onContactUs={onContactUs}
      />

      {/* FAQ */}
      <FAQ items={FAQ_ITEMS} />

      {/* Copyright footer */}
      <div style={{
        background: '#ffffff',
        color: '#000',
        left: 0,
        fontSize: 14,
        padding: '17px 15px 15px',
        position: 'absolute',
        bottom: 0,
        right: 0,
        textAlign: 'center',
      }}>
        © Copyright 2026 Demo Affiliates, Powered by Wynta.
      </div>
    </div>
  );
}
