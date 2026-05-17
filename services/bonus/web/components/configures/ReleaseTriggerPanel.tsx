'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Plus, Pencil, Check, X, Zap } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  createReleaseTrigger, updateReleaseTrigger,
  selectReleaseTriggerLoading, selectReleaseTriggerError,
} from '@/store/slices/releaseTriggerSlice'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { formatDecimal } from '@/lib/utils'
import type {
  BonusReleaseTriggerResponse, BonusReleaseTriggerCreate, BonusReleaseTriggerUpdate,
  TriggerType, BonusCodeSummary,
} from '@/lib/types'

interface Props {
  siteId: number
  triggers: BonusReleaseTriggerResponse[]
  codes: BonusCodeSummary[]
  createdBy?: string
}

interface AddFD {
  code: string
  trigger_type: TriggerType
  description: string
  min_trigger_amount: string
  max_trigger_amount: string
  payment_method: string
  product: string
  occurrence: number
  active: boolean
  created_by: string
}

interface EditFD {
  trigger_type: TriggerType
  description: string
  min_trigger_amount: string
  max_trigger_amount: string
  payment_method: string
  product: string
  occurrence: number
  active: boolean
  updated_by: string
}

const triggerColors: Record<TriggerType, 'blue' | 'green' | 'gray' | 'yellow' | 'red'> = {
  DEPOSIT: 'green', REGISTRATION: 'blue', MANUAL: 'gray',
  REFERRAL: 'yellow', PROMO_CODE: 'blue', MILESTONE: 'red',
}

export function ReleaseTriggerPanel({ siteId, triggers, codes, createdBy = '' }: Props) {
  const dispatch = useAppDispatch()
  const creating = useAppSelector(selectReleaseTriggerLoading('create'))
  const createErr = useAppSelector(selectReleaseTriggerError('create'))
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const addForm = useForm<AddFD>({
    defaultValues: {
      trigger_type: 'DEPOSIT', occurrence: 1, active: true, created_by: createdBy,
      code: codes[0]?.code ?? '',
    },
  })
  const editForm = useForm<EditFD>()

  async function handleAdd(fd: AddFD) {
    const body: BonusReleaseTriggerCreate = {
      site_id: siteId, code: fd.code, trigger_type: fd.trigger_type,
      description: fd.description || null,
      min_trigger_amount: fd.min_trigger_amount ? parseFloat(fd.min_trigger_amount) : null,
      max_trigger_amount: fd.max_trigger_amount ? parseFloat(fd.max_trigger_amount) : null,
      payment_method: fd.payment_method || null,
      product: fd.product || null,
      occurrence: fd.occurrence, active: fd.active, created_by: fd.created_by,
    }
    try {
      await dispatch(createReleaseTrigger(body)).unwrap()
      toast.success('Trigger added')
      addForm.reset({ trigger_type: 'DEPOSIT', occurrence: 1, active: true, created_by: fd.created_by, code: fd.code })
      setShowAdd(false)
    } catch (e) { toast.error(typeof e === 'string' ? e : 'Failed') }
  }

  function startEdit(tr: BonusReleaseTriggerResponse) {
    editForm.reset({
      trigger_type: tr.trigger_type,
      description: tr.description ?? '',
      min_trigger_amount: tr.min_trigger_amount ?? '',
      max_trigger_amount: tr.max_trigger_amount ?? '',
      payment_method: tr.payment_method ?? '',
      product: tr.product ?? '',
      occurrence: tr.occurrence,
      active: tr.active, updated_by: '',
    })
    setEditingId(tr.id)
  }

  async function handleEdit(fd: EditFD, id: number) {
    const body: BonusReleaseTriggerUpdate = {
      trigger_type: fd.trigger_type,
      description: fd.description || null,
      min_trigger_amount: fd.min_trigger_amount ? parseFloat(fd.min_trigger_amount) : null,
      max_trigger_amount: fd.max_trigger_amount ? parseFloat(fd.max_trigger_amount) : null,
      payment_method: fd.payment_method || null,
      product: fd.product || null,
      occurrence: fd.occurrence,
      active: fd.active, updated_by: fd.updated_by,
    }
    try {
      await dispatch(updateReleaseTrigger({ id, body })).unwrap()
      toast.success('Updated')
      setEditingId(null)
    } catch (e) { toast.error(typeof e === 'string' ? e : 'Failed') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--g700)' }}>Release Triggers</div>
          <div style={{ fontSize: 12, color: 'var(--g400)', marginTop: 2 }}>Events that release this bonus to players.</div>
        </div>
        {!showAdd && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={13} /> Add Trigger
          </Button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: 'var(--bp)', border: '1px solid var(--bm)', borderRadius: 'var(--rl)', padding: 16 }}>
          <form onSubmit={addForm.handleSubmit(handleAdd)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <Select label="Trigger Type" {...addForm.register('trigger_type')}>
                <option value="DEPOSIT">DEPOSIT</option>
                <option value="REGISTRATION">REGISTRATION</option>
                <option value="MANUAL">MANUAL</option>
                <option value="REFERRAL">REFERRAL</option>
                <option value="PROMO_CODE">PROMO_CODE</option>
                <option value="MILESTONE">MILESTONE</option>
              </Select>
              <Select label="Promo Code" {...addForm.register('code', { required: 'Required' })}>
                {codes.map(c => <option key={c.id} value={c.code}>{c.code}</option>)}
              </Select>
              <Input label="Occurrence (0=every, 1=first, N=Nth)" type="number" min={0} {...addForm.register('occurrence', { valueAsNumber: true })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              <Input label="Min Amount (₹)" type="number" step="0.01" placeholder="optional" {...addForm.register('min_trigger_amount')} />
              <Input label="Max Amount (₹)" type="number" step="0.01" placeholder="optional" {...addForm.register('max_trigger_amount')} />
              <Input label="Payment Method" placeholder="e.g. UPI" {...addForm.register('payment_method')} />
              <Input label="Product" placeholder="e.g. CASINO" {...addForm.register('product')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 10 }}>
              <Input label="Description (optional)" placeholder="What triggers this bonus" {...addForm.register('description')} />
              <Input label="Created by" placeholder="username" {...addForm.register('created_by', { required: 'Required' })} error={addForm.formState.errors.created_by?.message} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" {...addForm.register('active')} />
                Active
              </label>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button type="submit" size="sm" loading={creating}>Add Trigger</Button>
              </div>
            </div>
            {createErr && <p style={{ fontSize: 12, color: 'var(--err)', margin: 0 }}>{createErr}</p>}
          </form>
        </div>
      )}

      {/* List */}
      {triggers.length === 0 && !showAdd && (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--g400)', fontSize: 13 }}>
          No triggers yet. Add one to define when this bonus is released.
        </div>
      )}

      {triggers.map(tr => (
        <div key={tr.id} style={{ background: '#fff', border: '1px solid var(--g200)', borderRadius: 'var(--rl)', padding: '12px 16px' }}>
          {editingId === tr.id ? (
            <form onSubmit={editForm.handleSubmit(fd => handleEdit(fd, tr.id))} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <Select label="Trigger Type" {...editForm.register('trigger_type')}>
                  <option value="DEPOSIT">DEPOSIT</option>
                  <option value="REGISTRATION">REGISTRATION</option>
                  <option value="MANUAL">MANUAL</option>
                  <option value="REFERRAL">REFERRAL</option>
                  <option value="PROMO_CODE">PROMO_CODE</option>
                  <option value="MILESTONE">MILESTONE</option>
                </Select>
                <Input label="Occurrence" type="number" min={0} {...editForm.register('occurrence', { valueAsNumber: true })} />
                <Input label="Updated by" {...editForm.register('updated_by', { required: 'Required' })} error={editForm.formState.errors.updated_by?.message} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                <Input label="Min Amount" type="number" step="0.01" {...editForm.register('min_trigger_amount')} />
                <Input label="Max Amount" type="number" step="0.01" {...editForm.register('max_trigger_amount')} />
                <Input label="Payment Method" {...editForm.register('payment_method')} />
                <Input label="Product" {...editForm.register('product')} />
              </div>
              <Input label="Description" {...editForm.register('description')} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" {...editForm.register('active')} />
                  Active
                </label>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                    <X size={13} /> Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={useAppSelector(selectReleaseTriggerLoading(`update_${tr.id}`))}>
                    <Check size={13} /> Save
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, background: 'var(--bp)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Zap size={15} style={{ color: 'var(--blue)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Badge variant={triggerColors[tr.trigger_type]}>{tr.trigger_type}</Badge>
                  <span style={{ fontSize: 12, color: 'var(--g500)' }}>
                    Occurrence: {tr.occurrence === 0 ? 'every' : tr.occurrence === 1 ? '1st only' : `${tr.occurrence}th`}
                  </span>
                  {tr.min_trigger_amount && (
                    <span style={{ fontSize: 12, color: 'var(--g500)' }}>Min ₹{formatDecimal(tr.min_trigger_amount)}</span>
                  )}
                  {tr.max_trigger_amount && (
                    <span style={{ fontSize: 12, color: 'var(--g500)' }}>Max ₹{formatDecimal(tr.max_trigger_amount)}</span>
                  )}
                  {tr.payment_method && <Badge variant="gray">{tr.payment_method}</Badge>}
                  {tr.product && <Badge variant="yellow">{tr.product}</Badge>}
                  <Badge variant={tr.active ? 'green' : 'red'}>{tr.active ? 'Active' : 'Inactive'}</Badge>
                </div>
                {tr.description && (
                  <div style={{ fontSize: 12, color: 'var(--g400)', marginTop: 4 }}>{tr.description}</div>
                )}
              </div>
              <button
                onClick={() => startEdit(tr)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--g400)', padding: 4, display: 'flex', borderRadius: 4 }}
              >
                <Pencil size={13} />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
