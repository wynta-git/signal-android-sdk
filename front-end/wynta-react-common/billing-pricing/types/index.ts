export type PlanTier = 'starter' | 'ai' | 'enterprise';
export type BillingCycle = 'Monthly' | 'Annual';

export interface PlanFeature {
  text: string;
}

export interface Plan {
  id: PlanTier;
  label: string;
  name: string;
  price: string | null;
  priceLabel: string;
  subLabel: string;
  description: string;
  features: string[];
  footerNote?: string;
  ctaLabel?: string;
  isCustom?: boolean;
}

export interface CurrentPlan {
  planId: PlanTier;
  planName: string;
  badge: string;
  pricePerMonth: string;
  activeBrands: number;
  billingCycle: BillingCycle;
  nextInvoice: string;
  memberSince: string;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}
