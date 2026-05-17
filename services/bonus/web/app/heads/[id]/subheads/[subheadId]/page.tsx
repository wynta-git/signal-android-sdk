'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Plus, ChevronRight, Calendar, Zap } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  fetchSubhead, updateSubhead, upsertSubheadOwners, upsertSubheadLimits,
  selectSubhead, selectSubheadLoading, selectSubheadError,
} from '@/store/slices/subheadSlice'
import { selectHead } from '@/store/slices/headSlice'
import {
  fetchConfiguresBySubhead,
  selectConfiguresBySubhead,
  selectConfigureLoading,
  selectConfigureError,
} from '@/store/slices/configureSlice'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import { OwnersPanel } from '@/components/shared/OwnersPanel'
import { BudgetPanel } from '@/components/shared/BudgetPanel'
import { formatDate, formatDecimal } from '@/lib/utils'
import type { BonusSubheadUpdate, OwnerRole, BudgetPeriod } from '@/lib/types'

type Tab = 'configures' | 'owners' | 'budget' | 'edit'

interface EditFD { name: string; description: string; owner: string; active: boolean; updated_by: string }

export default function SubheadDetailPage({ params }: { params: Promise<{ id: string; subheadId: string }> }) {
  const { id, subheadId } = use(params)
  const headId = parseInt(id)
  const subId  = parseInt(subheadId)
  const [tab, setTab] = useState<Tab>('configures')
  const dispatch = useAppDispatch()

  const head     = useAppSelector(selectHead(headId))
  const data     = useAppSelector(selectSubhead(subId))
  const fetching = useAppSelector(selectSubheadLoading(`fetch_${subId}`))
  const fetchErr = useAppSelector(selectSubheadError(`fetch_${subId}`))
  const updating = useAppSelector(selectSubheadLoading(`update_${subId}`))

  useEffect(() => { dispatch(fetchSubhead(subId)) }, [subId, dispatch])

  const { register, handleSubmit, formState: { errors } } = useForm<EditFD>({
    values: data ? { name: data.name, description: data.description ?? '', owner: data.owner, active: data.active, updated_by: '' } : undefined,
  })

  if (fetching && !data) return <PageSpinner />
  if (fetchErr || !data) return <div className="text-gray-500">{fetchErr ?? 'Subhead not found.'}</div>

  async function handleUpdate(fd: EditFD) {
    const body: BonusSubheadUpdate = {
      name: fd.name, description: fd.description || null,
      active: fd.active, owner: fd.owner, updated_by: fd.updated_by,
    }
    try {
      await dispatch(updateSubhead({ id: subId, body })).unwrap()
      toast.success('Updated')
      setTab('configures')
    } catch (err) { toast.error(typeof err === 'string' ? err : 'Update failed') }
  }

  async function handleSaveOwners(owners: { username: string; role: OwnerRole; active: boolean }[], updated_by: string) {
    await dispatch(upsertSubheadOwners({ id: subId, body: { owners, updated_by } })).unwrap()
  }

  async function handleSaveLimits(limits: { period_type: BudgetPeriod; budget_limit: number | null }[], updated_by: string) {
    await dispatch(upsertSubheadLimits({ id: subId, body: { limits, updated_by } })).unwrap()
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'configures', label: 'Configures' },
    { key: 'owners',     label: `Owners (${data.owners.length})` },
    { key: 'budget',     label: 'Budget' },
    { key: 'edit',       label: 'Edit' },
  ]

  return (
    <div className="space-y-6">
      <Breadcrumb crumbs={[
        { label: 'Heads', href: '/heads' },
        { label: head?.name ?? `Head #${headId}`, href: `/heads/${headId}` },
        { label: data.name },
      ]} />
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

      {tab === 'configures' && (
        <ConfiguresTab headId={headId} subheadId={subId} />
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
          <CardHeader><p className="font-medium text-gray-800">Edit Subhead</p></CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit(handleUpdate)} className="space-y-4">
              <Input label="Name" {...register('name', { required: 'Required' })} error={errors.name?.message} />
              <Input label="Description" {...register('description')} />
              <Input label="Owner" {...register('owner', { required: 'Required' })} error={errors.owner?.message} />
              <div className="flex items-center gap-2">
                <input type="checkbox" id="active" {...register('active')} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
                <label htmlFor="active" className="text-sm text-gray-700">Active</label>
              </div>
              <Input label="Updated by" placeholder="your username" {...register('updated_by', { required: 'Required' })} error={errors.updated_by?.message} />
              <Button type="submit" loading={updating}>Save Changes</Button>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function ConfiguresTab({ headId, subheadId }: { headId: number; subheadId: number }) {
  const dispatch    = useAppDispatch()
  const configures  = useAppSelector(selectConfiguresBySubhead(subheadId))
  const loading     = useAppSelector(selectConfigureLoading(`list_${subheadId}`))
  const error       = useAppSelector(selectConfigureError(`list_${subheadId}`))

  useEffect(() => { dispatch(fetchConfiguresBySubhead(subheadId)) }, [subheadId, dispatch])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--g400)' }}>
          {loading ? 'Loading…' : `${configures.length} configure${configures.length !== 1 ? 's' : ''}`}
        </span>
        <Link href={`/heads/${headId}/subheads/${subheadId}/configures/new`} style={{ textDecoration: 'none' }}>
          <Button size="sm"><Plus size={13} /> New Configure</Button>
        </Link>
      </div>

      {error && (
        <div style={{ fontSize: 12.5, color: 'var(--err)', padding: '10px 14px', background: '#fee2e2', borderRadius: 'var(--r)' }}>{error}</div>
      )}

      {!loading && configures.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--g400)', fontSize: 13 }}>
          No configures yet. Create one to define bonus mechanics for this subhead.
        </div>
      )}

      {configures.map(cfg => (
        <Link key={cfg.id} href={`/heads/${headId}/subheads/${subheadId}/configures/${cfg.id}`} style={{ textDecoration: 'none' }}>
          <Card style={{ cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s' }}>
            <CardBody>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 36, height: 36, background: 'var(--bp)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Zap size={16} style={{ color: 'var(--blue)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g900)' }}>{cfg.name}</span>
                    <Badge variant={cfg.active ? 'green' : 'red'}>{cfg.active ? 'Active' : 'Inactive'}</Badge>
                    <Badge variant="blue">{cfg.applicability_frequency}</Badge>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11.5, color: 'var(--g400)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={11} /> {formatDate(cfg.start_date)} → {formatDate(cfg.end_date)}
                    </span>
                    {cfg.bonus_amount_fixed && (
                      <span style={{ fontSize: 11.5, color: 'var(--g500)' }}>Fixed ₹{formatDecimal(cfg.bonus_amount_fixed)}</span>
                    )}
                    {cfg.bonus_amount_percent && (
                      <span style={{ fontSize: 11.5, color: 'var(--g500)' }}>{cfg.bonus_amount_percent}%</span>
                    )}
                    {cfg.bonus_amount_max && (
                      <span style={{ fontSize: 11.5, color: 'var(--g500)' }}>Max ₹{formatDecimal(cfg.bonus_amount_max)}</span>
                    )}
                    <span style={{ fontSize: 11.5, color: 'var(--g400)' }}>Priority {cfg.priority}</span>
                  </div>
                </div>
                <ChevronRight size={15} style={{ color: 'var(--g300)', flexShrink: 0 }} />
              </div>
            </CardBody>
          </Card>
        </Link>
      ))}
    </div>
  )
}
