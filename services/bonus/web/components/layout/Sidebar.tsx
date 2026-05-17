'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Gift, Layers } from 'lucide-react'

const NAV = [
  { href: '/heads', label: 'Bonus Heads', icon: Layers },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside style={{
      position: 'fixed', left: 0, top: 0, height: '100%', width: 224,
      background: 'var(--g50)', borderRight: '1px solid var(--g200)',
      display: 'flex', flexDirection: 'column', zIndex: 40,
    }}>
      {/* Logo */}
      <div style={{ padding: '16px 14px 14px', borderBottom: '1px solid var(--g150)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 26, height: 26, background: 'var(--blue)', borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Gift size={14} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--g900)', lineHeight: 1.2 }}>Bonus Admin</div>
          <div style={{ fontSize: 10.5, color: 'var(--g400)', lineHeight: 1.2 }}>PAM Platform</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--g400)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '8px 6px 4px' }}>
          Management
        </div>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 8px', borderRadius: 6, fontSize: 12.5, fontWeight: 500,
                textDecoration: 'none', transition: 'background 0.12s, color 0.12s',
                background: active ? 'var(--bp)' : 'transparent',
                color: active ? 'var(--blue)' : 'var(--g600)',
              }}
            >
              <Icon size={15} style={{ flexShrink: 0 }} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '10px 14px 12px', borderTop: '1px solid var(--g150)' }}>
        <p style={{ fontSize: 11, color: 'var(--g400)', margin: 0, wordBreak: 'break-all' }}>
          {process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}
        </p>
      </div>
    </aside>
  )
}
