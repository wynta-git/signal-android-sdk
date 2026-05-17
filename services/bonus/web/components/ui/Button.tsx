'use client'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  loading?: boolean
}

const base: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontFamily: 'inherit', fontWeight: 500, fontSize: 12.5,
  borderRadius: 'var(--r)', border: '1px solid transparent',
  cursor: 'pointer', transition: 'background 0.12s, border-color 0.12s, color 0.12s',
  whiteSpace: 'nowrap', flexShrink: 0,
}

const variantStyles: Record<NonNullable<Props['variant']>, React.CSSProperties> = {
  primary:   { background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)' },
  secondary: { background: '#fff', color: 'var(--g600)', borderColor: 'var(--g200)' },
  danger:    { background: 'var(--err)', color: '#fff', borderColor: 'var(--err)' },
  ghost:     { background: 'transparent', color: 'var(--g500)', borderColor: 'transparent' },
}

const sizeStyles: Record<NonNullable<Props['size']>, React.CSSProperties> = {
  sm: { padding: '5px 11px', fontSize: 12 },
  md: { padding: '7px 14px' },
}

export function Button({ variant = 'primary', size = 'md', loading, children, className, style, ...rest }: Props) {
  return (
    <button
      style={{ ...base, ...variantStyles[variant], ...sizeStyles[size], opacity: (loading || rest.disabled) ? 0.55 : 1, ...style }}
      className={cn('btn', className)}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <Loader2 size={13} className="animate-spin" />}
      {children}
    </button>
  )
}
