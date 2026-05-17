import { cn } from '@/lib/utils'

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid var(--g200)',
  borderRadius: 'var(--rl)',
  boxShadow: 'var(--sh)',
}

export function Card({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div style={{ ...cardStyle, ...style }} className={cn(className)}>{children}</div>
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      style={{ padding: '12px 16px', borderBottom: '1px solid var(--g150)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      className={cn(className)}
    >
      {children}
    </div>
  )
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div style={{ padding: '16px' }} className={cn(className)}>{children}</div>
}
