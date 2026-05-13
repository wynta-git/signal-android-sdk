'use client'
import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import toast from 'react-hot-toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { createConfigure, selectConfigureLoading } from '@/store/slices/configureSlice'
import { selectHead } from '@/store/slices/headSlice'
import { selectSubhead } from '@/store/slices/subheadSlice'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { toApiDatetime } from '@/lib/utils'
import type { BonusConfigureCreate } from '@/lib/types'

interface FD {
  name: string; description: string
  bonus_type: 'CHUNK' | 'INSTANT'; release_mode: 'CHUNK' | 'INSTANT'
  product: 'POKER' | 'CASINO' | 'RUMMY'
  wager_multiplier: number; no_of_chunks: number
  release_bucket: string
  chunk_expiry_days: string; bonus_expiry_days: string
  wager_chip_type: string; credit_chip_type: string
  bonus_amount_default: string; bonus_amount_max: string
  priority: number; active: boolean; created_by: string
}

export default function NewConfigurePage({ params }: { params: Promise<{ id: string; subheadId: string }> }) {
  const { id, subheadId } = use(params)
  const headId = parseInt(id); const subId = parseInt(subheadId)
  const router   = useRouter()
  const dispatch = useAppDispatch()

  const head      = useAppSelector(selectHead(headId))
  const sub       = useAppSelector(selectSubhead(subId))
  const isLoading = useAppSelector(selectConfigureLoading('create'))

  const [startDate, setStartDate] = useState<Date | null>(new Date())
  const [endDate,   setEndDate]   = useState<Date | null>(new Date(Date.now() + 365 * 86400000))

  const { register, handleSubmit, formState: { errors } } = useForm<FD>({
    defaultValues: {
      bonus_type: 'CHUNK', release_mode: 'CHUNK', product: 'POKER',
      wager_multiplier: 0, no_of_chunks: 1,
      wager_chip_type: 'CASH', credit_chip_type: 'CASH',
      priority: 0, active: true,
    },
  })

  async function onSubmit(data: FD) {
    if (!startDate || !endDate) { toast.error('Select start and end date'); return }
    const body: BonusConfigureCreate = {
      subhead_id: subId, site_id: sub?.site_id ?? 1,
      name: data.name, description: data.description || null,
      bonus_type: data.bonus_type, release_mode: data.release_mode, product: data.product,
      start_date: toApiDatetime(startDate)!, end_date: toApiDatetime(endDate)!,
      wager_multiplier: data.wager_multiplier, no_of_chunks: data.no_of_chunks,
      release_bucket: data.release_bucket || null,
      chunk_expiry_days: data.chunk_expiry_days ? parseInt(data.chunk_expiry_days) : null,
      bonus_expiry_days: data.bonus_expiry_days ? parseInt(data.bonus_expiry_days) : null,
      wager_chip_type: data.wager_chip_type, credit_chip_type: data.credit_chip_type,
      bonus_amount_default: data.bonus_amount_default ? parseFloat(data.bonus_amount_default) : null,
      bonus_amount_max: data.bonus_amount_max ? parseFloat(data.bonus_amount_max) : null,
      priority: data.priority, active: data.active, created_by: data.created_by,
    }
    try {
      const result = await dispatch(createConfigure(body)).unwrap()
      toast.success(`Configure "${result.name}" created`)
      router.push(`/heads/${headId}/subheads/${subId}/configures/${result.id}`)
    } catch (err) { toast.error(typeof err === 'string' ? err : 'Failed to create configure') }
  }

  return (
    <div className="space-y-6">
      <Breadcrumb crumbs={[
        { label: 'Heads', href: '/heads' },
        { label: head?.name ?? `Head #${headId}`, href: `/heads/${headId}` },
        { label: sub?.name ?? `Subhead #${subId}`, href: `/heads/${headId}/subheads/${subId}` },
        { label: 'New Configure' },
      ]} />
      <h1 className="text-2xl font-bold text-gray-900">New Bonus Configure</h1>
      <Card className="max-w-2xl">
        <CardHeader><p className="font-medium text-gray-800">Configure details</p></CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input label="Name" placeholder="e.g. 100% First Deposit up to ₹5000" {...register('name', { required: 'Required' })} error={errors.name?.message} />
            <Input label="Description" placeholder="Optional" {...register('description')} />

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
              <Input label="Wager Multiplier" type="number" step="0.01" {...register('wager_multiplier', { valueAsNumber: true, min: 0 })} />
              <Input label="No. of Chunks" type="number" {...register('no_of_chunks', { valueAsNumber: true, min: 1 })} />
              <Input label="Priority" type="number" {...register('priority', { valueAsNumber: true, min: 0 })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Release Bucket" placeholder="e.g. DEPOSIT_INSTANT" {...register('release_bucket')} />
              <Input label="Chunk Expiry Days" type="number" placeholder="optional" {...register('chunk_expiry_days')} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Wager Chip Type" placeholder="CASH" {...register('wager_chip_type')} />
              <Input label="Credit Chip Type" placeholder="CASH" {...register('credit_chip_type')} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Default Amount (₹)" type="number" step="0.01" placeholder="optional" {...register('bonus_amount_default')} />
              <Input label="Max Amount (₹)" type="number" step="0.01" placeholder="optional" {...register('bonus_amount_max')} />
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="active" {...register('active')} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
              <label htmlFor="active" className="text-sm text-gray-700">Active</label>
            </div>

            <Input label="Created by" placeholder="your username" {...register('created_by', { required: 'Required' })} error={errors.created_by?.message} />
            <Button type="submit" loading={isLoading}>Create Configure</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}
