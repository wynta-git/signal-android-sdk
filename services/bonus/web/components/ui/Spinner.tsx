import { Loader2 } from 'lucide-react'

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" style={{ color: 'var(--blue)' }} />
}

export function PageSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 192 }}>
      <Spinner size={28} />
    </div>
  )
}
