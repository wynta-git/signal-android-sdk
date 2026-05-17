'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, ChevronRight, Search } from 'lucide-react'
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
      <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 'var(--rl)', border: '1px solid var(--g200)' }}>
        <Spinner size={18} />
      </div>
    )
  }
  if (!data) {
    return (
      <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 'var(--rl)', border: '1px solid var(--g200)', color: 'var(--g400)', fontSize: 13 }}>
        Head #{id} not found
      </div>
    )
  }

  return (
    <Link href={`/heads/${id}`} style={{ textDecoration: 'none' }}>
      <Card style={{ cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s' }}
        className="hover-card">
        <CardBody>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g900)' }}>{data.name}</span>
                <Badge variant={data.active ? 'green' : 'red'}>{data.active ? 'Active' : 'Inactive'}</Badge>
              </div>
              {data.description && (
                <p style={{ fontSize: 12.5, color: 'var(--g500)', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.description}</p>
              )}
              <p style={{ fontSize: 11.5, color: 'var(--g400)', margin: '5px 0 0' }}>
                Site {data.site_id} · Owner: {data.owner} · {data.subheads.length} subhead{data.subheads.length !== 1 ? 's' : ''}
              </p>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--g300)', flexShrink: 0 }} />
          </div>
        </CardBody>
      </Card>
    </Link>
  )
}

export default function HeadsPage() {
  const [extraIds, setExtraIds] = useState<number[]>([])
  const [input, setInput]       = useState('')

  function addId() {
    const n = parseInt(input)
    if (!isNaN(n) && n > 0 && !SEED_IDS.includes(n) && !extraIds.includes(n)) setExtraIds(p => [...p, n])
    setInput('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--g900)', margin: 0 }}>Bonus Heads</h1>
          <p style={{ fontSize: 13, color: 'var(--g400)', margin: '4px 0 0' }}>Top-level bonus campaign categories</p>
        </div>
        <Link href="/heads/new" style={{ textDecoration: 'none' }}>
          <Button><Plus size={14} /> New Head</Button>
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[...SEED_IDS, ...extraIds].map(id => <HeadCard key={id} id={id} />)}
      </div>

      {/* Load by ID */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--g400)', pointerEvents: 'none' }} />
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addId()}
            placeholder="Load head by ID…"
            style={{
              border: '1px solid var(--g200)', borderRadius: 'var(--r)', padding: '7px 11px 7px 30px',
              fontSize: 12.5, color: 'var(--g900)', background: '#fff', outline: 'none',
              width: 200, fontFamily: 'inherit',
            }}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={addId}>Load</Button>
      </div>
    </div>
  )
}
