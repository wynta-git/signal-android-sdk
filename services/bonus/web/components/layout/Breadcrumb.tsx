import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

interface Crumb { label: string; href?: string }

export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--g400)' }}>
      {crumbs.map((c, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {i > 0 && <ChevronRight size={12} style={{ color: 'var(--g300)', flexShrink: 0 }} />}
          {c.href ? (
            <Link href={c.href} style={{ color: 'var(--g400)', textDecoration: 'none', transition: 'color 0.12s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--g700)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--g400)')}
            >{c.label}</Link>
          ) : (
            <span style={{ color: 'var(--g700)', fontWeight: 500 }}>{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
