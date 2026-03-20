import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  records: {
    violations: Record<string, unknown>[]
    inspections: Record<string, unknown>[]
    permits: Record<string, unknown>[]
    service_311: Record<string, unknown>[]
    tax_liens: Record<string, unknown>[]
    vacant_buildings: Record<string, unknown>[]
  }
  stickyOffset?: number
}

type RecordType = 'violations' | 'inspections' | 'permits' | 'service_311' | 'tax_liens' | 'vacant_buildings'

interface TimelineEntry {
  type: RecordType
  date: string
  dateLabel: string
  title: string
  description: string
  sortKey: number
  raw: Record<string, unknown>
}

// ── Column definitions for detail table ──────────────────────────────

type ColDef = { key: string; label: string }

function colLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/** Derive all non-empty columns from the actual record data. */
function deriveColumns(entries: TimelineEntry[]): ColDef[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    for (const k of Object.keys(e.raw)) {
      if (!seen.has(k)) { seen.add(k); keys.push(k) }
    }
  }
  // Drop columns where every row is null/empty
  return keys
    .filter(k => entries.some(e => e.raw[k] != null && e.raw[k] !== ''))
    .map(k => ({ key: k, label: colLabel(k) }))
}

const TYPE_CONFIG: Record<RecordType, { label: string; color: string; dotClass: string; iconPath: string }> = {
  violations: {
    label: 'Violation',
    color: '#1e3a8a',
    dotClass: 'bg-blue-100 text-blue-900',
    iconPath: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z',
  },
  inspections: {
    label: 'Inspection',
    color: '#2563eb',
    dotClass: 'bg-blue-50 text-blue-600',
    iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  permits: {
    label: 'Permit',
    color: '#60a5fa',
    dotClass: 'bg-blue-50 text-blue-400',
    iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  service_311: {
    label: '311',
    color: '#64748b',
    dotClass: 'bg-slate-100 text-slate-600',
    iconPath: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  },
  tax_liens: {
    label: 'Tax Lien',
    color: '#b45309',
    dotClass: 'bg-amber-50 text-amber-700',
    iconPath: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  vacant_buildings: {
    label: 'Vacant Bldg',
    color: '#94a3b8',
    dotClass: 'bg-slate-100 text-slate-500',
    iconPath: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  },
}

const ALL_TYPES: RecordType[] = ['violations', 'inspections', 'permits', 'service_311', 'tax_liens', 'vacant_buildings']
const PAGE_SIZE = 50

function str(v: unknown): string {
  if (v == null) return ''
  return String(v)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function normalizeRecords(records: Props['records']): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  for (const r of records.violations) {
    const date = str(r.violation_date)
    if (!date) continue
    entries.push({
      type: 'violations',
      date,
      dateLabel: formatDate(date),
      title: str(r.violation_code) || 'Violation',
      description: str(r.violation_description) || str(r.violation_status),
      sortKey: new Date(date).getTime(),
      raw: r,
    })
  }

  for (const r of records.inspections) {
    const date = str(r.inspection_date)
    if (!date) continue
    const result = str(r.results)
    entries.push({
      type: 'inspections',
      date,
      dateLabel: formatDate(date),
      title: [str(r.facility_type), result].filter(Boolean).join(' \u2014 ') || 'Inspection',
      description: str(r.dba_name),
      sortKey: new Date(date).getTime(),
      raw: r,
    })
  }

  for (const r of records.permits) {
    const date = str(r.application_start_date) || str(r.issue_date)
    if (!date) continue
    entries.push({
      type: 'permits',
      date,
      dateLabel: formatDate(date),
      title: str(r.permit_type) || 'Permit',
      description: [str(r.permit_status), str(r.permit_number)].filter(Boolean).join(' \u2022 '),
      sortKey: new Date(date).getTime(),
      raw: r,
    })
  }

  for (const r of records.service_311) {
    const date = str(r.created_date)
    if (!date) continue
    entries.push({
      type: 'service_311',
      date,
      dateLabel: formatDate(date),
      title: str(r.sr_type) || '311 Request',
      description: str(r.status),
      sortKey: new Date(date).getTime(),
      raw: r,
    })
  }

  for (const r of records.tax_liens) {
    const year = str(r.tax_sale_year)
    if (!year) continue
    const amount = r.total_amount_offered != null
      ? `$${Number(r.total_amount_offered).toLocaleString()}`
      : ''
    entries.push({
      type: 'tax_liens',
      date: `${year}-01-01`,
      dateLabel: year,
      title: `${str(r.lien_type) || 'Tax'} Lien`,
      description: [amount, str(r.buyer_name)].filter(Boolean).join(' \u2022 '),
      sortKey: new Date(`${year}-01-01`).getTime(),
      raw: r,
    })
  }

  for (const r of records.vacant_buildings) {
    const date = str(r.issued_date)
    if (!date) continue
    entries.push({
      type: 'vacant_buildings',
      date,
      dateLabel: formatDate(date),
      title: str(r.violation_type) || 'Vacant Building',
      description: str(r.disposition_description),
      sortKey: new Date(date).getTime(),
      raw: r,
    })
  }

  entries.sort((a, b) => b.sortKey - a.sortKey)
  return entries
}

// ── Visual Timeline Chart ────────────────────────────────────────────

interface ChartBucket {
  label: string
  startTs: number
  endTs: number
  counts: Record<RecordType, number>
  entries: TimelineEntry[]
}

function buildBuckets(entries: TimelineEntry[]): ChartBucket[] {
  if (entries.length === 0) return []

  const sorted = [...entries].sort((a, b) => a.sortKey - b.sortKey)
  const minTs = sorted[0].sortKey
  const maxTs = sorted[sorted.length - 1].sortKey
  const rangeMs = maxTs - minTs

  // Decide bucket granularity based on time span
  const ONE_YEAR = 365.25 * 24 * 60 * 60 * 1000
  const ONE_MONTH = 30.44 * 24 * 60 * 60 * 1000

  let labelFn: (d: Date) => string
  let alignFn: (ts: number) => number
  let advanceFn: (d: Date) => Date

  if (rangeMs <= ONE_YEAR * 2) {
    // Monthly buckets
    labelFn = (d) => d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    alignFn = (ts) => {
      const d = new Date(ts)
      return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
    }
    advanceFn = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)
  } else if (rangeMs <= ONE_YEAR * 8) {
    // Quarterly buckets
    labelFn = (d) => {
      const q = Math.floor(d.getMonth() / 3) + 1
      return `Q${q} '${String(d.getFullYear()).slice(2)}`
    }
    alignFn = (ts) => {
      const d = new Date(ts)
      const q = Math.floor(d.getMonth() / 3) * 3
      return new Date(d.getFullYear(), q, 1).getTime()
    }
    advanceFn = (d) => new Date(d.getFullYear(), d.getMonth() + 3, 1)
  } else {
    // Yearly buckets
    labelFn = (d) => String(d.getFullYear())
    alignFn = (ts) => {
      const d = new Date(ts)
      return new Date(d.getFullYear(), 0, 1).getTime()
    }
    advanceFn = (d) => new Date(d.getFullYear() + 1, 0, 1)
  }

  // Build buckets
  const bucketMap = new Map<number, ChartBucket>()

  for (const entry of sorted) {
    const aligned = alignFn(entry.sortKey)
    let bucket = bucketMap.get(aligned)
    if (!bucket) {
      const alignedDate = new Date(aligned)
      bucket = {
        label: labelFn(alignedDate),
        startTs: aligned,
        endTs: advanceFn(alignedDate).getTime(),
        counts: { violations: 0, inspections: 0, permits: 0, service_311: 0, tax_liens: 0, vacant_buildings: 0 },
        entries: [],
      }
      bucketMap.set(aligned, bucket)
    }
    bucket.counts[entry.type]++
    bucket.entries.push(entry)
  }

  // Fill gaps between first and last bucket
  const keys = [...bucketMap.keys()].sort((a, b) => a - b)
  if (keys.length > 1) {
    let currentDate = new Date(keys[0])
    const last = keys[keys.length - 1]
    let safety = 0
    while (safety++ < 500) {
      const nextDate = advanceFn(currentDate)
      const nextTs = nextDate.getTime()
      if (nextTs > last) break
      if (!bucketMap.has(nextTs)) {
        bucketMap.set(nextTs, {
          label: labelFn(nextDate),
          startTs: nextTs,
          endTs: advanceFn(nextDate).getTime(),
          counts: { violations: 0, inspections: 0, permits: 0, service_311: 0, tax_liens: 0, vacant_buildings: 0 },
          entries: [],
        })
      }
      currentDate = nextDate
    }
  }

  return [...bucketMap.values()].sort((a, b) => a.startTs - b.startTs)
}

function VisualTimeline({ entries, activeTypes, onBucketClick }: {
  entries: TimelineEntry[]
  activeTypes: Set<RecordType>
  onBucketClick: (label: string, entries: TimelineEntry[]) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; bucket: ChartBucket } | null>(null)

  const filtered = useMemo(() => entries.filter(e => activeTypes.has(e.type)), [entries, activeTypes])
  const buckets = useMemo(() => buildBuckets(filtered), [filtered])

  const maxTotal = useMemo(
    () => Math.max(1, ...buckets.map(b => ALL_TYPES.filter(t => activeTypes.has(t)).reduce((s, t) => s + b.counts[t], 0))),
    [buckets, activeTypes]
  )

  const handleMouseEnter = useCallback((bucket: ChartBucket, e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const target = e.currentTarget.getBoundingClientRect()
    setTooltip({ x: target.left - rect.left + target.width / 2, bucket })
  }, [])

  const handleMouseLeave = useCallback(() => setTooltip(null), [])

  if (buckets.length === 0) return null

  // Show every Nth label to avoid crowding
  const labelInterval = buckets.length <= 12 ? 1 : buckets.length <= 24 ? 2 : Math.ceil(buckets.length / 12)

  return (
    <div className="relative" ref={containerRef}>
      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute bottom-full mb-2 z-20 pointer-events-none"
          style={{ left: tooltip.x, transform: 'translateX(-50%)' }}
        >
          <div className="bg-ink-primary/95 backdrop-blur-sm text-white rounded-apple-sm px-3 py-2 text-[11px] shadow-apple-lg whitespace-nowrap">
            <div className="font-semibold mb-1">{tooltip.bucket.label}</div>
            {ALL_TYPES.filter(t => activeTypes.has(t) && tooltip.bucket.counts[t] > 0).map(t => (
              <div key={t} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_CONFIG[t].color }} />
                <span>{TYPE_CONFIG[t].label}: {tooltip.bucket.counts[t]}</span>
              </div>
            ))}
            {tooltip.bucket.entries.length > 0 && (
              <div className="mt-1 pt-1 border-t border-white/20 text-white/50">Click to view</div>
            )}
          </div>
        </div>
      )}

      {/* Bars */}
      <div className="flex items-end gap-px" style={{ height: 100 }}>
        {buckets.map((bucket, i) => {
          const total = ALL_TYPES.filter(t => activeTypes.has(t)).reduce((s, t) => s + bucket.counts[t], 0)
          const barHeight = total > 0 ? Math.max(4, (total / maxTotal) * 84) : 0

          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-stretch justify-end cursor-pointer group"
              style={{ height: '100%' }}
              onMouseEnter={(e) => handleMouseEnter(bucket, e)}
              onMouseLeave={handleMouseLeave}
              onClick={() => { if (bucket.entries.length > 0) onBucketClick(bucket.label, bucket.entries) }}
            >
              {barHeight > 0 ? (
                <div
                  className="rounded-t transition-opacity group-hover:opacity-80"
                  style={{ height: barHeight }}
                >
                  {/* Stacked segments */}
                  <div className="flex flex-col-reverse h-full rounded-t overflow-hidden">
                    {ALL_TYPES.filter(t => activeTypes.has(t)).map(t => {
                      const pct = bucket.counts[t] / total * 100
                      if (pct === 0) return null
                      return (
                        <div
                          key={t}
                          style={{ height: `${pct}%`, backgroundColor: TYPE_CONFIG[t].color }}
                        />
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="h-px bg-separator/60 mx-auto w-full" />
              )}
            </div>
          )
        })}
      </div>

      {/* X-axis labels */}
      <div className="flex mt-1.5">
        {buckets.map((bucket, i) => (
          <div key={i} className="flex-1 text-center">
            {i % labelInterval === 0 ? (
              <span className="text-[9px] text-ink-quaternary">{bucket.label}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Detail Table (BrowsePage style) ───────────────────────────────────

function formatCell(v: unknown): string {
  if (v == null) return '\u2014'
  if (typeof v === 'number') return v.toLocaleString()
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toLocaleDateString()
  }
  return s
}

function BucketDetailTable({ label, entries, onClose, stickyTop }: {
  label: string
  entries: TimelineEntry[]
  onClose: () => void
  stickyTop: number
}) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  // Group entries by record type
  const grouped = useMemo(() => {
    const map = new Map<RecordType, TimelineEntry[]>()
    for (const e of entries) {
      const list = map.get(e.type) ?? []
      list.push(e)
      map.set(e.type, list)
    }
    return map
  }, [entries])

  const types = ALL_TYPES.filter(t => grouped.has(t))

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-separator flex items-center justify-between bg-white/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold text-ink-quaternary uppercase tracking-[0.08em]">Records</span>
          <span className="text-[13px] font-medium text-ink-primary ml-1 truncate">{label}</span>
          <span className="text-[11px] text-ink-quaternary font-mono">{entries.length}</span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-surface-sunken hover:bg-surface-raised flex items-center justify-center text-ink-secondary hover:text-ink-primary transition-all duration-150 flex-shrink-0 ml-3"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tables grouped by type */}
      <div className="overflow-x-auto flex-1 overflow-y-auto">
        {types.map(type => {
          const typeEntries = grouped.get(type)!
          const columns = deriveColumns(typeEntries)
          const cfg = TYPE_CONFIG[type]

          return (
            <div key={type}>
              {/* Type subheader */}
              <div className="px-4 py-2 bg-surface-raised border-b border-separator flex items-center gap-2 sticky top-0 z-10">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
                <span className="text-[11px] font-semibold text-ink-secondary">{cfg.label}</span>
                <span className="text-[10px] text-ink-quaternary font-mono">{typeEntries.length}</span>
              </div>

              <table className="min-w-full text-xs">
                <thead>
                  <tr>
                    {columns.map(col => (
                      <th key={col.key} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-quaternary whitespace-nowrap bg-surface-raised border-b border-separator">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {typeEntries.map((entry, i) => {
                    const isExpanded = expandedRow === typeEntries[0].sortKey + i
                    const rowKey = typeEntries[0].sortKey + i
                    return (
                      <tr
                        key={i}
                        onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                        className={`cursor-pointer transition-colors duration-100 ${
                          isExpanded
                            ? 'bg-accent-light/40'
                            : i % 2 === 0 ? 'bg-white hover:bg-surface-raised/50' : 'bg-surface-raised/30 hover:bg-surface-raised/60'
                        }`}
                      >
                        {columns.map(col => (
                          <td
                            key={col.key}
                            className={`px-3 py-2.5 text-[12px] text-ink-primary ${isExpanded ? 'whitespace-pre-wrap break-words' : 'max-w-[180px] truncate'}`}
                          >
                            {formatCell(entry.raw[col.key])}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────

export default function RecordTimeline({ records, stickyOffset = 0 }: Props) {
  const [activeTypes, setActiveTypes] = useState<Set<RecordType>>(new Set(ALL_TYPES))
  const [showCount, setShowCount] = useState(PAGE_SIZE)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [selectedBucket, setSelectedBucket] = useState<{ label: string; entries: TimelineEntry[] } | null>(null)
  const entryRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const chartRef = useRef<HTMLDivElement>(null)
  const [chartHeight, setChartHeight] = useState(0)

  useEffect(() => {
    if (!chartRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      setChartHeight(entry.contentRect.height)
    })
    observer.observe(chartRef.current)
    return () => observer.disconnect()
  }, [])

  const allEntries = useMemo(() => normalizeRecords(records), [records])

  const filtered = useMemo(
    () => allEntries.filter(e => activeTypes.has(e.type)),
    [allEntries, activeTypes]
  )

  const visible = filtered.slice(0, showCount)
  const hasMore = showCount < filtered.length

  function toggleType(type: RecordType) {
    setActiveTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        if (next.size > 1) next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
    setShowCount(PAGE_SIZE)
  }

  function handleBucketClick(label: string, bucketEntries: TimelineEntry[]) {
    if (bucketEntries.length === 0) return

    // Store selected bucket for the detail table
    setSelectedBucket({ label, entries: bucketEntries })

    // Bucket entries are oldest-first; filtered is newest-first
    // Find the most recent entry in this bucket (appears first in filtered list)
    const targetEntry = bucketEntries[bucketEntries.length - 1]
    const targetId = `${targetEntry.type}-${targetEntry.sortKey}`

    // Ensure enough entries are loaded to show the target
    const idx = filtered.findIndex(e => `${e.type}-${e.sortKey}` === targetId)
    if (idx >= 0 && idx >= showCount) {
      setShowCount(idx + PAGE_SIZE)
    }

    setHighlightedId(targetId)

    // Scroll to the specific entry after render
    setTimeout(() => {
      const el = entryRefs.current[targetId]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      // Clear highlight after animation
      setTimeout(() => setHighlightedId(null), 2000)
    }, 100)
  }

  let lastYear = ''

  if (allEntries.length === 0) {
    return (
      <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg p-8 text-center">
        <p className="text-[14px] text-ink-quaternary">No records to display.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ── Visual Chart (sticky below header) ── */}
      <div
        ref={chartRef}
        className="sticky z-[15] pb-3 bg-surface-raised/90 backdrop-blur-xl"
        style={{ top: stickyOffset }}
      >
      <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-separator flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-ink-quaternary uppercase tracking-[0.08em]">Activity Over Time</span>
            <span className="text-[10px] text-ink-quaternary font-mono ml-1">{filtered.length} {filtered.length === 1 ? 'event' : 'events'}</span>
          </div>
          {/* Legend / filter toggles */}
          <div className="flex gap-3">
            {ALL_TYPES.filter(t => allEntries.some(e => e.type === t)).map(t => {
              const count = allEntries.filter(e => e.type === t).length
              return (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className={`flex items-center gap-1.5 text-[10px] font-medium transition-opacity duration-150 ${
                    activeTypes.has(t) ? 'opacity-100' : 'opacity-30'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_CONFIG[t].color }} />
                  <span className="text-ink-secondary hidden sm:inline">{TYPE_CONFIG[t].label}</span>
                  <span className="text-ink-quaternary font-mono hidden sm:inline">{count}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="px-5 py-4">
          <VisualTimeline
            entries={allEntries}
            activeTypes={activeTypes}
            onBucketClick={handleBucketClick}
          />
        </div>
      </div>
      </div>{/* end sticky chart wrapper */}

      {/* ── Slide-over Detail Panel (portaled to body to escape ancestor transforms) ── */}
      {selectedBucket && createPortal(
        <div className="fixed inset-0 z-[200]" onClick={() => setSelectedBucket(null)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-ink-primary/10 backdrop-blur-[2px]" />
          {/* Panel */}
          <div
            className="absolute right-0 top-0 h-full w-[90vw] bg-white shadow-apple-sheet border-l border-separator animate-slide-in-right flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <BucketDetailTable
              label={selectedBucket.label}
              entries={selectedBucket.entries}
              onClose={() => setSelectedBucket(null)}
              stickyTop={0}
            />
          </div>
        </div>,
        document.body
      )}

      {/* ── Feed ── */}
      <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg overflow-hidden">
          {/* Timeline feed */}
          <div className="px-5 py-4">
            {visible.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No matching events.</p>
            ) : (
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-[12px] top-3 bottom-3 w-px bg-gray-200" />

                <div className="space-y-0">
                  {visible.map((entry, i) => {
                    const entryYear = entry.date.slice(0, 4)
                    const showYearHeader = entryYear !== lastYear
                    lastYear = entryYear

                    const cfg = TYPE_CONFIG[entry.type]
                    const entryId = `${entry.type}-${entry.sortKey}`
                    const isHighlighted = highlightedId === entryId

                    return (
                      <div
                        key={i}
                        ref={(el) => { entryRefs.current[entryId] = el }}
                      >
                        {/* Year divider */}
                        {showYearHeader && (
                          <div className="flex items-center gap-2 py-1.5 relative">
                            <div className="w-[25px] flex justify-center relative z-10">
                              <span className="bg-white px-0.5 text-[10px] font-bold text-gray-300">
                                {entryYear}
                              </span>
                            </div>
                            <div className="flex-1 h-px bg-gray-100" />
                          </div>
                        )}

                        {/* Timeline entry — compact single row */}
                        <div className={`flex items-center gap-2.5 py-1.5 px-1 group rounded-md transition-colors duration-500 ${
                          isHighlighted ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}>
                          {/* Small dot */}
                          <div className="flex-shrink-0 relative z-10">
                            <div className={`w-[25px] h-[25px] rounded-full flex items-center justify-center ${cfg.dotClass}`}>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cfg.iconPath} />
                              </svg>
                            </div>
                          </div>

                          {/* Single-row content */}
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 w-16 flex-shrink-0">
                            {cfg.label}
                          </span>
                          <span className="text-[11px] text-gray-400 w-20 flex-shrink-0">{entry.dateLabel}</span>
                          <span className="text-xs font-medium text-gray-900 truncate flex-1 min-w-0">
                            {entry.title}
                          </span>
                          {entry.description && (
                            <span className="text-[11px] text-gray-400 truncate max-w-[200px] hidden md:inline">
                              {entry.description}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Load more */}
            {hasMore && (
              <button
                onClick={() => setShowCount(c => c + PAGE_SIZE)}
                className="mt-3 w-full py-2.5 text-[12px] font-medium text-ink-secondary hover:text-ink-primary bg-surface-raised rounded-[8px] hover:bg-surface-sunken transition-colors duration-150 ease-apple"
              >
                Show more ({filtered.length - showCount} remaining)
              </button>
            )}
          </div>
        </div>
    </div>
  )
}
