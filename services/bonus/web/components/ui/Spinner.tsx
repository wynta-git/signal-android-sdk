import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin text-indigo-600', className)} />
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <Spinner className="h-8 w-8" />
    </div>
  )
}
