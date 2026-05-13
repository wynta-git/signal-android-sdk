'use client'
import { use, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import toast from 'react-hot-toast'
import { Tag } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  fetchConfigure, updateConfigure,
  selectConfigure, selectConfigureLoading, selectConfigureError,
} from '@/store/slices/configureSlice'
import { selectHead } from '@/store/slices/headSlice'
import { selectSubhead } from '@/store/slices/subheadSlice'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import { formatDate, formatDecimal, fromApiDatetime, toApiDatetime } from '@/lib/utils'
import type { BonusConfigureUpdate } from '@/lib/types'

type Tab = 'details' | 'codes' | 'edit'

interface EditFD {
  name: string; description: string
  bonus_type: 'CHUNK' | 'INSTANT'; release_mode: 'CHUNK' | 'INSTANT'; product: 'POKER' | 'CASINO' | 'RUMMY'
  wager_multiplier: number; no_of_chunks: number; release_bucket: string
  chunk_expiry_days: string; bonus_expiry_days: string
  wager_chip_type: string; credit_chip_type: string
  bonus_amount_default: string; bonus_amount_max: string
  priority: number; active: boolean; updated_by: string
}

export default function ConfigureDetailPage({ params }: { params: Promise<{ id: string; subheadId: string; configureId: string }> }) {
  const { id, subheadId, configureId } = use(params)
  const headId = parseInt(id); const subId = parseInt(subheadId); const cfgId = parseInt(configureId)
  const [tab, setTab] = useState<Tab>('details')
  const dispatch = useAppDispatch()

  const head     = useAppSelector(selectHead(headId))
  const sub      = useAppSelector(selectSubhead(subId))
  const data     = useAppSelector(selectConfigure(cfgId))
  const fetching = useAppSelector(selectConfigureLoading(`fetch_${cfgId}`))
  const fetchErr = useAppSelector(selectConfigureError(`fetch_${cfgId}`))
  const updating = useAppSelector(selectConfigureLoading(`update_${cfgId}`))

  const [startDate, setStartDate] = useState<Date | null>(null)
  const [endDate,   setEndDate]   = useState<Date | null>(null)

  const { register, handleSubmit, formState: { errors }, reset } = useForm<EditFD>()

  useEffect(() => { dispatch(fetchConfigure(cfgId)) }, [cfgId, dispatch])

  if (fetching && !data) return <PageSpinner />
  if (fetchErr || !data) return <div className="text-gray-500">{fetchErr ?? 'Configure not found.'}</div>

  function openEdit() {
    setStartDate(fromApiDatetime(data!.start_date))
    setEndDate(fromApiDatetime(data!.end_date))
    reset({
      name: data!.name, description: data!.description ?? '',
      bonus_type: data!.bonus_type, release_mode: data!.release_mode, product: data!.product,
      wager_multiplier: parseFloat(data!.wager_multiplier),
      no_of_chunks: data!.no_of_chunks,
      release_bucket: data!.release_bucket ?? '',
      chunk_expiry_days: data!.chunk_expiry_days?.toString() ?? '',
      bonus_expiry_days: data!.bonus_expiry_days?.toString() ?? '',
      wager_chip_type: data!.wager_chip_type, credit_chip_type: data!.credit_chip_type,
      bonus_amount_default: data!.bonus_amount_default ?? '',
      bonus_amount_max: data!.bonus_amount_max ?? '',
      priority: data!.priority, active: data!.active, updated_by: '',
    })
    setTab('edit')
  }

  async function handleUpdate(fd: EditFD) {
    const body: BonusConfigureUpdate = {
      name: fd.name, description: fd.description || null,
      bonus_type: fd.bonus_type, release_mode: fd.release_mode, product: fd.product,
      start_date: toApiDatetime(startDate), end_date: toApiDatetime(endDate),
      wager_multiplier: fd.wager_multiplier, no_of_chunks: fd.no_of_chunks,
      release_bucket: fd.release_bucket || null,
      chunk_expiry_days: fd.chunk_expiry_days ? parseInt(fd.chunk_expiry_days) : null,
      bonus_expiry_days: fd.bonus_expiry_days ? parseInt(fd.bonus_expiry_days) : null,
      wager_chip_type: fd.wager_chip_type, credit_chip_type: fd.credit_chip_type,
      bonus_amount_default: fd.bonus_amount_default ? parseFloat(fd.bonus_amount_default) : null,
      bonus_amount_max: fd.bonus_amount_max ? parseFloat(fd.bonus_amount_max) : null,
      priority: fd.priority, active: fd.active, updated_by: fd.updated_by,
    }
    try {
      await dispatch(updateConfigure({ id: cfgId, body })).unwrap()
      toast.success('Updated')
      setTab('details')
    } catch (err) { toast.error(typeof err === 'string' ? err : 'Update failed') }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'codes',   label: `Promo Codes (${data.codes.length})` },
    { key: 'edit',    label: 'Edit' },
  ]

  return (
    <div className="space-y-6">
      <Breadcrumb crumbs={[
        { label: 'Heads', href: '/heads' },
        { label: head?.name ?? `Head #${headId}`, href: `/heads/${headId}` },
        { label: sub?.name ?? `Subhead #${subId}`, href: `/heads/${headId}/subheads/${subId}` },
        { label: data.name },
      ]} />
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{data.name}</h1>
            <Badge variant={data.active ? 'green' : 'red'}>{data.active ? 'Active' : 'Inactive'}</Badge>
            <Badge variant="blue">{data.bonus_type}</Badge>
            <Badge variant="yellow">{data.product}</Badge>
          </div>
          {data.description && <p className="text-gray-500 mt-1">{data.description}</p>}
          <p className="text-xs text-gray-400 mt-2">
            {formatDate(data.start_date)} → {formatDate(data.end_date)} · Priority {data.priority}
          </p>
        </div>
        {tab !== 'edit' && <Button variant="secondary" size="sm" onClick={openEdit}>Edit</Button>}
      </div>

      <div className="border-b border-gray-200 flex">
        {tabs.map(t => (
          <button key={t.key} onClick={() => t.key === 'edit' ? openEdit() : setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <div className="grid grid-cols-2 gap-4">
          {[
            ['Bonus Type', data.bonus_type], ['Release Mode', data.release_mode],
            ['Wager Multiplier', data.wager_multiplier], ['No. of Chunks', data.no_of_chunks],
            ['Release Bucket', data.release_bucket ?? '—'], ['Wager Chip', data.wager_chip_type],
            ['Credit Chip', data.credit_chip_type], ['Priority', data.priority],
            ['Default Amount', data.bonus_amount_default ? `₹${formatDecimal(data.bonus_amount_default)}` : '—'],
            ['Max Amount', data.bonus_amount_max ? `₹${formatDecimal(data.bonus_amount_max)}` : '—'],
            ['Chunk Expiry', data.chunk_expiry_days ? `${data.chunk_expiry_days} days` : '—'],
            ['Bonus Expiry', data.bonus_expiry_days ? `${data.bonus_expiry_days} days` : '—'],
            ['Created by', data.created_by], ['Updated by', data.updated_by],
            ['Created at', formatDate(data.created_at)], ['Updated at', formatDate(data.updated_at)],
          ].map(([k, v]) => (
            <div key={k} className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{k}</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{String(v)}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'codes' && (
        <div className="space-y-3">
          {data.codes.length === 0 && <p className="text-sm text-gray-400">No promo codes.</p>}
          {data.codes.map(c => (
            <Card key={c.id}>
              <CardBody className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Tag className="h-4 w-4 text-indigo-500" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-gray-900">{c.code}</span>
                      <Badge variant={c.active ? 'green' : 'red'}>{c.active ? 'Active' : 'Inactive'}</Badge>
                      {c.auto_apply && <Badge variant="blue">Auto-apply</Badge>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {c.max_amount ? `Max ₹${formatDecimal(c.max_amount)}` : 'No cap'} ·{' '}
                      {c.valid_from ? formatDate(c.valid_from) : 'Any time'} → {c.valid_to ? formatDate(c.valid_to) : 'No expiry'}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-gray-400">Order {c.display_order}</span>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'edit' && (
        <Card className="max-w-2xl">
          <CardHeader><p className="font-medium text-gray-800">Edit Configure</p></CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit(handleUpdate)} className="space-y-5">
              <Input label="Name" {...register('name', { required: 'Required' })} error={errors.name?.message} />
              <Input label="Description" {...register('description')} />
              <div className="grid grid-cols-3 gap-3">
                <Select label="Bonus Type" {...register('bonus_type')}>
                  <option value="CHUNK">CHUNK</option><option value="INSTANT">INSTANT</option>
                </Select>
                <Select label="Release Mode" {...register('release_mode')}>
                  <option value="CHUNK">CHUNK</option><option value="INSTANT">INSTANT</option>
                </Select>
                <Select label="Product" {...register('product')}>
                  <option value="POKER">POKER</option><option value="CASINO">CASINO</option><option value="RUMMY">RUMMY</option>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Start Date (UTC)</label>
                  <DatePicker selected={startDate} onChange={setStartDate} showTimeSelect dateFormat="yyyy-MM-dd HH:mm" className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">End Date (UTC)</label>
                  <DatePicker selected={endDate} onChange={setEndDate} showTimeSelect dateFormat="yyyy-MM-dd HH:mm" className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Wager Multiplier" type="number" step="0.01" {...register('wager_multiplier', { valueAsNumber: true })} />
                <Input label="No. of Chunks" type="number" {...register('no_of_chunks', { valueAsNumber: true })} />
                <Input label="Priority" type="number" {...register('priority', { valueAsNumber: true })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Release Bucket" {...register('release_bucket')} />
                <Input label="Chunk Expiry Days" type="number" {...register('chunk_expiry_days')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Wager Chip Type" {...register('wager_chip_type')} />
                <Input label="Credit Chip Type" {...register('credit_chip_type')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Default Amount (₹)" type="number" step="0.01" {...register('bonus_amount_default')} />
                <Input label="Max Amount (₹)" type="number" step="0.01" {...register('bonus_amount_max')} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="active-edit" {...register('active')} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
                <label htmlFor="active-edit" className="text-sm text-gray-700">Active</label>
              </div>
              <Input label="Updated by" placeholder="your username" {...register('updated_by', { required: 'Required' })} error={errors.updated_by?.message} />
              <div className="flex gap-2">
                <Button type="submit" loading={updating}>Save Changes</Button>
                <Button type="button" variant="secondary" onClick={() => setTab('details')}>Cancel</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
