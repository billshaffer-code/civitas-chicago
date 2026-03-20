import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ReportResponse, FlagResult } from '../api/civitas'
import FindingCard from './FindingCard'
import PropertyMap from './PropertyMap'
import RecordTimeline from './RecordTimeline'
import { downloadPdf } from '../api/civitas'
import Markdown from 'react-markdown'
import { LEVEL_CONFIG, ACTION_ORDER, type ActionGroup, type ActivityLevel } from '../constants/terminology'

interface Props {
  report?: ReportResponse
  loading?: boolean
  locationSk: number
  address: string
  lat?: number
  lon?: number
  onNewSearch: () => void
}

// ── Utilities ────────────────────────────────────────────────────────────────

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const item of arr) {
    const k = key(item)
    ;(out[k] ??= []).push(item)
  }
  return out
}

function formatSourceName(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatCellValue(v: unknown): string {
  if (v == null) return '\u2014'
  if (typeof v === 'number') return v.toLocaleString()
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toLocaleDateString()
  }
  return s
}

// Map flag_code → relevant data tab
const FLAG_TO_TAB: Record<string, TabKey> = {
  ACTIVE_MUNICIPAL_VIOLATION: 'violations',
  AGED_ENFORCEMENT_RISK: 'violations',
  SEVERE_ENFORCEMENT_ACTION: 'violations',
  ENFORCEMENT_INTENSITY_INCREASE: 'violations',
  DEMOLITION_PERMIT_ISSUED: 'permits',
  PERMIT_PROCESSING_DELAY: 'permits',
  VACANT_BUILDING_VIOLATION: 'vacant_buildings',
  HIGH_VACANT_BUILDING_FINES: 'vacant_buildings',
  REPEAT_COMPLIANCE_ISSUE: 'inspections',
  ABOVE_NORMAL_INSPECTION_FAIL: 'inspections',
  ELEVATED_DISTRESS_SIGNALS: 'service_311',
  ACTIVE_TAX_LIEN: 'tax_liens',
  AGED_TAX_LIEN: 'tax_liens',
  MULTIPLE_LIEN_EVENTS: 'tax_liens',
  HIGH_VALUE_LIEN: 'tax_liens',
}

// ── Section tabs ─────────────────────────────────────────────────────────────

type SectionTab = 'findings' | 'summary' | 'timeline' | 'records'

const RECORD_STATS: { key: string; label: string }[] = [
  { key: 'violations',       label: 'Violations' },
  { key: 'inspections',      label: 'Inspections' },
  { key: 'permits',          label: 'Permits' },
  { key: 'service_311',      label: '311 Requests' },
  { key: 'tax_liens',        label: 'Tax Liens' },
  { key: 'vacant_buildings', label: 'Vacant Bldgs' },
]

// ── Main Component ───────────────────────────────────────────────────────────

export default function PropertyReport({ report, loading = false, locationSk, address, lat, lon, onNewSearch }: Props) {
  const navigate = useNavigate()
  const [sectionTab, setSectionTab] = useState<SectionTab>('findings')
  const [activeRecordTab, setActiveRecordTab] = useState<TabKey>('violations')
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [freshnessOpen, setFreshnessOpen] = useState(false)
  const stickyHeaderRef = useRef<HTMLDivElement>(null)
  const [stickyHeight, setStickyHeight] = useState(0)

  useEffect(() => {
    if (!stickyHeaderRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      setStickyHeight(entry.contentRect.height)
    })
    observer.observe(stickyHeaderRef.current)
    return () => observer.disconnect()
  }, [])

  const cfg = LEVEL_CONFIG[(report?.activity_level as ActivityLevel) ?? ''] ?? LEVEL_CONFIG.QUIET

  const handleFindingClick = useCallback((flagCode: string) => {
    const tab = FLAG_TO_TAB[flagCode]
    if (tab) {
      setActiveRecordTab(tab)
      setSectionTab('records')
    }
  }, [])

  async function handlePdf() {
    if (!report) return
    const blob = await downloadPdf(locationSk, address)
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `civitas_${report.report_id}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  // AI summary preview — first paragraph or first 250 chars
  const summaryText = report?.ai_summary || ''
  const firstBreak = summaryText.indexOf('\n\n')
  const preview = firstBreak > 0 && firstBreak < 300
    ? summaryText.slice(0, firstBreak)
    : summaryText.slice(0, 250) + (summaryText.length > 250 ? '...' : '')
  const hasMoreSummary = summaryText.length > preview.length

  const sectionTabs: { key: SectionTab; label: string; count?: number }[] = [
    { key: 'findings', label: 'Findings', count: report?.triggered_flags.length },
    { key: 'summary',  label: 'Summary' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'records',  label: 'Records' },
  ]

  return (
    <div className="animate-apple-fade-in space-y-3">

      {/* ── Sticky Header Section ──────────────────────────────── */}
      <div ref={stickyHeaderRef} className="sticky top-0 z-20 space-y-2.5 pb-2 -mx-6 px-6 pt-2 bg-surface-raised/90 backdrop-blur-xl backdrop-saturate-[180%]">

      {/* ── Top Bar ────────────────────────────────────────────── */}
      <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-ink-primary">{report?.property.address ?? address}</h2>
          {loading || !report ? (
            <div className="skeleton skeleton-text w-48 mt-1" />
          ) : (
            <p className="text-[12px] text-ink-quaternary font-mono mt-0.5">
              Report {report.report_id} &middot; {new Date(report.generated_at).toLocaleString()}
              &middot; Match: {report.match_confidence}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {!loading && report && lat != null && lon != null && (
            <button
              onClick={() => setShowMap(m => !m)}
              className={`h-[32px] px-3.5 text-[12px] font-medium rounded-apple-sm border transition-all duration-150 ease-apple ${
                showMap
                  ? 'bg-accent-light text-accent border-accent-muted'
                  : 'bg-surface-raised hover:bg-surface-sunken text-ink-secondary hover:text-ink-primary border-separator'
              }`}
            >
              {showMap ? 'Hide Map' : 'Map'}
            </button>
          )}
          {!loading && report && (
            <button
              onClick={() => navigate(`/compare?a=${report.report_id}`)}
              className="h-[32px] px-3.5 bg-surface-raised hover:bg-surface-sunken text-ink-secondary hover:text-ink-primary text-[12px] font-medium rounded-apple-sm border border-separator transition-all duration-150 ease-apple"
            >
              Compare
            </button>
          )}
          {!loading && report && (
            <button
              onClick={handlePdf}
              className="h-[32px] px-3.5 bg-surface-raised hover:bg-surface-sunken text-ink-secondary hover:text-ink-primary text-[12px] font-medium rounded-apple-sm border border-separator transition-all duration-150 ease-apple"
            >
              Download PDF
            </button>
          )}
          <button
            onClick={onNewSearch}
            className="h-[32px] px-3.5 bg-accent hover:bg-accent-hover text-white text-[12px] font-semibold rounded-apple-sm shadow-[0_1px_2px_rgba(0,113,227,0.3)] transition-all duration-150 ease-apple"
          >
            New Search
          </button>
        </div>
      </div>

      {/* ── Map (toggleable) ─────────────────────────────────────── */}
      {showMap && lat != null && lon != null && report && (
        <PropertyMap lat={lat} lon={lon} address={report.property.address} locationSk={locationSk} />
      )}

      {/* ── Score + Stat Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {loading || !report ? (
          <>
            {/* Score card skeleton */}
            <div className="col-span-2 bg-white shadow-apple-xs border border-separator rounded-apple px-4 py-3 flex items-center gap-3.5">
              <div className="skeleton w-14 h-10 rounded-lg flex-shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="skeleton skeleton-text w-16" />
                <div className="skeleton skeleton-text w-24" />
              </div>
            </div>
            {/* Stat card skeletons */}
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white shadow-apple-xs border border-separator rounded-apple px-3 py-2.5">
                <div className="skeleton h-6 w-8 mb-1.5 rounded" />
                <div className="skeleton skeleton-text w-14" />
              </div>
            ))}
          </>
        ) : (
          <>
            {/* Score card */}
            <div className="col-span-2 bg-white shadow-apple-xs border border-separator rounded-apple px-4 py-3 flex items-center gap-3.5">
              <span className={`text-3xl font-black leading-none tabular-nums ${cfg.text}`}>
                {report.activity_score}
              </span>
              <div>
                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${cfg.pillBg} ${cfg.pillText}`}>
                  {cfg.label}
                </span>
                <p className="text-[10px] text-ink-quaternary mt-0.5">Activity Score</p>
              </div>
            </div>

            {/* Record stat cards */}
            {RECORD_STATS.map(s => {
              const count = (report.supporting_records[s.key as keyof typeof report.supporting_records] ?? []).length
              return (
                <button
                  key={s.key}
                  onClick={() => { setActiveRecordTab(s.key as TabKey); setSectionTab('records') }}
                  className={`bg-white shadow-apple-xs border border-separator rounded-apple px-3 py-2.5 text-left hover:shadow-apple-sm hover:border-accent-muted/60 transition-all duration-150 ease-apple active:scale-[0.98] ${count === 0 ? 'opacity-40' : ''}`}
                >
                  <div className="text-[20px] font-bold text-ink-primary tabular-nums">{count}</div>
                  <div className="text-[10px] text-ink-tertiary leading-tight mt-0.5 font-medium">{s.label}</div>
                </button>
              )
            })}
          </>
        )}
      </div>

      {/* ── Section Tabs ─────────────────────────────────────────── */}
      <nav className="flex gap-0.5 bg-surface-raised p-1 rounded-apple">
        {sectionTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSectionTab(t.key)}
            className={`flex-1 py-2 px-3 rounded-[9px] text-[13px] font-medium transition-all duration-200 ease-apple ${
              sectionTab === t.key
                ? 'bg-white shadow-apple-xs text-ink-primary font-semibold'
                : 'text-ink-tertiary hover:text-ink-secondary'
            }`}
          >
            {t.label}
            {t.count != null && (
              <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                sectionTab === t.key ? 'bg-accent-light text-accent' : 'bg-surface-sunken text-ink-quaternary'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </nav>

      </div>{/* end sticky header */}

      {/* ── Tab Content ──────────────────────────────────────────── */}

      {sectionTab === 'findings' && (
        <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg p-5 animate-apple-fade-in">
          {loading || !report ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="border-l-[3px] border-separator-opaque rounded-r-apple-sm px-3.5 py-3 shadow-apple-xs space-y-1.5">
                  <div className="skeleton skeleton-text w-1/3" />
                  <div className="skeleton skeleton-text w-2/3" />
                </div>
              ))}
            </div>
          ) : report.triggered_flags.length === 0 ? (
            <p className="text-[14px] text-ink-quaternary">No findings identified.</p>
          ) : (
            <FindingList flags={report.triggered_flags} onFindingClick={handleFindingClick} />
          )}
        </div>
      )}

      {sectionTab === 'summary' && (
        <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg p-5 animate-apple-fade-in">
          {!summaryText ? (
            <div className="flex items-center gap-3 py-4">
              <div className="w-5 h-5 rounded-full border-[2.5px] border-separator border-t-accent animate-spin" />
              <span className="text-[14px] text-ink-secondary">Generating AI summary…</span>
            </div>
          ) : (
            <>
              <div className="prose prose-sm max-w-none text-ink-secondary prose-headings:text-ink-primary prose-strong:text-ink-primary">
                <Markdown>{summaryExpanded ? summaryText : preview}</Markdown>
              </div>
              {hasMoreSummary && (
                <button
                  onClick={() => setSummaryExpanded(e => !e)}
                  className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:text-accent-hover transition-colors"
                >
                  {summaryExpanded ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                      Show less
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      Read full summary
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {sectionTab === 'timeline' && (
        loading || !report ? (
          <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg p-5 space-y-3 animate-apple-fade-in">
            <div className="skeleton h-32 w-full rounded-apple" />
            <div className="space-y-2 mt-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <div className="skeleton w-6 h-6 rounded-full flex-shrink-0" />
                  <div className="skeleton skeleton-text w-16 flex-shrink-0" />
                  <div className="skeleton skeleton-text w-24 flex-shrink-0" />
                  <div className="skeleton skeleton-text flex-1" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <RecordTimeline records={report.supporting_records} stickyOffset={stickyHeight} />
        )
      )}

      {sectionTab === 'records' && (
        loading || !report ? (
          <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg overflow-hidden animate-apple-fade-in">
            <div className="px-4 py-3 border-b border-separator">
              <div className="skeleton h-9 w-48 rounded-apple-sm" />
            </div>
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="skeleton skeleton-text w-24 flex-shrink-0" />
                  <div className="skeleton skeleton-text w-32 flex-shrink-0" />
                  <div className="skeleton skeleton-text flex-1" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <DataTabs key={activeRecordTab} records={report.supporting_records} activeTab={activeRecordTab} />
        )
      )}

      {/* ── Data Freshness ─────────────────────────────────────── */}
      {!loading && report?.data_freshness && (
        <div>
          <button
            onClick={() => setFreshnessOpen(o => !o)}
            className="w-full flex items-center justify-between py-2 text-[12px] font-medium text-ink-quaternary hover:text-ink-tertiary transition-colors"
          >
            <span>Data Freshness</span>
            <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${freshnessOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {freshnessOpen && (
            <div className="pt-1 pb-3">
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-1.5">
                {Object.entries(report.data_freshness).map(([source, ts]) => (
                  <div key={source} className="flex justify-between text-[11px]">
                    <dt className="text-ink-quaternary">{formatSourceName(source)}</dt>
                    <dd className="text-ink-secondary font-mono">
                      {ts ? new Date(ts).toLocaleDateString() : '\u2014'}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}

      {/* ── Disclaimer ───────────────────────────────────────────── */}
      {!loading && report && (
        <p className="text-[11px] text-ink-quaternary border-t border-separator/60 pt-4 leading-relaxed">
          {report.disclaimer}
        </p>
      )}
    </div>
  )
}

// ── FindingList (grouped by action group) ───────────────────────────────────

function FindingList({ flags, onFindingClick }: { flags: FlagResult[]; onFindingClick: (code: string) => void }) {
  const grouped = groupBy(flags, f => f.action_group || 'Informational')

  return (
    <div className="space-y-5">
      {ACTION_ORDER.map(group => {
        const items = grouped[group]
        if (!items?.length) return null
        return (
          <div key={group}>
            <h4 className="text-[11px] font-semibold text-ink-quaternary uppercase tracking-[0.08em] mb-2">
              {group}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {items.map(f => (
                <FindingCard key={f.flag_code} flag={f} onClick={() => onFindingClick(f.flag_code)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── DataTabs ─────────────────────────────────────────────────────────────────

type TabKey = 'violations' | 'inspections' | 'permits' | 'service_311' | 'tax_liens' | 'vacant_buildings'
type ColType = 'string' | 'date' | 'number'
type ColDef = { key: string; label?: string; type: ColType }
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 25

const tabMeta: { key: TabKey; label: string; columns: ColDef[] }[] = [
  { key: 'violations',       label: 'Violations',       columns: [
    { key: 'violation_date', type: 'date' }, { key: 'violation_code', type: 'string' }, { key: 'violation_status', type: 'string' }, { key: 'violation_description', type: 'string' }, { key: 'inspection_status', type: 'string' },
  ]},
  { key: 'inspections',      label: 'Inspections',      columns: [
    { key: 'inspection_date', type: 'date' }, { key: 'dba_name', type: 'string' }, { key: 'facility_type', type: 'string' }, { key: 'risk_level', type: 'string' }, { key: 'results', type: 'string' },
  ]},
  { key: 'permits',          label: 'Permits',          columns: [
    { key: 'permit_number', type: 'string' }, { key: 'permit_type', type: 'string' }, { key: 'permit_status', type: 'string' }, { key: 'application_start_date', type: 'date' }, { key: 'issue_date', type: 'date' }, { key: 'processing_time', type: 'number' },
  ]},
  { key: 'service_311',      label: '311 Requests',     columns: [
    { key: 'source_id', type: 'string' }, { key: 'sr_type', type: 'string' }, { key: 'sr_short_code', type: 'string' }, { key: 'status', type: 'string' }, { key: 'created_date', type: 'date' }, { key: 'closed_date', type: 'date' },
  ]},
  { key: 'tax_liens',        label: 'Tax Liens',        columns: [
    { key: 'tax_sale_year', type: 'number' }, { key: 'lien_type', type: 'string' }, { key: 'sold_at_sale', type: 'string' }, { key: 'total_amount_offered', type: 'number' }, { key: 'buyer_name', type: 'string' },
  ]},
  { key: 'vacant_buildings', label: 'Vacant Buildings', columns: [
    { key: 'docket_number', type: 'string' }, { key: 'issued_date', type: 'date' }, { key: 'violation_type', type: 'string' }, { key: 'disposition_description', type: 'string' }, { key: 'current_amount_due', type: 'number' }, { key: 'total_paid', type: 'number' },
  ]},
]

function sortComparator(a: unknown, b: unknown, colType: ColType): number {
  const aNull = a == null || a === ''
  const bNull = b == null || b === ''
  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1

  if (colType === 'date') {
    return new Date(String(a)).getTime() - new Date(String(b)).getTime()
  }
  if (colType === 'number') {
    return (parseFloat(String(a)) || 0) - (parseFloat(String(b)) || 0)
  }
  return String(a).localeCompare(String(b))
}

function exportCsv(rows: Record<string, unknown>[], columns: ColDef[], filename: string) {
  const header = columns.map(c => c.label ?? formatSourceName(c.key)).join(',')
  const body = rows.map(row =>
    columns.map(c => {
      const val = formatCellValue(row[c.key])
      if (/[,"\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`
      return val
    }).join(',')
  ).join('\n')
  const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

interface DataTabsProps {
  records: Record<string, Record<string, unknown>[]>
  activeTab: TabKey
}

function DataTabs({ records, activeTab }: DataTabsProps) {
  const [filter, setFilter] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [page, setPage] = useState(0)

  const current = tabMeta.find(t => t.key === activeTab)!
  const rawRows = records[activeTab] ?? []

  function handleSort(colKey: string) {
    if (sortCol !== colKey) {
      setSortCol(colKey)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortCol(null)
      setSortDir('asc')
    }
    setPage(0)
  }

  function handleFilterChange(value: string) {
    setFilter(value)
    setPage(0)
    setExpandedRow(null)
  }

  // Filter rows
  const lowerFilter = filter.toLowerCase()
  const filteredRows = lowerFilter
    ? rawRows.filter(row =>
        current.columns.some(col => formatCellValue(row[col.key]).toLowerCase().includes(lowerFilter))
      )
    : rawRows

  // Sort rows
  const sortedRows = sortCol
    ? [...filteredRows].sort((a, b) => {
        const colDef = current.columns.find(c => c.key === sortCol)!
        const cmp = sortComparator(a[sortCol], b[sortCol], colDef.type)
        return sortDir === 'desc' ? -cmp : cmp
      })
    : filteredRows

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))
  const rows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg overflow-hidden animate-apple-fade-in">

      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-separator flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex-1 max-w-md">
          <input
            type="text"
            value={filter}
            onChange={e => handleFilterChange(e.target.value)}
            placeholder="Filter records…"
            className="w-full h-[36px] bg-surface-raised border border-separator rounded-apple-sm px-3
                       text-[13px] text-ink-primary placeholder:text-ink-placeholder
                       focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent/50
                       transition-all duration-150 ease-apple"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-ink-quaternary font-mono">
            {filter ? `${sortedRows.length} of ${rawRows.length}` : `${rawRows.length}`} records
          </span>
          {rawRows.length > 0 && (
            <button
              onClick={() => exportCsv(sortedRows, current.columns, `civitas_${activeTab}.csv`)}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-tertiary hover:text-accent transition-colors duration-150"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {sortedRows.length === 0 ? (
          <p className="text-[13px] text-ink-quaternary italic p-6">
            {rawRows.length > 0 && filter ? 'No matching records.' : 'No records found.'}
          </p>
        ) : (
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr>
                {current.columns.map(col => {
                  const isSorted = sortCol === col.key
                  const arrow = isSorted ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ' \u21C5'
                  return (
                    <th key={col.key} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap bg-surface-raised text-ink-quaternary border-b border-separator">
                      <button
                        onClick={() => handleSort(col.key)}
                        className={`inline-flex items-center gap-0.5 transition-colors ${isSorted ? 'text-accent' : 'text-ink-quaternary hover:text-ink-secondary'}`}
                      >
                        {col.label ?? formatSourceName(col.key)}
                        <span className="text-[9px]">{arrow}</span>
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const globalIdx = page * PAGE_SIZE + i
                const isExpanded = expandedRow === globalIdx
                return (
                  <tr
                    key={globalIdx}
                    onClick={() => setExpandedRow(isExpanded ? null : globalIdx)}
                    className={`cursor-pointer transition-colors duration-100 ${
                      isExpanded
                        ? 'bg-accent-light/40'
                        : i % 2 === 0 ? 'bg-white hover:bg-surface-raised/50' : 'bg-surface-raised/30 hover:bg-surface-raised/60'
                    }`}
                  >
                    {current.columns.map(col => (
                      <td
                        key={col.key}
                        className={`px-3 py-2.5 text-[12px] text-ink-primary ${isExpanded ? 'whitespace-pre-wrap break-words' : 'max-w-xs truncate'}`}
                      >
                        {formatCellValue(row[col.key])}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-separator">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="text-[12px] font-medium text-accent hover:text-accent-hover disabled:text-ink-quaternary disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i)
              .filter(i => i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 2)
              .reduce<(number | 'ellipsis')[]>((acc, i, idx, arr) => {
                if (idx > 0 && arr[idx - 1] !== i - 1) acc.push('ellipsis')
                acc.push(i)
                return acc
              }, [])
              .map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`e${idx}`} className="text-[12px] text-ink-quaternary px-1">&hellip;</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setPage(item)}
                    className={`min-w-[28px] h-7 rounded-[6px] text-[12px] font-semibold transition-colors ${
                      page === item
                        ? 'bg-accent text-white'
                        : 'text-ink-secondary hover:bg-surface-raised'
                    }`}
                  >
                    {item + 1}
                  </button>
                )
              )}
          </div>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="text-[12px] font-medium text-accent hover:text-accent-hover disabled:text-ink-quaternary disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
