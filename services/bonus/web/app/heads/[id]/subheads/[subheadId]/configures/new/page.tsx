'use client'
import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import toast from 'react-hot-toast'
import { Check, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { createConfigure, selectConfigureLoading } from '@/store/slices/configureSlice'
import { selectHead } from '@/store/slices/headSlice'
import { selectSubhead } from '@/store/slices/subheadSlice'
import { selectEligibilitiesForConfigure } from '@/store/slices/eligibilitySlice'
import { selectTriggersForConfigure } from '@/store/slices/releaseTriggerSlice'
import { Breadcrumb } from '@/components/layout/Breadcrumb'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EligibilityPanel } from '@/components/configures/EligibilityPanel'
import { ReleaseTriggerPanel } from '@/components/configures/ReleaseTriggerPanel'
import { toApiDatetime, formatDate, formatDecimal } from '@/lib/utils'
import type { BonusConfigureCreate, BonusConfigureResponse, ApplicabilityFrequency } from '@/lib/types'

const STEPS = ['Details', 'Eligibility', 'Triggers', 'Review'] as const
type Step = 0 | 1 | 2 | 3

interface DetailsFD {
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
  created_by: string
}

/* ── Stepper ─────────────────────────────────────────────────────────────────── */
function Stepper({ current }: { current: Step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
      {STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: done || active ? 'var(--blue)' : 'var(--g200)',
                color: done || active ? '#fff' : 'var(--g400)',
                boxShadow: active ? '0 0 0 3px rgba(0,145,224,0.2)' : 'none',
                transition: 'all 0.2s',
              }}>
                {done ? <Check size={13} /> : i + 1}
              </div>
              <span style={{ fontSize: 11, fontWeight: active ? 600 : 400, color: active ? 'var(--blue)' : done ? 'var(--g600)' : 'var(--g400)', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < current ? 'var(--blue)' : 'var(--g200)', margin: '0 8px', marginBottom: 20, transition: 'background 0.3s' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────────────── */
export default function NewConfigurePage({ params }: { params: Promise<{ id: string; subheadId: string }> }) {
  const { id, subheadId } = use(params)
  const headId = parseInt(id)
  const subId  = parseInt(subheadId)
  const router  = useRouter()
  const dispatch = useAppDispatch()

  const head     = useAppSelector(selectHead(headId))
  const sub      = useAppSelector(selectSubhead(subId))
  const creating = useAppSelector(selectConfigureLoading('create'))

  const [step, setStep]       = useState<Step>(0)
  const [created, setCreated] = useState<BonusConfigureResponse | null>(null)
  const [startDate, setStartDate] = useState<Date | null>(new Date())
  const [endDate,   setEndDate]   = useState<Date | null>(new Date(Date.now() + 365 * 86400000))

  const eligibilities = useAppSelector(selectEligibilitiesForConfigure(created?.id ?? 0))
  const triggers      = useAppSelector(selectTriggersForConfigure(created?.id ?? 0))

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<DetailsFD>({
    defaultValues: {
      applicability_frequency: 'EVERYTIME',
      wager_multiplier: 0, no_of_chunks: 1,
      wager_chip_type: 'CASH', credit_chip_type: 'CASH',
      priority: 0, active: true,
    },
  })

  async function submitDetails(fd: DetailsFD) {
    if (!startDate || !endDate) { toast.error('Select start and end date'); return }
    const body: BonusConfigureCreate = {
      subhead_id: subId, site_id: sub?.site_id ?? 1,
      name: fd.name, description: fd.description || null,
      applicability_frequency: fd.applicability_frequency,
      start_date: toApiDatetime(startDate)!, end_date: toApiDatetime(endDate)!,
      wager_multiplier: fd.wager_multiplier, no_of_chunks: fd.no_of_chunks,
      release_bucket: fd.release_bucket || null,
      chunk_expiry_days: fd.chunk_expiry_days ? parseInt(fd.chunk_expiry_days) : null,
      bonus_expiry_days: fd.bonus_expiry_days ? parseInt(fd.bonus_expiry_days) : null,
      wager_chip_type: fd.wager_chip_type, credit_chip_type: fd.credit_chip_type,
      bonus_amount_fixed: fd.bonus_amount_fixed ? parseFloat(fd.bonus_amount_fixed) : null,
      bonus_amount_percent: fd.bonus_amount_percent ? parseFloat(fd.bonus_amount_percent) : null,
      bonus_amount_max: fd.bonus_amount_max ? parseFloat(fd.bonus_amount_max) : null,
      priority: fd.priority, active: fd.active, created_by: fd.created_by,
    }
    try {
      const result = await dispatch(createConfigure(body)).unwrap()
      toast.success(`Configure "${result.name}" created`)
      setCreated(result)
      setStep(1)
    } catch (e) { toast.error(typeof e === 'string' ? e : 'Failed to create configure') }
  }

  const fd = getValues()

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <Breadcrumb crumbs={[
        { label: 'Heads', href: '/heads' },
        { label: head?.name ?? `Head #${headId}`, href: `/heads/${headId}` },
        { label: sub?.name ?? `Subhead #${subId}`, href: `/heads/${headId}/subheads/${subId}` },
        { label: 'New Configure' },
      ]} />

      <div style={{ marginBottom: 24, marginTop: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--g900)', margin: 0 }}>New Bonus Configure</h1>
        <p style={{ fontSize: 13, color: 'var(--g400)', margin: '4px 0 0' }}>
          Set up eligibility, amounts, and release triggers for this bonus.
        </p>
      </div>

      <Stepper current={step} />

      {/* ── Step 1: Details ─── */}
      {step === 0 && (
        <form onSubmit={handleSubmit(submitDetails)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Left — core details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Card>
                <CardHeader>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g700)' }}>Campaign Details</span>
                </CardHeader>
                <CardBody>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Input label="Name *" placeholder="e.g. 100% First Deposit up to ₹5000"
                      {...register('name', { required: 'Required' })} error={errors.name?.message} />
                    <Input label="Description" placeholder="Optional notes" {...register('description')} />
                    <Select label="Applicability Frequency" {...register('applicability_frequency')}>
                      <option value="EVERYTIME">EVERYTIME — triggers on every event</option>
                      <option value="ONCE">ONCE — grant only once per player</option>
                      <option value="MONTHLY">MONTHLY — once per calendar month</option>
                      <option value="WEEKLY">WEEKLY — once per calendar week</option>
                    </Select>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <Input label="Priority" type="number" {...register('priority', { valueAsNumber: true, min: 0 })} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--g600)' }}>Status</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', border: '1px solid var(--g200)', borderRadius: 'var(--r)', cursor: 'pointer', fontSize: 12.5 }}>
                          <input type="checkbox" {...register('active')} />
                          Active
                        </label>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g700)' }}>Validity Period</span>
                </CardHeader>
                <CardBody>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--g600)' }}>Start Date (UTC)</label>
                      <DatePicker selected={startDate} onChange={setStartDate} showTimeSelect dateFormat="yyyy-MM-dd HH:mm" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--g600)' }}>End Date (UTC)</label>
                      <DatePicker selected={endDate} onChange={setEndDate} showTimeSelect dateFormat="yyyy-MM-dd HH:mm" />
                    </div>
                    <Input label="Created by *" placeholder="your username"
                      {...register('created_by', { required: 'Required' })} error={errors.created_by?.message} />
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* Right — bonus rules */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Card>
                <CardHeader>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g700)' }}>Bonus Amount</span>
                </CardHeader>
                <CardBody>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Input label="Fixed Amount (₹)" type="number" step="0.01" placeholder="optional"
                      {...register('bonus_amount_fixed')} />
                    <Input label="Percent (%)" type="number" step="0.01" placeholder="optional — e.g. 100 for 100%"
                      {...register('bonus_amount_percent')} />
                    <Input label="Max Amount (₹)" type="number" step="0.01" placeholder="optional cap"
                      {...register('bonus_amount_max')} />
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g700)' }}>Wagering & Chips</span>
                </CardHeader>
                <CardBody>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Input label="Wager Multiplier (0 = none)" type="number" step="0.01"
                      {...register('wager_multiplier', { valueAsNumber: true, min: 0 })} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <Input label="Wager Chip Type" placeholder="CASH" {...register('wager_chip_type')} />
                      <Input label="Credit Chip Type" placeholder="CASH" {...register('credit_chip_type')} />
                    </div>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g700)' }}>Chunks & Expiry</span>
                </CardHeader>
                <CardBody>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <Input label="No. of Chunks" type="number" {...register('no_of_chunks', { valueAsNumber: true, min: 1 })} />
                      <Input label="Release Bucket" placeholder="optional" {...register('release_bucket')} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <Input label="Chunk Expiry (days)" type="number" placeholder="optional" {...register('chunk_expiry_days')} />
                      <Input label="Bonus Expiry (days)" type="number" placeholder="optional" {...register('bonus_expiry_days')} />
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <Button type="submit" loading={creating}>
              Next: Eligibility <ArrowRight size={14} />
            </Button>
          </div>
        </form>
      )}

      {/* ── Step 2: Eligibility ─── */}
      {step === 1 && created && (
        <div>
          <Card>
            <CardBody>
              <EligibilityPanel
                configureId={created.id}
                siteId={created.site_id}
                eligibilities={eligibilities}
                createdBy={fd.created_by}
              />
            </CardBody>
          </Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setStep(0)}>
              <ArrowLeft size={14} /> Back
            </Button>
            <Button onClick={() => setStep(2)}>
              Next: Triggers <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Triggers ─── */}
      {step === 2 && created && (
        <div>
          <Card>
            <CardBody>
              <ReleaseTriggerPanel
                siteId={created.site_id}
                triggers={triggers}
                codes={[{ id: 0, code: `AUTO-${created.id}`, max_amount: null, valid_from: null, valid_to: null, auto_apply: true, display_order: 0, active: true }]}
                createdBy={fd.created_by}
              />
            </CardBody>
          </Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setStep(1)}>
              <ArrowLeft size={14} /> Back
            </Button>
            <Button onClick={() => setStep(3)}>
              Review <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Review ─── */}
      {step === 3 && created && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Success header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: '#d1fae5', borderRadius: 'var(--rl)', border: '1px solid #6ee7b7' }}>
            <CheckCircle2 size={20} style={{ color: '#065f46', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#065f46' }}>Configure created successfully!</div>
              <div style={{ fontSize: 12, color: '#047857' }}>ID #{created.id} · Auto code: AUTO-{created.id}</div>
            </div>
          </div>

          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Card>
              <CardHeader><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g700)' }}>Configure</span></CardHeader>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    ['Name', created.name],
                    ['Frequency', created.applicability_frequency],
                    ['Start', formatDate(created.start_date)],
                    ['End', formatDate(created.end_date)],
                    ['Priority', created.priority],
                    ['Wager ×', created.wager_multiplier],
                    ['Chunks', created.no_of_chunks],
                    ['Fixed Amt', created.bonus_amount_fixed ? `₹${formatDecimal(created.bonus_amount_fixed)}` : '—'],
                    ['Percent', created.bonus_amount_percent ? `${created.bonus_amount_percent}%` : '—'],
                    ['Max Amt', created.bonus_amount_max ? `₹${formatDecimal(created.bonus_amount_max)}` : '—'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--g400)' }}>{k}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--g700)', textAlign: 'right' }}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card>
                <CardHeader>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g700)' }}>Eligibility</span>
                  <Badge variant={eligibilities.length > 0 ? 'green' : 'gray'}>{eligibilities.length} criteria</Badge>
                </CardHeader>
                <CardBody>
                  {eligibilities.length === 0
                    ? <span style={{ fontSize: 12, color: 'var(--g400)' }}>No criteria — open to all players</span>
                    : eligibilities.map(el => (
                      <div key={el.id} style={{ fontSize: 12, display: 'flex', gap: 6, marginBottom: 6 }}>
                        <code style={{ color: 'var(--g700)', fontWeight: 600 }}>{el.eligibility_key}</code>
                        <span style={{ color: 'var(--g400)' }}>=</span>
                        <span style={{ color: 'var(--g900)' }}>{el.eligibility_value}</span>
                        <Badge variant="gray">{el.eligibility_value_type}</Badge>
                      </div>
                    ))
                  }
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g700)' }}>Triggers</span>
                  <Badge variant={triggers.length > 0 ? 'green' : 'gray'}>{triggers.length} triggers</Badge>
                </CardHeader>
                <CardBody>
                  {triggers.length === 0
                    ? <span style={{ fontSize: 12, color: 'var(--g400)' }}>No triggers — will not release automatically</span>
                    : triggers.map(tr => (
                      <div key={tr.id} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <Badge variant="blue">{tr.trigger_type}</Badge>
                        <span style={{ color: 'var(--g400)' }}>occ: {tr.occurrence}</span>
                      </div>
                    ))
                  }
                </CardBody>
              </Card>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <Button variant="secondary" onClick={() => setStep(2)}>
              <ArrowLeft size={14} /> Back
            </Button>
            <Button onClick={() => router.push(`/heads/${headId}/subheads/${subId}/configures/${created.id}`)}>
              Go to Configure <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
