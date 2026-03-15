import { useState, useMemo, useRef, useCallback } from 'react'

interface Props {
  records: {
    violations: Record<string, unknown>[]
    inspections: Record<string, unknown>[]
    permits: Record<string, unknown>[]
    service_311: Record<string, unknown>[]
    tax_liens: Record<string, unknown>[]
    vacant_buildings: Record<string, unknown>[]
  }
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

// ── Column definitions for detail table (matches PropertyReport tabMeta) ────

type ColDef = { key: string; label: string }

const DETAIL_COLUMNS: Record<RecordType, ColDef[]> = {
  violations: [
    { key: 'violation_date', label: 'Date' }, { key: 'violation_code', label: 'Code' }, { key: 'violation_status', label: 'Status' }, { key: 'violation_description', label: 'Description' },
  ],
  inspections: [
    { key: 'inspection_date', label: 'Date' }, { key: 'dba_name', label: 'Business' }, { key: 'facility_type', label: 'Facility' }, { key: 'results', label: 'Result' },
  ],
  permits: [
    { key: 'permit_number', label: 'Permit #' }, { key: 'permit_type', label: 'Type' }, { key: 'permit_status', label: 'Status' }, { key: 'issue_date', label: 'Issued' },
  ],
  service_311: [
    { key: 'sr_type', label: 'Type' }, { key: 'status', label: 'Status' }, { key: 'created_date', label: 'Created' }, { key: 'closed_date', label: 'Closed' },
  ],
  tax_liens: [
    { key: 'tax_sale_year', label: 'Year' }, { key: 'lien_type', label: 'Type' }, { key: 'total_amount_offered', label: 'Amount' }, { key: 'buyer_name', label: 'Buyer' },
  ],
  vacant_buildings: [
    { key: 'docket_number', label: 'Docket' }, { key: 'issued_date', label: 'Date' }, { key: 'violation_type', label: 'Violation' }, { key: 'disposition_description', label: 'Disposition' },
  ],
}

const TYPE_CONFIG: Record<RecordType, { label: string; color: string; dotClass: string; iconPath: string }> = {
  violations: {
    label: 'Violation',
    color: '#dc2626',
    dotClass: 'bg-red-100 text-red-600',
    iconPath: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z',
  },
  inspections: {
    label: 'Inspection',
    color: '#2563eb',
    dotClass: 'bg-blue-100 text-blue-600',
    iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  permits: {
    label: 'Permit',
    color: '#16a34a',
    dotClass: 'bg-green-100 text-green-600',
    iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  service_311: {
    label: '311',
    color: '#9333ea',
    dotClass: 'bg-purple-100 text-purple-600',
    iconPath: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  },
  tax_liens: {
    label: 'Tax Lien',
    color: '#b45309',
    dotClass: 'bg-amber-100 text-amber-700',
    iconPath: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  vacant_buildings: {
    label: 'Vacant Bldg',
    color: '#4b5563',
    dotClass: 'bg-gray-200 text-gray-600',
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
          <div className="bg-gray-900 text-white rounded-lg px-3 py-2 text-[11px] shadow-lg whitespace-nowrap">
            <div className="font-semibold mb-1">{tooltip.bucket.label}</div>
            {ALL_TYPES.filter(t => activeTypes.has(t) && tooltip.bucket.counts[t] > 0).map(t => (
              <div key={t} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_CONFIG[t].color }} />
                <span>{TYPE_CONFIG[t].label}: {tooltip.bucket.counts[t]}</span>
              </div>
            ))}
            {tooltip.bucket.entries.length > 0 && (
              <div className="mt-1 pt-1 border-t border-gray-700 text-gray-400">Click to scroll</div>
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
                <div className="h-px bg-gray-200 mx-auto w-full" />
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
              <span className="text-[9px] text-gray-400">{bucket.label}</span>
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

function BucketDetailTable({ label, entries, onClose }: {
  label: string
  entries: TimelineEntry[]
  onClose: () => void
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
    <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden lg:sticky lg:top-4 lg:self-start">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Records</span>
          <span className="text-[11px] text-gray-400 ml-2">{label}</span>
          <span className="text-[10px] text-gray-300 ml-2">{entries.length} {entries.length === 1 ? 'record' : 'records'}</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tables grouped by type */}
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        {types.map(type => {
          const typeEntries = grouped.get(type)!
          const columns = DETAIL_COLUMNS[type]
          const cfg = TYPE_CONFIG[type]

          return (
            <div key={type}>
              {/* Type subheader */}
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                <span className="text-[11px] font-semibold text-gray-600">{cfg.label}</span>
                <span className="text-[10px] text-gray-400 font-mono">{typeEntries.length}</span>
              </div>

              <table className="min-w-full text-xs">
                <thead className="bg-white">
                  <tr>
                    {columns.map(col => (
                      <th key={col.key} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
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
                        className={`cursor-pointer transition-colors ${
                          isExpanded
                            ? 'bg-blue-50/50'
                            : i % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/30 hover:bg-gray-100/50'
                        }`}
                      >
                        {columns.map(col => (
                          <td
                            key={col.key}
                            className={`px-3 py-2 text-gray-700 ${isExpanded ? 'whitespace-pre-wrap break-words' : 'max-w-[150px] truncate'}`}
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

export default function RecordTimeline({ records }: Props) {
  const [activeTypes, setActiveTypes] = useState<Set<RecordType>>(new Set(ALL_TYPES))
  const [showCount, setShowCount] = useState(PAGE_SIZE)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [selectedBucket, setSelectedBucket] = useState<{ label: string; entries: TimelineEntry[] } | null>(null)
  const entryRefs = useRef<Record<string, HTMLDivElement | null>>({})

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
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-8 text-center">
        <p className="text-sm text-gray-400">No records to display.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ── Visual Chart ── */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Activity Over Time</span>
          {/* Legend */}
          <div className="flex gap-3">
            {ALL_TYPES.filter(t => allEntries.some(e => e.type === t)).map(t => (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={`flex items-center gap-1 text-[10px] font-medium transition-opacity ${
                  activeTypes.has(t) ? 'opacity-100' : 'opacity-30'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_CONFIG[t].color }} />
                <span className="text-gray-600 hidden sm:inline">{TYPE_CONFIG[t].label}</span>
              </button>
            ))}
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

      {/* ── Feed + Detail Table ── */}
      <div className={`grid gap-3 ${selectedBucket ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>

        {/* Feed */}
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
          {/* Filter chips */}
          <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Filter</span>
            {ALL_TYPES.map(type => {
              const cfg = TYPE_CONFIG[type]
              const count = allEntries.filter(e => e.type === type).length
              if (count === 0) return null
              const active = activeTypes.has(type)
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                    active
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {cfg.label}
                  <span className={`text-[10px] font-mono ${active ? 'text-gray-400' : 'text-gray-300'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
            <span className="ml-auto text-[11px] text-gray-400">
              {filtered.length} {filtered.length === 1 ? 'event' : 'events'}
            </span>
          </div>

          {/* Timeline feed */}
          <div className="px-5 py-4">
            {visible.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No matching events.</p>
            ) : (
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-[19px] top-3 bottom-3 w-px bg-gray-200" />

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
                          <div className="flex items-center gap-3 py-2 relative">
                            <div className="w-[39px] flex justify-center relative z-10">
                              <span className="bg-white px-1 text-[11px] font-bold text-gray-300">
                                {entryYear}
                              </span>
                            </div>
                            <div className="flex-1 h-px bg-gray-100" />
                          </div>
                        )}

                        {/* Timeline entry */}
                        <div className={`flex gap-4 py-2 group rounded-lg transition-colors duration-500 ${
                          isHighlighted ? 'bg-blue-50' : ''
                        }`}>
                          {/* Icon dot */}
                          <div className="flex-shrink-0 relative z-10">
                            <div className={`w-[39px] h-[39px] rounded-full flex items-center justify-center ${cfg.dotClass}`}>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={cfg.iconPath} />
                              </svg>
                            </div>
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 pb-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                {cfg.label}
                              </span>
                              <span className="text-[11px] text-gray-300">{entry.dateLabel}</span>
                            </div>
                            <p className="text-sm font-medium text-gray-900 mt-0.5 leading-snug">
                              {entry.title}
                            </p>
                            {entry.description && (
                              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed truncate">
                                {entry.description}
                              </p>
                            )}
                          </div>
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
                className="mt-4 w-full py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Show more ({filtered.length - showCount} remaining)
              </button>
            )}
          </div>
        </div>

        {/* Detail Table */}
        {selectedBucket && (
          <BucketDetailTable
            label={selectedBucket.label}
            entries={selectedBucket.entries}
            onClose={() => setSelectedBucket(null)}
          />
        )}
      </div>
    </div>
  )
}
