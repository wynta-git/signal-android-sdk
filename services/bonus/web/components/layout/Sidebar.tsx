'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/heads', label: 'Bonus Heads', icon: LayoutDashboard },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="fixed left-0 top-0 h-full w-56 bg-gray-900 flex flex-col z-40">
      <div className="px-4 py-5 border-b border-gray-700">
        <span className="text-white font-bold text-lg tracking-tight">Bonus Admin</span>
        <p className="text-gray-400 text-xs mt-0.5">PAM Platform</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                active ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white',
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
              {active && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" />}
            </Link>
          )
        })}
      </nav>
      <div className="px-4 py-3 border-t border-gray-700">
        <p className="text-gray-500 text-xs">API: {process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}</p>
      </div>
    </aside>
  )
}
