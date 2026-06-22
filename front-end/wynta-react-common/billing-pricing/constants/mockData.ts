import type { Plan, CurrentPlan, FAQItem } from '../types';

export const CURRENT_PLAN: CurrentPlan = {
  planId: 'starter',
  planName: 'Starter Pack',
  badge: 'Starter',
  pricePerMonth: '£765',
  activeBrands: 1,
  billingCycle: 'Monthly',
  nextInvoice: '1 Apr 2026',
  memberSince: 'Jan 2025',
};

export const PLANS: Plan[] = [
  {
    id: 'starter',
    label: 'STARTER',
    name: 'Starter Pack',
    price: '£765',
    priceLabel: '£765',
    subLabel: 'Starter Pack',
    description:
      'Ideal for modest beginnings and getting started in the overwhelming world of affiliate marketing – quick turnouts and top-notch support are what we thrive on',
    features: [
      'Super-quick integration (3 minutes!)',
      'Custom Branding',
      'Real-time monitoring',
      'Activity dashboard',
      'Robust tracking and link building',
      'User management',
      'Support and service',
    ],
    footerNote: '*Chargeable per month per brand',
  },
  {
    id: 'ai',
    label: 'AI',
    name: 'AI Pack',
    price: '£1065',
    priceLabel: '£1065',
    subLabel: 'AI Pack',
    description:
      'Ideal for growing businesses ready to leverage intelligent automation in their affiliate marketing. Data-driven insights take your business places',
    features: [
      'Everything in Starter',
      'AI Overview for Dashboard',
      'AI Summary for Reports',
      'AI Q&A',
      'All New AI Features',
      'Priority Support',
    ],
    footerNote: '*Chargeable per month per brand',
    ctaLabel: 'Contact Us',
  },
  {
    id: 'enterprise',
    label: 'ENTERPRISE',
    name: 'Enterprise Pack',
    price: null,
    priceLabel: 'Custom Pricing',
    subLabel: 'Enterprise Pack',
    description:
      'Ideal for medium to massive sized businesses, there is no upper limit to what you can do on and achieve at Wynta – we\'re rooting for your success all the way!',
    features: [
      'Everything in AI',
      'Premium features',
      'Unlimited clicks, offers and users',
      'Superior optimisation tools',
      'Panel customization and design',
      'AI & Machine Learning Algorithms',
      'Dedicated account manager',
    ],
    footerNote: 'Speak to our sales team to discuss your goals and requirements',
    ctaLabel: 'Contact Us',
    isCustom: true,
  },
];

export const FAQ_ITEMS: FAQItem[] = [
  {
    id: 'switch-plans',
    question: 'Can I switch plans as my business grows?',
    answer:
      "Absolutely! You can upgrade or downgrade at any time. When upgrading, you'll get immediate access to new features. Downgrades take effect at the start of your next billing cycle.",
  },
  {
    id: 'payment-methods',
    question: 'What payment methods do you accept?',
    answer:
      "Credit cards only, managed exclusively through Stripe — providing secure, reliable billing with enterprise-grade payment infrastructure.",
  },
  {
    id: 'free-trial',
    question: 'Is there a free trial available?',
    answer:
      "If our software is already integrated, we offer a full 14-day free trial on Starter — no credit card required. Otherwise, we'll provide limited demo access.",
  },
  {
    id: 'annual-discount',
    question: 'Do you offer discounts for annual billing?',
    answer:
      "Yes! Annual subscriptions receive a 20% discount on Starter and AI packs — that's over two months free. Contact sales for custom Enterprise annual pricing.",
  },
];
