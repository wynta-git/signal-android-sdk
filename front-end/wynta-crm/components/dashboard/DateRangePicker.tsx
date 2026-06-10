'use client';
import { useState, useRef, useEffect } from 'react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function startOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}
function fmtTrigger(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}
function fmtInput(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

type PresetId = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom';
type ComparePreset = 'prevPeriod' | 'prevMonth' | 'prevYear' | 'custom';

interface DateRange { start: Date; end: Date; }

function presetRange(id: PresetId): DateRange {
  const today = startOfDay(new Date());
  switch (id) {
    case 'today':     return { start: today, end: today };
    case 'yesterday': { const y = addDays(today, -1); return { start: y, end: y }; }
    case 'last7':     return { start: addDays(today, -6), end: today };
    case 'last30':    return { start: addDays(today, -29), end: today };
    case 'thisMonth': return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today };
    case 'lastMonth': {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: s, end: e };
    }
    default: return { start: addDays(today, -6), end: today };
  }
}

function daysToPreset(days: number): PresetId {
  if (days === 1)  return 'today';
  if (days === 7)  return 'last7';
  if (days === 30) return 'last30';
  return 'custom';
}

function rangeToDays(r: DateRange): number {
  return Math.max(1, Math.round((r.end.getTime() - r.start.getTime()) / 86400000) + 1);
}

function calcCompare(range: DateRange, preset: ComparePreset): DateRange {
  if (preset === 'prevYear') {
    const s = new Date(range.start); s.setFullYear(s.getFullYear() - 1);
    const e = new Date(range.end);   e.setFullYear(e.getFullYear() - 1);
    return { start: s, end: e };
  }
  if (preset === 'prevMonth') {
    const s = new Date(range.start); s.setMonth(s.getMonth() - 1);
    const e = new Date(range.end);   e.setMonth(e.getMonth() - 1);
    return { start: s, end: e };
  }
  const days = rangeToDays(range);
  const end   = addDays(range.start, -1);
  const start = addDays(end, -(days - 1));
  return { start, end };
}

function toISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function parseInputDate(s: string): Date | null {
  const [mm, dd, yyyy] = s.split('/').map(Number);
  if (!mm || !dd || !yyyy || yyyy < 2000) return null;
  const d = new Date(yyyy, mm - 1, dd);
  return isNaN(d.getTime()) ? null : startOfDay(d);
}

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'today',     label: 'Today'        },
  { id: 'yesterday', label: 'Yesterday'    },
  { id: 'last7',     label: 'Last 7 Days'  },
  { id: 'last30',    label: 'Last 30 Days' },
  { id: 'thisMonth', label: 'This Month'   },
  { id: 'lastMonth', label: 'Last Month'   },
  { id: 'custom',    label: 'Custom Range' },
];

interface Props {
  windowDays: number;
  onChange:   (days: number, range: { start: string; end: string }, compare?: { start: string; end: string }) => void;
}

export default function DateRangePicker({ windowDays, onChange }: Props) {
  const initPreset = daysToPreset(windowDays);
  const initRange  = presetRange(initPreset);

  const [open,          setOpen]          = useState(false);
  const [activeRange,   setActiveRange]   = useState<DateRange>(initRange);
  const [compareActive, setCompareActive] = useState<DateRange | null>(null);
  const [pendingRange,  setPendingRange]  = useState<DateRange>(initRange);
  const [pendingPreset, setPendingPreset] = useState<PresetId>(initPreset);
  const [comparePreset,      setComparePreset]      = useState<ComparePreset>('prevPeriod');
  const [customCompareStart, setCustomCompareStart] = useState('');
  const [customCompareEnd,   setCustomCompareEnd]   = useState('');
  const [pickingEnd,         setPickingEnd]         = useState(false);
  const [hoverDay,           setHoverDay]           = useState<Date | null>(null);
  const [compareOn,          setCompareOn]          = useState(false);

  const [calLeft, setCalLeft] = useState<{ year: number; month: number }>(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setPickingEnd(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function openPicker() {
    const p = daysToPreset(windowDays);
    const r = presetRange(p);
    setPendingPreset(p); setPendingRange(r);
    setPickingEnd(false); setHoverDay(null);
    setCalLeft({ year: r.start.getFullYear(), month: r.start.getMonth() });
    setOpen(true);
  }

  function handlePresetClick(id: PresetId) {
    const r = presetRange(id);
    setPendingPreset(id); setPendingRange(r);
    setPickingEnd(false); setHoverDay(null);
    setCalLeft({ year: r.start.getFullYear(), month: r.start.getMonth() });
  }

  function handleDayClick(d: Date) {
    if (!pickingEnd) {
      setPendingRange({ start: d, end: d });
      setPendingPreset('custom');
      setPickingEnd(true);
    } else {
      const start = d < pendingRange.start ? d : pendingRange.start;
      const end   = d < pendingRange.start ? pendingRange.start : d;
      setPendingRange({ start, end });
      setPendingPreset('custom');
      setPickingEnd(false); setHoverDay(null);
    }
  }

  function handleApply() {
    setActiveRange(pendingRange);
    let compareRange: { start: string; end: string } | undefined;
    if (compareOn) {
      let resolved: DateRange | null = null;
      if (comparePreset === 'custom') {
        const s = parseInputDate(customCompareStart);
        const e = parseInputDate(customCompareEnd);
        resolved = s && e ? { start: s, end: e } : null;
      } else {
        resolved = calcCompare(pendingRange, comparePreset);
      }
      setCompareActive(resolved);
      if (resolved) compareRange = { start: toISO(resolved.start), end: toISO(resolved.end) };
    } else {
      setCompareActive(null);
    }
    const range = { start: toISO(pendingRange.start), end: toISO(pendingRange.end) };
    onChange(rangeToDays(pendingRange), range, compareRange);
    setOpen(false); setPickingEnd(false);
  }

  function handleCancel() {
    setOpen(false); setPickingEnd(false); setHoverDay(null);
  }

  const calRight = calLeft.month === 11
    ? { year: calLeft.year + 1, month: 0 }
    : { year: calLeft.year, month: calLeft.month + 1 };

  function prevMonth() {
    setCalLeft(c => {
      const d = new Date(c.year, c.month - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }
  function nextMonth() {
    setCalLeft(c => {
      const d = new Date(c.year, c.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function renderCalendar(year: number, month: number) {
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMo = new Date(year, month + 1, 0).getDate();
    const cells: Array<Date | null> = Array(firstDow).fill(null);
    for (let i = 1; i <= daysInMo; i++) cells.push(new Date(year, month, i));

    const [dispStart, dispEnd] = pickingEnd && hoverDay
      ? hoverDay >= pendingRange.start
        ? [pendingRange.start, hoverDay]
        : [hoverDay, pendingRange.start]
      : [pendingRange.start, pendingRange.end];

    const today = startOfDay(new Date());

    return (
      <div style={{ width: 224 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', rowGap: 1 }}>
          {DAY_NAMES.map(d => (
            <div key={d} style={{ fontSize: 11, color: 'var(--crm-fg4)', fontWeight: 600, paddingBottom: 8 }}>
              {d}
            </div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;

            const isStart = sameDay(d, dispStart);
            const isEnd   = sameDay(d, dispEnd);
            const isEdge  = isStart || isEnd;
            const inRange = d > dispStart && d < dispEnd;
            const isToday = sameDay(d, today);
            const isSingleDay = sameDay(dispStart, dispEnd);

            return (
              <div
                key={i}
                onClick={() => handleDayClick(d)}
                onMouseEnter={() => pickingEnd && setHoverDay(d)}
                onMouseLeave={() => pickingEnd && setHoverDay(null)}
                style={{
                  position: 'relative',
                  padding: '3px 0',
                  cursor: 'pointer',
                  background: inRange
                    ? '#dceeff'
                    : isStart && !isSingleDay
                      ? 'linear-gradient(to right, transparent 50%, #dceeff 50%)'
                      : isEnd && !isSingleDay
                        ? 'linear-gradient(to left, transparent 50%, #dceeff 50%)'
                        : 'transparent',
                  userSelect: 'none',
                }}
              >
                <div style={{
                  width: 28, height: 28,
                  margin: '0 auto',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%',
                  background: isEdge ? 'var(--crm-blue)' : 'transparent',
                  color: isEdge ? '#fff' : isToday ? 'var(--crm-blue)' : 'var(--crm-fg2)',
                  fontWeight: isEdge || isToday ? 600 : 400,
                  fontSize: 12.5,
                  transition: 'background 0.1s',
                }}>
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const shownCompare = compareOn && compareActive;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <div onClick={openPicker} style={{ cursor: 'pointer', textAlign: 'right' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--fg1)' }}>
          {fmtTrigger(activeRange.start)} – {fmtTrigger(activeRange.end)}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, display: 'inline-flex', flexShrink: 0, color: 'var(--crm-blue)' }}>
            <path d="M8 2v4"/><path d="M16 2v4"/>
            <rect width="18" height="18" x="3" y="4" rx="2"/>
            <path d="M3 10h18"/>
          </svg>
        </div>
        {shownCompare && (
          <div style={{ fontSize: 11, color: 'var(--fg3)', marginTop: 2 }}>
            Compare to: {fmtTrigger(compareActive.start)} – {fmtTrigger(compareActive.end)}
          </div>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 950,
          background: '#fff', borderRadius: 10,
          boxShadow: '0 8px 32px rgba(17,24,39,0.16)',
          border: '1px solid var(--crm-border)',
          minWidth: 660, overflow: 'hidden',
        }}>
          <div style={{ display: 'flex' }}>
            {/* Preset sidebar */}
            <div style={{
              padding: '14px 6px', borderRight: '1px solid var(--crm-border)',
              minWidth: 140, display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePresetClick(p.id)}
                  style={{
                    padding: '7px 14px', border: 'none', borderRadius: 5,
                    textAlign: 'left', fontSize: 13,
                    fontFamily: 'inherit', cursor: 'pointer',
                    background: pendingPreset === p.id ? '#dceeff' : 'transparent',
                    color:      pendingPreset === p.id ? 'var(--crm-blue)' : 'var(--crm-fg2)',
                    fontWeight: pendingPreset === p.id ? 600 : 400,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Calendar area */}
            <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Date inputs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  readOnly value={fmtInput(pendingRange.start)}
                  style={{
                    flex: 1, height: 32, padding: '0 10px',
                    border: '1.5px solid var(--crm-blue)',
                    borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
                    outline: 'none', color: 'var(--crm-fg1)', cursor: 'default',
                  }}
                />
                <span style={{ color: 'var(--crm-fg4)', fontSize: 16 }}>→</span>
                <input
                  readOnly value={fmtInput(pendingRange.end)}
                  style={{
                    flex: 1, height: 32, padding: '0 10px',
                    border: '1px solid var(--crm-border-md)',
                    borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
                    outline: 'none', color: 'var(--crm-fg1)', cursor: 'default',
                  }}
                />
              </div>

              {/* Dual months */}
              <div style={{ display: 'flex', gap: 20 }}>
                {/* Left month */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <button type="button" onClick={prevMonth}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: 'var(--crm-fg3)', fontSize: 18, lineHeight: 1, borderRadius: 3 }}>‹</button>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-fg1)' }}>
                      {MONTH_NAMES[calLeft.month]} {calLeft.year}
                    </span>
                    <div style={{ width: 28 }} />
                  </div>
                  {renderCalendar(calLeft.year, calLeft.month)}
                </div>

                <div style={{ width: 1, background: 'var(--crm-border)', flexShrink: 0 }} />

                {/* Right month */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ width: 28 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-fg1)' }}>
                      {MONTH_NAMES[calRight.month]} {calRight.year}
                    </span>
                    <button type="button" onClick={nextMonth}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: 'var(--crm-fg3)', fontSize: 18, lineHeight: 1, borderRadius: 3 }}>›</button>
                  </div>
                  {renderCalendar(calRight.year, calRight.month)}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', alignItems: 'center', padding: '10px 16px',
            borderTop: '1px solid var(--crm-border)', gap: 10,
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--crm-fg2)' }}>
              <input
                type="checkbox"
                checked={compareOn}
                onChange={e => setCompareOn(e.target.checked)}
                style={{ accentColor: 'var(--crm-blue)', cursor: 'pointer', width: 14, height: 14 }}
              />
              Compare to:
            </label>
            <select
              value={comparePreset}
              onChange={e => setComparePreset(e.target.value as ComparePreset)}
              disabled={!compareOn}
              style={{
                height: 30, padding: '0 8px',
                border: '1px solid var(--crm-border-md)',
                borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
                outline: 'none', color: compareOn ? 'var(--crm-fg2)' : 'var(--crm-fg4)',
                opacity: compareOn ? 1 : 0.5,
              }}
            >
              <option value="prevPeriod">Previous Period</option>
              <option value="prevMonth">Previous Month</option>
              <option value="prevYear">Previous Year</option>
              <option value="custom">Custom</option>
            </select>
            {compareOn && comparePreset === 'custom' && (
              <>
                <input
                  type="text"
                  placeholder="MM/DD/YYYY"
                  value={customCompareStart}
                  onChange={e => setCustomCompareStart(e.target.value)}
                  style={{
                    width: 110, height: 30, padding: '0 8px',
                    border: '1px solid var(--crm-blue)',
                    borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
                    outline: 'none', color: 'var(--crm-fg1)',
                  }}
                />
                <input
                  type="text"
                  placeholder="MM/DD/YYYY"
                  value={customCompareEnd}
                  onChange={e => setCustomCompareEnd(e.target.value)}
                  style={{
                    width: 110, height: 30, padding: '0 8px',
                    border: '1px solid var(--crm-border-md)',
                    borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
                    outline: 'none', color: 'var(--crm-fg1)',
                  }}
                />
              </>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" onClick={handleCancel}
              style={{
                height: 34, padding: '0 18px',
                border: '1px solid var(--crm-border-md)',
                borderRadius: 4, background: '#fff',
                fontSize: 13, fontFamily: 'inherit',
                fontWeight: 500, cursor: 'pointer', color: 'var(--crm-fg2)',
              }}>
              Cancel
            </button>
            <button type="button" onClick={handleApply}
              style={{
                height: 34, padding: '0 20px',
                border: 'none', borderRadius: 4,
                background: 'var(--crm-blue)', color: '#fff',
                fontSize: 13, fontFamily: 'inherit',
                fontWeight: 600, cursor: 'pointer',
              }}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
