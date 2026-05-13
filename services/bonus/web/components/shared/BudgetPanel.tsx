'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatDecimal } from '@/lib/utils'
import type { BudgetEntry, BudgetPeriod } from '@/lib/types'

const PERIODS: BudgetPeriod[] = ['DAILY', 'WEEKLY', 'MONTHLY']

interface Props {
  budget: BudgetEntry[]
  onSave: (limits: { period_type: BudgetPeriod; budget_limit: number | null }[], updated_by: string) => Promise<void>
}

interface FormData {
  daily: string; weekly: string; monthly: string
  updated_by: string
}

export function BudgetPanel({ budget, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  function entryFor(p: BudgetPeriod) { return budget.find(b => b.period_type === p) }

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    defaultValues: {
      daily:   entryFor('DAILY')?.limit ?? '',
      weekly:  entryFor('WEEKLY')?.limit ?? '',
      monthly: entryFor('MONTHLY')?.limit ?? '',
      updated_by: '',
    },
  })

  async function submit(data: FormData) {
    setSaving(true)
    const limits = PERIODS.map(p => ({
      period_type: p,
      budget_limit: data[p.toLowerCase() as 'daily' | 'weekly' | 'monthly']
        ? parseFloat(data[p.toLowerCase() as 'daily' | 'weekly' | 'monthly'] as string)
        : null,
    }))
    try {
      await onSave(limits, data.updated_by)
      toast.success('Budget limits updated')
      setEditing(false)
    } catch {
      toast.error('Failed to update limits')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <TrendingUp className="h-4 w-4" /> Budget Limits
          </div>
          <Button variant="secondary" size="sm" onClick={() => { reset(); setEditing(true) }}>Edit</Button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {PERIODS.map(p => {
            const e = entryFor(p)
            return (
              <div key={p} className="rounded-lg bg-gray-50 px-4 py-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{p}</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {e?.limit ? `₹${formatDecimal(e.limit)}` : '∞'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Used: ₹{formatDecimal(e?.used ?? '0')}</p>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <p className="text-sm text-gray-500">Leave blank for no cap (unlimited).</p>
      <div className="grid grid-cols-3 gap-3">
        <Input label="Daily limit (₹)" type="number" step="0.01" placeholder="unlimited" {...register('daily')} />
        <Input label="Weekly limit (₹)" type="number" step="0.01" placeholder="unlimited" {...register('weekly')} />
        <Input label="Monthly limit (₹)" type="number" step="0.01" placeholder="unlimited" {...register('monthly')} />
      </div>
      <Input label="Updated by" placeholder="your username" {...register('updated_by', { required: 'Required' })} error={errors.updated_by?.message} />
      <div className="flex gap-2 pt-1">
        <Button type="submit" loading={saving}>Save limits</Button>
        <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </form>
  )
}
