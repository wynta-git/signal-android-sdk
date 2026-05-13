'use client'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import type { BonusHeadCreate, BonusHeadUpdate } from '@/lib/types'

interface CreateProps {
  mode: 'create'
  onSubmit: (data: BonusHeadCreate) => Promise<void>
  loading?: boolean
}
interface EditProps {
  mode: 'edit'
  defaultValues: { name: string; description?: string | null; owner: string; active: boolean }
  onSubmit: (data: BonusHeadUpdate) => Promise<void>
  loading?: boolean
}
type Props = CreateProps | EditProps

export function HeadForm(props: Props) {
  type FD = { name: string; description: string; owner: string; active: boolean; site_id: number; created_by: string; updated_by: string }
  const dv = props.mode === 'edit'
    ? { name: props.defaultValues.name, description: props.defaultValues.description ?? '', owner: props.defaultValues.owner, active: props.defaultValues.active, site_id: 1, created_by: '', updated_by: '' }
    : { name: '', description: '', owner: '', active: true, site_id: 1, created_by: '', updated_by: '' }

  const { register, handleSubmit, formState: { errors } } = useForm<FD>({ defaultValues: dv })

  async function onSubmit(data: FD) {
    if (props.mode === 'create') {
      await props.onSubmit({ site_id: data.site_id, name: data.name, description: data.description || null, active: data.active, owner: data.owner, created_by: data.created_by })
    } else {
      await props.onSubmit({ name: data.name, description: data.description || null, active: data.active, owner: data.owner, updated_by: data.updated_by })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {props.mode === 'create' && (
          <Input label="Site ID" type="number" {...register('site_id', { required: 'Required', valueAsNumber: true, min: { value: 1, message: 'Must be ≥ 1' } })} error={errors.site_id?.message} />
        )}
        <Input label="Name" placeholder="e.g. Welcome Bonus" {...register('name', { required: 'Required' })} error={errors.name?.message} className={props.mode === 'create' ? '' : 'col-span-2'} />
      </div>
      <Input label="Description" placeholder="Optional description" {...register('description')} />
      <Input label="Owner" placeholder="username or email" {...register('owner', { required: 'Required' })} error={errors.owner?.message} />
      <div className="flex items-center gap-2">
        <input type="checkbox" id="active" {...register('active')} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
        <label htmlFor="active" className="text-sm text-gray-700">Active</label>
      </div>
      {props.mode === 'create' && (
        <Input label="Created by" placeholder="your username" {...register('created_by', { required: 'Required' })} error={errors.created_by?.message} />
      )}
      {props.mode === 'edit' && (
        <Input label="Updated by" placeholder="your username" {...register('updated_by', { required: 'Required' })} error={errors.updated_by?.message} />
      )}
      <Button type="submit" loading={props.loading}>{props.mode === 'create' ? 'Create Head' : 'Save Changes'}</Button>
    </form>
  )
}
