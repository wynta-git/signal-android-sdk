'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, ChevronRight, RefreshCw } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchHead, selectHead, selectHeadLoading } from '@/store/slices/headSlice'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardBody } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'

const SEED_IDS = [1, 2, 3]

function HeadCard({ id }: { id: number }) {
  const dispatch  = useAppDispatch()
  const data      = useAppSelector(selectHead(id))
  const isLoading = useAppSelector(selectHeadLoading(`fetch_${id}`))

  useEffect(() => { dispatch(fetchHead(id)) }, [id, dispatch])

  if (isLoading && !data) {
    return (
      <div className="h-20 flex items-center justify-center bg-white rounded-xl border border-gray-200">
        <Spinner className="h-5 w-5" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="h-20 flex items-center justify-center bg-white rounded-xl border border-gray-200 text-gray-400 text-sm">
        Head #{id} not found
      </div>
    )
  }

  return (
    <Link href={`/heads/${id}`}>
      <Card className="hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer">
        <CardBody className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">{data.name}</span>
              <Badge variant={data.active ? 'green' : 'red'}>{data.active ? 'Active' : 'Inactive'}</Badge>
            </div>
            {data.description && <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{data.description}</p>}
            <p className="text-xs text-gray-400 mt-1">Site {data.site_id} · Owner: {data.owner} · {data.subheads.length} subheads</p>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
        </CardBody>
      </Card>
    </Link>
  )
}

export default function HeadsPage() {
  const [extraIds, setExtraIds] = useState<number[]>([])
  const [input, setInput] = useState('')

  function addId() {
    const n = parseInt(input)
    if (!isNaN(n) && n > 0 && !SEED_IDS.includes(n) && !extraIds.includes(n)) setExtraIds(p => [...p, n])
    setInput('')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bonus Heads</h1>
          <p className="text-sm text-gray-500 mt-1">Top-level bonus campaign categories</p>
        </div>
        <Link href="/heads/new"><Button><Plus className="h-4 w-4" /> New Head</Button></Link>
      </div>
      <div className="space-y-3">
        {[...SEED_IDS, ...extraIds].map(id => <HeadCard key={id} id={id} />)}
      </div>
      <div className="flex items-center gap-2 pt-2">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addId()}
          placeholder="Load head by ID…"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <Button variant="secondary" size="sm" onClick={addId}><RefreshCw className="h-3.5 w-3.5" /> Load</Button>
      </div>
    </div>
  )
}
