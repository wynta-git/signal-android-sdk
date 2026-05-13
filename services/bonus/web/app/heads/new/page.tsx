'use client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { createHead, selectHeadLoading } from '@/store/slices/headSlice'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { HeadForm } from '@/components/heads/HeadForm'
import type { BonusHeadCreate } from '@/lib/types'

export default function NewHeadPage() {
  const dispatch  = useAppDispatch()
  const router    = useRouter()
  const isLoading = useAppSelector(selectHeadLoading('create'))

  async function handleCreate(data: BonusHeadCreate) {
    try {
      const result = await dispatch(createHead(data)).unwrap()
      toast.success(`Head "${result.name}" created`)
      router.push(`/heads/${result.id}`)
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to create head')
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumb crumbs={[{ label: 'Heads', href: '/heads' }, { label: 'New Head' }]} />
      <h1 className="text-2xl font-bold text-gray-900">New Bonus Head</h1>
      <Card className="max-w-xl">
        <CardHeader><p className="font-medium text-gray-800">Head details</p></CardHeader>
        <CardBody>
          <HeadForm mode="create" onSubmit={handleCreate} loading={isLoading} />
        </CardBody>
      </Card>
    </div>
  )
}
