interface Props {
  children: React.ReactNode
  variant?: 'green' | 'red' | 'blue' | 'yellow' | 'gray'
  className?: string
}

const variants: Record<NonNullable<Props['variant']>, React.CSSProperties> = {
  green:  { background: '#d1fae5', color: '#065f46' },
  red:    { background: '#fee2e2', color: '#991b1b' },
  blue:   { background: 'var(--bp)', color: '#0369a1' },
  yellow: { background: '#fef3c7', color: '#92400e' },
  gray:   { background: 'var(--g100)', color: 'var(--g600)' },
}

const base: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center',
  borderRadius: 20, padding: '2px 8px',
  fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
}

export function Badge({ children, variant = 'gray', className }: Props) {
  return (
    <span style={{ ...base, ...variants[variant] }} className={className}>
      {children}
    </span>
  )
}
