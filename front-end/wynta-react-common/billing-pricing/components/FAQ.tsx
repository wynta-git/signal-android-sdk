'use client';
import type { FAQItem } from '../types';

interface Props {
  items: FAQItem[];
}

export default function FAQ({ items }: Props) {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 20px' }}>
        Frequently Asked Questions
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
      }}>
        {items.map(item => (
          <div
            key={item.id}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: '20px 24px',
              background: '#fff',
            }}
          >
            <div style={{
              padding: '14px 18px',
              fontSize: 13.5,
              fontWeight: 600,
              color: '#1a2e3b',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              userSelect: 'none',
              gap: 10,
            }}>
              {item.question}
            </div>
            <div style={{ padding: '0 18px 14px', fontSize: 12.5, color: '#4d6b7b', lineHeight: 1.6 }}>
              {item.answer}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
