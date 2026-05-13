import { cn } from '@/lib/utils'

interface Props {
  children: React.ReactNode
  variant?: 'green' | 'red' | 'blue' | 'yellow' | 'gray'
  className?: string
}

const variants = {
  green:  'bg-green-100 text-green-800',
  red:    'bg-red-100 text-red-800',
  blue:   'bg-blue-100 text-blue-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  gray:   'bg-gray-100 text-gray-700',
}

export function Badge({ children, variant = 'gray', className }: Props) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', variants[variant], className)}>
      {children}
    </span>
  )
}
