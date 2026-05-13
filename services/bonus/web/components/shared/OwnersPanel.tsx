'use client'
import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Plus, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import type { OwnerEntry, OwnerRole } from '@/lib/types'

const ROLES: OwnerRole[] = ['OPS_LEAD', 'CAMPAIGN_MANAGER', 'FINANCE_APPROVER', 'ESCALATION_CONTACT']

interface Props {
  owners: OwnerEntry[]
  onSave: (owners: { username: string; role: OwnerRole; active: boolean }[], updated_by: string) => Promise<void>
}

interface FormData {
  owners: { username: string; role: OwnerRole; active: boolean }[]
  updated_by: string
}

export function OwnersPanel({ owners, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const { register, control, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    defaultValues: { owners: owners.length ? owners : [{ username: '', role: 'OPS_LEAD', active: true }], updated_by: '' },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'owners' })

  async function submit(data: FormData) {
    setSaving(true)
    try {
      await onSave(data.owners, data.updated_by)
      toast.success('Owners updated')
      setEditing(false)
    } catch {
      toast.error('Failed to update owners')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Users className="h-4 w-4" /> Owners ({owners.length})
          </div>
          <Button variant="secondary" size="sm" onClick={() => { reset({ owners: owners.length ? owners : [{ username: '', role: 'OPS_LEAD', active: true }], updated_by: '' }); setEditing(true) }}>
            Edit
          </Button>
        </div>
        {owners.length === 0 ? (
          <p className="text-sm text-gray-400">No owners assigned.</p>
        ) : (
          <div className="space-y-2">
            {owners.map((o) => (
              <div key={o.username} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-800">{o.username}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="blue">{o.role.replace('_', ' ')}</Badge>
                  <Badge variant={o.active ? 'green' : 'red'}>{o.active ? 'Active' : 'Inactive'}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div className="space-y-2">
        {fields.map((field, i) => (
          <div key={field.id} className="flex items-start gap-2">
            <Input placeholder="username" {...register(`owners.${i}.username`, { required: true })} className="flex-1" />
            <Select {...register(`owners.${i}.role`)} className="flex-1">
              {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </Select>
            <select {...register(`owners.${i}.active`, { setValueAs: (v) => v === 'true' || v === true })} className="rounded-lg border border-gray-300 px-2 py-2 text-sm">
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
            <button type="button" onClick={() => remove(i)} className="text-red-400 hover:text-red-600 pt-2">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => append({ username: '', role: 'OPS_LEAD', active: true })}>
        <Plus className="h-3.5 w-3.5" /> Add owner
      </Button>
      <Input label="Updated by" placeholder="your username" {...register('updated_by', { required: true })} error={errors.updated_by?.message} />
      <div className="flex gap-2 pt-1">
        <Button type="submit" loading={saving}>Save owners</Button>
        <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </form>
  )
}
