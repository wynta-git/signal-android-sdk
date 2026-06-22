'use client';
import { useState, useEffect, useRef } from 'react';
import Icon from '../../components/Icon';
import { DEFAULT_PRODUCTS } from '../constants';
import type { Product } from '../types';

const API_BASE = process.env.NEXT_PUBLIC_WYNTA_API_URL ?? '';
const AUTH_HEADERS: Record<string, string> = process.env.NEXT_PUBLIC_WYNTA_API_TOKEN
  ? { Authorization: process.env.NEXT_PUBLIC_WYNTA_API_TOKEN }
  : {};

const DOCS_URLS: Record<string, string> = {
  crm:            'https://docs.wynta.com/',
  gamification:   'https://docs.wynta.com/',
  'bonus-engine': 'https://docs.wynta.com/',
};

const PRODUCT_ICONS: Record<string, string> = {
  'affiliate-platform': 'bar-chart-2',
  crm:                  'users',
  gamification:         'trophy',
  'bonus-engine':       'gift',
  'web-analytics':      'bar-chart-2',
  'ab-testing':         'git-branch',
  'ai-insights':        'sparkles',
};

const ICON_COLORS: Record<string, string> = {
  'affiliate-platform': '#374151',
  crm:                  '#7c3aed',
  gamification:         '#16a34a',
  'bonus-engine':       '#d97706',
};

const ICON_BGS: Record<string, string> = {
  'affiliate-platform': '#f3f4f6',
  crm:                  '#ede9fe',
  gamification:         '#dcfce7',
  'bonus-engine':       '#fef3c7',
};

interface ProductApiData {
  pack:          string;
  active_brands: number;
  billing_cycle: string;
  program_price: string;
  next_invoice:  string;
}

export default function ProductSettings() {
  const [products]   = useState<Product[]>(DEFAULT_PRODUCTS);
  const [apiData, setApiData] = useState<ProductApiData | null>(null);
  const fetchedRef   = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch(`${API_BASE}/api/v1/workspace/settings/products/`, { headers: AUTH_HEADERS })
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => { setApiData(data?.data ?? null); })
      .catch(() => {});
  }, []);

  const active   = products.filter(p => p.enabled);
  const inactive = products.filter(p => !p.enabled).slice(0, 3);

  const billingCycle = apiData?.billing_cycle ?? '';
  const nextInvoice  = apiData?.next_invoice  ?? '';

  const rowBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
  };

  return (
    <div style={{ paddingTop: 24 }}>
      {/* YOUR PRODUCTS */}
      {active.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.2, marginBottom: 10 }}>
            YOUR PRODUCTS
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
            {active.map((product, i) => (
              <div
                key={product.id}
                style={{
                  ...rowBase,
                  borderLeft: '3px solid #2563eb',
                  borderBottom: i < active.length - 1 ? '1px solid #f3f4f6' : 'none',
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 6, flexShrink: 0,
                  background: ICON_BGS[product.id] ?? '#f3f4f6',
                  border: '1px solid #e5e7eb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={PRODUCT_ICONS[product.id] ?? 'box'} size={18} strokeWidth={1.7} color={ICON_COLORS[product.id] ?? '#374151'} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{product.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#2563eb', fontWeight: 500 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2563eb', display: 'inline-block', flexShrink: 0 }} />
                      {billingCycle} Subscription
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 1.5 }}>
                    {product.description}
                    {nextInvoice && (
                      <>
                        <span style={{ margin: '0 6px', color: '#d1d5db' }}>·</span>
                        Renews {nextInvoice}
                      </>
                    )}
                  </div>
                </div>
                <a
                  href="/admin/settings/"
                  style={{
                    padding: '5px 14px', border: '1px solid #d1d5db', borderRadius: 4,
                    background: '#fff', fontSize: 12, color: '#374151',
                    cursor: 'pointer', fontWeight: 500, flexShrink: 0,
                    textDecoration: 'none', display: 'inline-block',
                  }}
                >
                  Settings
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DISCOVER MORE PRODUCTS */}
      {inactive.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.2, marginBottom: 6 }}>
            DISCOVER MORE PRODUCTS
          </div>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 14px', lineHeight: 1.6 }}>
            Extend your Wynta suite with tools built for the iGaming industry. Each product integrates seamlessly with your Affiliate Platform.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {inactive.map(product => (
              <div
                key={product.id}
                style={{ ...rowBase, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff' }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 6, flexShrink: 0,
                  background: ICON_BGS[product.id] ?? '#f9fafb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={PRODUCT_ICONS[product.id] ?? 'box'} size={18} strokeWidth={1.7} color={ICON_COLORS[product.id] ?? '#9ca3af'} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{product.name}</span>
                    {product.category && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        color: product.categoryColor ?? '#374151',
                        background: product.categoryBg ?? '#f3f4f6',
                      }}>
                        {product.category}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 1.5 }}>{product.description}</div>
                </div>
                {DOCS_URLS[product.id] ? (
                  <a
                    href={DOCS_URLS[product.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: '#2563eb', fontWeight: 500, textDecoration: 'none', flexShrink: 0 }}
                  >
                    Learn more
                  </a>
                ) : (
                  <a href="#" style={{ fontSize: 12, color: '#2563eb', fontWeight: 500, textDecoration: 'none', flexShrink: 0 }}>
                    Learn more
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
