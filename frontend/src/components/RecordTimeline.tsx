import { useState, useMemo } from 'react'

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
  date: string       // ISO string or YYYY-01-01 for year-only
  dateLabel: string   // formatted display
  title: string
  description: string
  sortKey: number     // timestamp for sorting
}

const TYPE_CONFIG: Record<RecordType, { label: string; dotClass: string; iconPath: string }> = {
  violations: {
    label: 'Violation',
    dotClass: 'bg-red-100 text-red-600',
    iconPath: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z',
  },
  inspections: {
    label: 'Inspection',
    dotClass: 'bg-blue-100 text-blue-600',
    iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  permits: {
    label: 'Permit',
    dotClass: 'bg-green-100 text-green-600',
    iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  service_311: {
    label: '311',
    dotClass: 'bg-purple-100 text-purple-600',
    iconPath: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  },
  tax_liens: {
    label: 'Tax Lien',
    dotClass: 'bg-amber-100 text-amber-700',
    iconPath: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  vacant_buildings: {
    label: 'Vacant Bldg',
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
    })
  }

  entries.sort((a, b) => b.sortKey - a.sortKey)
  return entries
}

export default function RecordTimeline({ records }: Props) {
  const [activeTypes, setActiveTypes] = useState<Set<RecordType>>(new Set(ALL_TYPES))
  const [showCount, setShowCount] = useState(PAGE_SIZE)

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

  // Group visible entries by year for year headers
  let lastYear = ''

  if (allEntries.length === 0) {
    return (
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-8 text-center">
        <p className="text-sm text-gray-400">No records to display.</p>
      </div>
    )
  }

  return (
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

      {/* Timeline */}
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

                return (
                  <div key={i}>
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
                    <div className="flex gap-4 py-2 group">
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
  )
}
