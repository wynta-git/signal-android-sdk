'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Plus, Pencil, Check, X } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  createEligibility, updateEligibility,
  selectEligibilityLoading, selectEligibilityError,
} from '@/store/slices/eligibilitySlice'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import type { BonusEligibilityResponse, BonusEligibilityCreate, BonusEligibilityUpdate, EligibilityValueType } from '@/lib/types'

interface Props {
  configureId: number
  siteId: number
  eligibilities: BonusEligibilityResponse[]
  createdBy?: string
}

interface AddFD {
  eligibility_key: string
  eligibility_value: string
  eligibility_value_type: EligibilityValueType
  description: string
  active: boolean
  created_by: string
}

interface EditFD {
  eligibility_value: string
  eligibility_value_type: EligibilityValueType
  description: string
  active: boolean
  updated_by: string
}

const valueTypeColors: Record<EligibilityValueType, 'blue' | 'yellow' | 'green' | 'gray' | 'red'> = {
  STRING: 'blue', INT: 'yellow', DECIMAL: 'green', BOOLEAN: 'gray', JSON: 'red',
}

export function EligibilityPanel({ configureId, siteId, eligibilities, createdBy = '' }: Props) {
  const dispatch = useAppDispatch()
  const creating = useAppSelector(selectEligibilityLoading('create'))
  const createErr = useAppSelector(selectEligibilityError('create'))
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const addForm = useForm<AddFD>({
    defaultValues: {
      eligibility_value_type: 'STRING', active: true, created_by: createdBy,
    },
  })
  const editForm = useForm<EditFD>()

  async function handleAdd(fd: AddFD) {
    const body: BonusEligibilityCreate = {
      configure_id: configureId, site_id: siteId,
      eligibility_key: fd.eligibility_key,
      eligibility_value: fd.eligibility_value,
      eligibility_value_type: fd.eligibility_value_type,
      description: fd.description || null,
      active: fd.active, created_by: fd.created_by,
    }
    try {
      await dispatch(createEligibility(body)).unwrap()
      toast.success('Criterion added')
      addForm.reset({ eligibility_value_type: 'STRING', active: true, created_by: fd.created_by })
      setShowAdd(false)
    } catch (e) { toast.error(typeof e === 'string' ? e : 'Failed') }
  }

  function startEdit(el: BonusEligibilityResponse) {
    editForm.reset({
      eligibility_value: el.eligibility_value,
      eligibility_value_type: el.eligibility_value_type,
      description: el.description ?? '',
      active: el.active, updated_by: '',
    })
    setEditingId(el.id)
  }

  async function handleEdit(fd: EditFD, id: number) {
    const body: BonusEligibilityUpdate = {
      eligibility_value: fd.eligibility_value,
      eligibility_value_type: fd.eligibility_value_type,
      description: fd.description || null,
      active: fd.active, updated_by: fd.updated_by,
    }
    try {
      await dispatch(updateEligibility({ id, body })).unwrap()
      toast.success('Updated')
      setEditingId(null)
    } catch (e) { toast.error(typeof e === 'string' ? e : 'Failed') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--g700)' }}>Eligibility Criteria</div>
          <div style={{ fontSize: 12, color: 'var(--g400)', marginTop: 2 }}>All criteria must pass (AND logic) for this bonus to be granted.</div>
        </div>
        {!showAdd && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={13} /> Add Criterion
          </Button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: 'var(--bp)', border: '1px solid var(--bm)', borderRadius: 'var(--rl)', padding: 16 }}>
          <form onSubmit={addForm.handleSubmit(handleAdd)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 160px', gap: 10 }}>
              <Input
                label="Key"
                placeholder="e.g. kyc_status"
                {...addForm.register('eligibility_key', { required: 'Required' })}
                error={addForm.formState.errors.eligibility_key?.message}
              />
              <Input
                label="Value"
                placeholder="e.g. VERIFIED"
                {...addForm.register('eligibility_value', { required: 'Required' })}
                error={addForm.formState.errors.eligibility_value?.message}
              />
              <Select label="Type" {...addForm.register('eligibility_value_type')}>
                <option value="STRING">STRING</option>
                <option value="INT">INT</option>
                <option value="DECIMAL">DECIMAL</option>
                <option value="BOOLEAN">BOOLEAN</option>
                <option value="JSON">JSON</option>
              </Select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 10 }}>
              <Input label="Description (optional)" placeholder="What this criterion checks" {...addForm.register('description')} />
              <Input label="Created by" placeholder="username" {...addForm.register('created_by', { required: 'Required' })} error={addForm.formState.errors.created_by?.message} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" {...addForm.register('active')} />
                Active
              </label>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button type="submit" size="sm" loading={creating}>Add Criterion</Button>
              </div>
            </div>
            {createErr && <p style={{ fontSize: 12, color: 'var(--err)', margin: 0 }}>{createErr}</p>}
          </form>
        </div>
      )}

      {/* List */}
      {eligibilities.length === 0 && !showAdd && (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--g400)', fontSize: 13 }}>
          No eligibility criteria yet. Add one to restrict who qualifies for this bonus.
        </div>
      )}

      {eligibilities.map(el => (
        <div key={el.id} style={{ background: '#fff', border: '1px solid var(--g200)', borderRadius: 'var(--rl)', padding: '12px 16px' }}>
          {editingId === el.id ? (
            <form onSubmit={editForm.handleSubmit(fd => handleEdit(fd, el.id))} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--g500)', marginBottom: 4 }}>
                Editing: <span style={{ fontFamily: 'monospace', color: 'var(--g700)' }}>{el.eligibility_key}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 10 }}>
                <Input label="Value" {...editForm.register('eligibility_value', { required: 'Required' })} />
                <Select label="Type" {...editForm.register('eligibility_value_type')}>
                  <option value="STRING">STRING</option>
                  <option value="INT">INT</option>
                  <option value="DECIMAL">DECIMAL</option>
                  <option value="BOOLEAN">BOOLEAN</option>
                  <option value="JSON">JSON</option>
                </Select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 10 }}>
                <Input label="Description" {...editForm.register('description')} />
                <Input label="Updated by" {...editForm.register('updated_by', { required: 'Required' })} error={editForm.formState.errors.updated_by?.message} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" {...editForm.register('active')} />
                  Active
                </label>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                    <X size={13} /> Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={useAppSelector(selectEligibilityLoading(`update_${el.id}`))}>
                    <Check size={13} /> Save
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <code style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--g700)', background: 'var(--g100)', padding: '2px 7px', borderRadius: 4 }}>
                    {el.eligibility_key}
                  </code>
                  <span style={{ fontSize: 12, color: 'var(--g400)' }}>→</span>
                  <span style={{ fontSize: 13, color: 'var(--g900)', fontWeight: 500 }}>{el.eligibility_value}</span>
                  <Badge variant={valueTypeColors[el.eligibility_value_type]}>{el.eligibility_value_type}</Badge>
                  <Badge variant={el.active ? 'green' : 'red'}>{el.active ? 'Active' : 'Inactive'}</Badge>
                </div>
                {el.description && (
                  <div style={{ fontSize: 12, color: 'var(--g400)', marginTop: 4 }}>{el.description}</div>
                )}
              </div>
              <button
                onClick={() => startEdit(el)}
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
