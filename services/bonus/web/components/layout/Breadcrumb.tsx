import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

interface Crumb { label: string; href?: string }

export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1 text-sm text-gray-500">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
          {c.href ? (
            <Link href={c.href} className="hover:text-gray-900 transition-colors">{c.label}</Link>
          ) : (
            <span className="text-gray-900 font-medium">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
