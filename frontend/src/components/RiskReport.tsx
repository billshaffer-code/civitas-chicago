import { useState } from 'react'
import type { ReportResponse, FlagResult } from '../api/civitas'
import ScoreGauge from './ScoreGauge'
import FlagBadge from './FlagBadge'
import PropertyMap from './PropertyMap'
import { downloadPdf } from '../api/civitas'
import Markdown from 'react-markdown'

interface Props {
  report: ReportResponse
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
  // ISO date detection
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toLocaleDateString()
  }
  return s
}

const categoryLabels: Record<string, string> = {
  A: 'Active Enforcement',
  B: 'Recurring Compliance',
  C: 'Regulatory Friction',
  D: 'Tax & Financial',
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function RiskReport({ report, locationSk, address, lat, lon, onNewSearch }: Props) {
  async function handlePdf() {
    const blob = await downloadPdf(locationSk, address)
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `civitas_${report.report_id}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="animate-fade-in space-y-6">

      {/* ── Top Bar ──────────────────────────────────────────────── */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{report.property.address}</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Report {report.report_id} &middot; {new Date(report.generated_at).toLocaleString()}
            &middot; Match: {report.match_confidence}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handlePdf}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Download PDF
          </button>
          <button
            onClick={onNewSearch}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            New Search
          </button>
        </div>
      </div>

      {/* ── Two Column Layout ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Left Column (2/5) ──────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Score */}
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
            <ScoreGauge score={report.risk_score} tier={report.risk_tier} />
          </div>

          {/* Map */}
          {lat != null && lon != null && (
            <PropertyMap lat={lat} lon={lon} address={report.property.address} />
          )}

          {/* Flags grouped by category */}
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Risk Flags
            </h3>
            {report.triggered_flags.length === 0 ? (
              <p className="text-sm text-emerald-600">
                No risk flags triggered.
              </p>
            ) : (
              <FlagList flags={report.triggered_flags} />
            )}
          </div>

          {/* Data Freshness */}
          {report.data_freshness && (
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Data Freshness
              </h3>
              <dl className="space-y-1.5">
                {Object.entries(report.data_freshness).map(([source, ts]) => (
                  <div key={source} className="flex justify-between text-xs">
                    <dt className="text-gray-400">{formatSourceName(source)}</dt>
                    <dd className="text-gray-600 font-mono">
                      {ts ? new Date(ts).toLocaleDateString() : '\u2014'}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>

        {/* ── Right Column (3/5) ─────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-6">

          {/* AI Narrative */}
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Risk Summary
            </h3>
            <div className="prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-900 prose-strong:text-gray-900">
              <Markdown>{report.ai_summary}</Markdown>
            </div>
          </div>

          {/* Tabbed Data Tables */}
          <DataTabs records={report.supporting_records} />
        </div>
      </div>

      {/* ── Disclaimer ───────────────────────────────────────────── */}
      <p className="text-[11px] text-gray-400 border-t border-gray-200 pt-3">
        {report.disclaimer}
      </p>
    </div>
  )
}

// ── FlagList (grouped by category) ───────────────────────────────────────────

function FlagList({ flags }: { flags: FlagResult[] }) {
  const grouped = groupBy(flags, f => f.category)
  const order = ['A', 'B', 'C', 'D']

  return (
    <div className="space-y-4">
      {order.map(cat => {
        const items = grouped[cat]
        if (!items?.length) return null
        return (
          <div key={cat}>
            <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {categoryLabels[cat] ?? `Category ${cat}`}
            </h4>
            {items.map(f => (
              <FlagBadge key={f.flag_code} flag={f} />
            ))}
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

function DataTabs({ records }: { records: Record<string, Record<string, unknown>[]> }) {
  const [active, setActive] = useState<TabKey>('violations')
  const [filter, setFilter] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  const current = tabMeta.find(t => t.key === active)!
  const rawRows = records[active] ?? []

  function handleTabSwitch(tab: TabKey) {
    setActive(tab)
    setFilter('')
    setSortCol(null)
    setSortDir('asc')
    setExpandedRow(null)
  }

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
  }

  // Filter rows
  const lowerFilter = filter.toLowerCase()
  const filteredRows = lowerFilter
    ? rawRows.filter(row =>
        current.columns.some(col => formatCellValue(row[col.key]).toLowerCase().includes(lowerFilter))
      )
    : rawRows

  // Sort rows
  const rows = sortCol
    ? [...filteredRows].sort((a, b) => {
        const colDef = current.columns.find(c => c.key === sortCol)!
        const cmp = sortComparator(a[sortCol], b[sortCol], colDef.type)
        return sortDir === 'desc' ? -cmp : cmp
      })
    : filteredRows

  return (
    <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">

      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-gray-200">
        {tabMeta.map(t => {
          const count = (records[t.key] ?? []).length
          const isActive = t.key === active
          return (
            <button
              key={t.key}
              onClick={() => handleTabSwitch(t.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors
                ${isActive
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-400 hover:text-gray-600 border-b-2 border-transparent'
                }`}
            >
              {t.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono
                ${isActive ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Filter input */}
      {rawRows.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100">
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter records..."
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
          />
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 italic p-6">
            {rawRows.length > 0 && filter ? 'No matching records.' : 'No records found.'}
          </p>
        ) : (
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                {current.columns.map(col => {
                  const isSorted = sortCol === col.key
                  const arrow = isSorted ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ' \u21C5'
                  return (
                    <th key={col.key} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">
                      <button
                        onClick={() => handleSort(col.key)}
                        className={`inline-flex items-center gap-0.5 transition-colors ${isSorted ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
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
                const isExpanded = expandedRow === i
                return (
                  <tr
                    key={i}
                    onClick={() => setExpandedRow(isExpanded ? null : i)}
                    className={`cursor-pointer transition-colors ${
                      isExpanded
                        ? 'bg-blue-50/50'
                        : i % 2 === 0 ? 'bg-white hover:bg-gray-100' : 'bg-gray-50/50 hover:bg-gray-100'
                    }`}
                  >
                    {current.columns.map(col => (
                      <td
                        key={col.key}
                        className={`px-4 py-2 text-gray-700 ${isExpanded ? 'whitespace-pre-wrap break-words' : 'max-w-xs truncate'}`}
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
    </div>
  )
}
