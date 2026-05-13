'use client'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { createSubhead, selectSubheadLoading } from '@/store/slices/subheadSlice'
import { selectHead } from '@/store/slices/headSlice'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import type { BonusSubheadCreate } from '@/lib/types'

interface FD { name: string; description: string; owner: string; active: boolean; created_by: string }

export default function NewSubheadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = use(params)
  const headId  = parseInt(id)
  const router  = useRouter()
  const dispatch = useAppDispatch()

  const head      = useAppSelector(selectHead(headId))
  const isLoading = useAppSelector(selectSubheadLoading('create'))

  const { register, handleSubmit, formState: { errors } } = useForm<FD>({
    defaultValues: { name: '', description: '', owner: '', active: true, created_by: '' },
  })

  async function onSubmit(data: FD) {
    const body: BonusSubheadCreate = {
      head_id: headId, site_id: head?.site_id ?? 1,
      name: data.name, description: data.description || null,
      active: data.active, owner: data.owner, created_by: data.created_by,
    }
    try {
      const result = await dispatch(createSubhead(body)).unwrap()
      toast.success(`Subhead "${result.name}" created`)
      router.push(`/heads/${headId}/subheads/${result.id}`)
    } catch (err) { toast.error(typeof err === 'string' ? err : 'Failed to create subhead') }
  }

  return (
    <div className="space-y-6">
      <Breadcrumb crumbs={[
        { label: 'Heads', href: '/heads' },
        { label: head?.name ?? `Head #${headId}`, href: `/heads/${headId}` },
        { label: 'New Subhead' },
      ]} />
      <h1 className="text-2xl font-bold text-gray-900">New Subhead</h1>
      <Card className="max-w-xl">
        <CardHeader><p className="font-medium text-gray-800">Subhead details</p></CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Name" placeholder="e.g. First Deposit" {...register('name', { required: 'Required' })} error={errors.name?.message} />
            <Input label="Description" placeholder="Optional" {...register('description')} />
            <Input label="Owner" placeholder="username or email" {...register('owner', { required: 'Required' })} error={errors.owner?.message} />
            <div className="flex items-center gap-2">
              <input type="checkbox" id="active" {...register('active')} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
              <label htmlFor="active" className="text-sm text-gray-700">Active</label>
            </div>
            <Input label="Created by" placeholder="your username" {...register('created_by', { required: 'Required' })} error={errors.created_by?.message} />
            <Button type="submit" loading={isLoading}>Create Subhead</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}
