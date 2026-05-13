'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Plus, ChevronRight } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  fetchHead, updateHead, upsertHeadOwners, upsertHeadLimits,
  selectHead, selectHeadLoading, selectHeadError,
} from '@/store/slices/headSlice'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { HeadForm } from '@/components/heads/HeadForm'
import { OwnersPanel } from '@/components/shared/OwnersPanel'
import { BudgetPanel } from '@/components/shared/BudgetPanel'
import { formatDate } from '@/lib/utils'
import type { BonusHeadUpdate, OwnerRole, BudgetPeriod } from '@/lib/types'

type Tab = 'subheads' | 'owners' | 'budget' | 'edit'

export default function HeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = use(params)
  const headId  = parseInt(id)
  const [tab, setTab] = useState<Tab>('subheads')
  const dispatch = useAppDispatch()

  const data     = useAppSelector(selectHead(headId))
  const fetching = useAppSelector(selectHeadLoading(`fetch_${headId}`))
  const updating = useAppSelector(selectHeadLoading(`update_${headId}`))
  const fetchErr = useAppSelector(selectHeadError(`fetch_${headId}`))

  useEffect(() => { dispatch(fetchHead(headId)) }, [headId, dispatch])

  if (fetching && !data) return <PageSpinner />
  if (fetchErr || !data)  return <div className="text-gray-500">{fetchErr ?? 'Head not found.'}</div>

  async function handleUpdate(body: BonusHeadUpdate) {
    try {
      await dispatch(updateHead({ id: headId, body })).unwrap()
      toast.success('Head updated')
      setTab('subheads')
    } catch (err) { toast.error(typeof err === 'string' ? err : 'Update failed') }
  }

  async function handleSaveOwners(owners: { username: string; role: OwnerRole; active: boolean }[], updated_by: string) {
    await dispatch(upsertHeadOwners({ id: headId, body: { owners, updated_by } })).unwrap()
  }

  async function handleSaveLimits(limits: { period_type: BudgetPeriod; budget_limit: number | null }[], updated_by: string) {
    await dispatch(upsertHeadLimits({ id: headId, body: { limits, updated_by } })).unwrap()
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'subheads', label: `Subheads (${data.subheads.length})` },
    { key: 'owners',   label: `Owners (${data.owners.length})` },
    { key: 'budget',   label: 'Budget' },
    { key: 'edit',     label: 'Edit' },
  ]

  return (
    <div className="space-y-6">
      <Breadcrumb crumbs={[{ label: 'Heads', href: '/heads' }, { label: data.name }]} />
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{data.name}</h1>
            <Badge variant={data.active ? 'green' : 'red'}>{data.active ? 'Active' : 'Inactive'}</Badge>
          </div>
          {data.description && <p className="text-gray-500 mt-1">{data.description}</p>}
          <p className="text-xs text-gray-400 mt-2">Site {data.site_id} · Owner: {data.owner} · Updated {formatDate(data.updated_at)}</p>
        </div>
      </div>

      <div className="border-b border-gray-200 flex">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'subheads' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Link href={`/heads/${headId}/subheads/new`}>
              <Button size="sm"><Plus className="h-3.5 w-3.5" /> New Subhead</Button>
            </Link>
          </div>
          {data.subheads.length === 0 && <p className="text-sm text-gray-400">No subheads yet.</p>}
          {data.subheads.map(s => (
            <Link key={s.id} href={`/heads/${headId}/subheads/${s.id}`}>
              <Card className="hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer">
                <CardBody className="flex items-center justify-between py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{s.name}</span>
                      <Badge variant={s.active ? 'green' : 'red'}>{s.active ? 'Active' : 'Inactive'}</Badge>
                    </div>
                    {s.description && <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">Owner: {s.owner}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {tab === 'owners' && (
        <Card><CardBody>
          <OwnersPanel owners={data.owners} onSave={handleSaveOwners} />
        </CardBody></Card>
      )}

      {tab === 'budget' && (
        <Card><CardBody>
          <BudgetPanel budget={data.budget} onSave={handleSaveLimits} />
        </CardBody></Card>
      )}

      {tab === 'edit' && (
        <Card className="max-w-xl">
          <CardHeader><p className="font-medium text-gray-800">Edit Head</p></CardHeader>
          <CardBody>
            <HeadForm
              mode="edit"
              defaultValues={{ name: data.name, description: data.description, owner: data.owner, active: data.active }}
              onSubmit={handleUpdate}
              loading={updating}
            />
          </CardBody>
        </Card>
      )}
    </div>
  )
}
