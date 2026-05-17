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
import { selectEligibilitiesForConfigure } from '@/store/slices/eligibilitySlice'
import { selectTriggersForConfigure } from '@/store/slices/releaseTriggerSlice'
import { selectHead } from '@/store/slices/headSlice'
import { selectSubhead } from '@/store/slices/subheadSlice'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { PageSpinner } from '@/components/ui/Spinner'
import { EligibilityPanel } from '@/components/configures/EligibilityPanel'
import { ReleaseTriggerPanel } from '@/components/configures/ReleaseTriggerPanel'
import { formatDate, formatDecimal, fromApiDatetime, toApiDatetime } from '@/lib/utils'
import type { BonusConfigureUpdate, ApplicabilityFrequency } from '@/lib/types'

type Tab = 'details' | 'eligibility' | 'triggers' | 'codes' | 'edit'

interface EditFD {
  name: string
  description: string
  applicability_frequency: ApplicabilityFrequency
  wager_multiplier: number
  no_of_chunks: number
  release_bucket: string
  chunk_expiry_days: string
  bonus_expiry_days: string
  wager_chip_type: string
  credit_chip_type: string
  bonus_amount_fixed: string
  bonus_amount_percent: string
  bonus_amount_max: string
  priority: number
  active: boolean
  updated_by: string
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '9px 15px', fontSize: 13, fontWeight: active ? 600 : 400, background: 'none', border: 'none',
  borderBottom: `2px solid ${active ? 'var(--blue)' : 'transparent'}`,
  color: active ? 'var(--blue)' : 'var(--g500)', cursor: 'pointer',
  transition: 'color 0.12s, border-color 0.12s', marginBottom: -1,
})

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

  const eligibilities = useAppSelector(selectEligibilitiesForConfigure(cfgId))
  const triggers      = useAppSelector(selectTriggersForConfigure(cfgId))

  const [startDate, setStartDate] = useState<Date | null>(null)
  const [endDate,   setEndDate]   = useState<Date | null>(null)

  const { register, handleSubmit, formState: { errors }, reset } = useForm<EditFD>()

  useEffect(() => { dispatch(fetchConfigure(cfgId)) }, [cfgId, dispatch])

  if (fetching && !data) return <PageSpinner />
  if (fetchErr || !data) return <div style={{ color: 'var(--g400)', padding: 32 }}>{fetchErr ?? 'Configure not found.'}</div>

  function openEdit() {
    setStartDate(fromApiDatetime(data!.start_date))
    setEndDate(fromApiDatetime(data!.end_date))
    reset({
      name: data!.name, description: data!.description ?? '',
      applicability_frequency: data!.applicability_frequency,
      wager_multiplier: parseFloat(data!.wager_multiplier),
      no_of_chunks: data!.no_of_chunks,
      release_bucket: data!.release_bucket ?? '',
      chunk_expiry_days: data!.chunk_expiry_days?.toString() ?? '',
      bonus_expiry_days: data!.bonus_expiry_days?.toString() ?? '',
      wager_chip_type: data!.wager_chip_type, credit_chip_type: data!.credit_chip_type,
      bonus_amount_fixed: data!.bonus_amount_fixed ?? '',
      bonus_amount_percent: data!.bonus_amount_percent ?? '',
      bonus_amount_max: data!.bonus_amount_max ?? '',
      priority: data!.priority, active: data!.active, updated_by: '',
    })
    setTab('edit')
  }

  async function handleUpdate(fd: EditFD) {
    const body: BonusConfigureUpdate = {
      name: fd.name, description: fd.description || null,
      applicability_frequency: fd.applicability_frequency,
      start_date: toApiDatetime(startDate), end_date: toApiDatetime(endDate),
      wager_multiplier: fd.wager_multiplier, no_of_chunks: fd.no_of_chunks,
      release_bucket: fd.release_bucket || null,
      chunk_expiry_days: fd.chunk_expiry_days ? parseInt(fd.chunk_expiry_days) : null,
      bonus_expiry_days: fd.bonus_expiry_days ? parseInt(fd.bonus_expiry_days) : null,
      wager_chip_type: fd.wager_chip_type, credit_chip_type: fd.credit_chip_type,
      bonus_amount_fixed: fd.bonus_amount_fixed ? parseFloat(fd.bonus_amount_fixed) : null,
      bonus_amount_percent: fd.bonus_amount_percent ? parseFloat(fd.bonus_amount_percent) : null,
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
    { key: 'details',     label: 'Details' },
    { key: 'eligibility', label: `Eligibility (${eligibilities.length})` },
    { key: 'triggers',    label: `Triggers (${triggers.length})` },
    { key: 'codes',       label: `Promo Codes (${data.codes.length})` },
    { key: 'edit',        label: 'Edit' },
  ]

  return (
    <div>
      <Breadcrumb crumbs={[
        { label: 'Heads', href: '/heads' },
        { label: head?.name ?? `Head #${headId}`, href: `/heads/${headId}` },
        { label: sub?.name ?? `Subhead #${subId}`, href: `/heads/${headId}/subheads/${subId}` },
        { label: data.name },
      ]} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', margin: '16px 0 20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--g900)', margin: 0 }}>{data.name}</h1>
            <Badge variant={data.active ? 'green' : 'red'}>{data.active ? 'Active' : 'Inactive'}</Badge>
            <Badge variant="blue">{data.applicability_frequency}</Badge>
          </div>
          {data.description && <p style={{ fontSize: 13, color: 'var(--g500)', margin: '4px 0 0' }}>{data.description}</p>}
          <p style={{ fontSize: 11.5, color: 'var(--g400)', margin: '6px 0 0' }}>
            {formatDate(data.start_date)} → {formatDate(data.end_date)} · Priority {data.priority}
          </p>
        </div>
        {tab !== 'edit' && (
          <Button variant="secondary" size="sm" onClick={openEdit}>Edit</Button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid var(--g200)', display: 'flex', marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => t.key === 'edit' ? openEdit() : setTab(t.key)}
            style={tabStyle(tab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Details */}
      {tab === 'details' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            ['Applicability Freq.', data.applicability_frequency],
            ['Wager Multiplier', data.wager_multiplier],
            ['No. of Chunks', data.no_of_chunks],
            ['Release Bucket', data.release_bucket ?? '—'],
            ['Wager Chip', data.wager_chip_type],
            ['Credit Chip', data.credit_chip_type],
            ['Priority', data.priority],
            ['Fixed Amount', data.bonus_amount_fixed ? `₹${formatDecimal(data.bonus_amount_fixed)}` : '—'],
            ['Percent Amount', data.bonus_amount_percent ? `${data.bonus_amount_percent}%` : '—'],
            ['Max Amount', data.bonus_amount_max ? `₹${formatDecimal(data.bonus_amount_max)}` : '—'],
            ['Chunk Expiry', data.chunk_expiry_days ? `${data.chunk_expiry_days} days` : '—'],
            ['Bonus Expiry', data.bonus_expiry_days ? `${data.bonus_expiry_days} days` : '—'],
            ['Created by', data.created_by], ['Updated by', data.updated_by],
            ['Created at', formatDate(data.created_at)], ['Updated at', formatDate(data.updated_at)],
          ].map(([k, v]) => (
            <div key={k} style={{ background: 'var(--g50)', borderRadius: 'var(--r)', padding: '10px 14px', border: '1px solid var(--g150)' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--g400)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{k}</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--g900)', margin: '2px 0 0' }}>{String(v)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Eligibility */}
      {tab === 'eligibility' && (
        <EligibilityPanel
          configureId={cfgId}
          siteId={data.site_id}
          eligibilities={eligibilities}
        />
      )}

      {/* Triggers */}
      {tab === 'triggers' && (
        <ReleaseTriggerPanel
          siteId={data.site_id}
          triggers={triggers}
          codes={data.codes}
        />
      )}

      {/* Promo Codes */}
      {tab === 'codes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.codes.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--g400)', padding: '24px 0' }}>No promo codes.</p>
          )}
          {data.codes.map(c => (
            <Card key={c.id}>
              <CardBody>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, background: 'var(--bp)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Tag size={14} style={{ color: 'var(--blue)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <code style={{ fontSize: 13, fontWeight: 700, color: 'var(--g900)', letterSpacing: '0.03em' }}>{c.code}</code>
                      <Badge variant={c.active ? 'green' : 'red'}>{c.active ? 'Active' : 'Inactive'}</Badge>
                      {c.auto_apply && <Badge variant="blue">Auto-apply</Badge>}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--g400)', margin: '4px 0 0' }}>
                      {c.max_amount ? `Max ₹${formatDecimal(c.max_amount)}` : 'No cap'} ·{' '}
                      {c.valid_from ? formatDate(c.valid_from) : 'Any time'} → {c.valid_to ? formatDate(c.valid_to) : 'No expiry'}
                    </p>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--g400)', flexShrink: 0 }}>Order {c.display_order}</span>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Edit */}
      {tab === 'edit' && (
        <Card style={{ maxWidth: 700 }}>
          <CardHeader>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g700)' }}>Edit Configure</span>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit(handleUpdate)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input label="Name" {...register('name', { required: 'Required' })} error={errors.name?.message} />
              <Input label="Description" {...register('description')} />

              <Select label="Applicability Frequency" {...register('applicability_frequency')}>
                <option value="EVERYTIME">EVERYTIME</option>
                <option value="ONCE">ONCE</option>
                <option value="MONTHLY">MONTHLY</option>
                <option value="WEEKLY">WEEKLY</option>
              </Select>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--g600)' }}>Start Date (UTC)</label>
                  <DatePicker selected={startDate} onChange={setStartDate} showTimeSelect dateFormat="yyyy-MM-dd HH:mm" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--g600)' }}>End Date (UTC)</label>
                  <DatePicker selected={endDate} onChange={setEndDate} showTimeSelect dateFormat="yyyy-MM-dd HH:mm" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Input label="Wager Multiplier" type="number" step="0.01" {...register('wager_multiplier', { valueAsNumber: true })} />
                <Input label="No. of Chunks" type="number" {...register('no_of_chunks', { valueAsNumber: true })} />
                <Input label="Priority" type="number" {...register('priority', { valueAsNumber: true })} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Input label="Fixed Amount (₹)" type="number" step="0.01" {...register('bonus_amount_fixed')} />
                <Input label="Percent (%)" type="number" step="0.01" {...register('bonus_amount_percent')} />
                <Input label="Max Amount (₹)" type="number" step="0.01" {...register('bonus_amount_max')} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Input label="Release Bucket" {...register('release_bucket')} />
                <Input label="Chunk Expiry Days" type="number" {...register('chunk_expiry_days')} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Input label="Wager Chip Type" {...register('wager_chip_type')} />
                <Input label="Credit Chip Type" {...register('credit_chip_type')} />
              </div>

              <Input label="Bonus Expiry Days" type="number" {...register('bonus_expiry_days')} />

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" {...register('active')} />
                Active
              </label>

              <Input label="Updated by *" placeholder="your username"
                {...register('updated_by', { required: 'Required' })} error={errors.updated_by?.message} />

              <div style={{ display: 'flex', gap: 10 }}>
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
