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
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">{report.property.address}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Report {report.report_id} &middot; {new Date(report.generated_at).toLocaleString()}
            &middot; Match: {report.match_confidence}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handlePdf}
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Download PDF
          </button>
          <button
            onClick={onNewSearch}
            className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
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
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
            <ScoreGauge score={report.risk_score} tier={report.risk_tier} />
          </div>

          {/* Map */}
          {lat != null && lon != null && (
            <PropertyMap lat={lat} lon={lon} address={report.property.address} />
          )}

          {/* Flags grouped by category */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Risk Flags
            </h3>
            {report.triggered_flags.length === 0 ? (
              <p className="text-sm text-emerald-400">
                No risk flags triggered.
              </p>
            ) : (
              <FlagList flags={report.triggered_flags} />
            )}
          </div>

          {/* Data Freshness */}
          {report.data_freshness && (
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Data Freshness
              </h3>
              <dl className="space-y-1.5">
                {Object.entries(report.data_freshness).map(([source, ts]) => (
                  <div key={source} className="flex justify-between text-xs">
                    <dt className="text-slate-500">{formatSourceName(source)}</dt>
                    <dd className="text-slate-400 font-mono">
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
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Risk Summary
            </h3>
            <div className="prose prose-sm prose-invert max-w-none text-slate-300 prose-headings:text-slate-200 prose-strong:text-slate-200">
              <Markdown>{report.ai_summary}</Markdown>
            </div>
          </div>

          {/* Tabbed Data Tables */}
          <DataTabs records={report.supporting_records} />
        </div>
      </div>

      {/* ── Disclaimer ───────────────────────────────────────────── */}
      <p className="text-[11px] text-slate-600 border-t border-slate-800 pt-3">
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
            <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
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

type TabKey = 'violations' | 'inspections' | 'permits' | 'service_311' | 'tax_liens'

const tabMeta: { key: TabKey; label: string; columns: string[] }[] = [
  { key: 'violations',  label: 'Violations',   columns: ['violation_date', 'violation_code', 'violation_status', 'violation_description', 'inspection_status'] },
  { key: 'inspections', label: 'Inspections',  columns: ['inspection_date', 'dba_name', 'facility_type', 'risk_level', 'results'] },
  { key: 'permits',     label: 'Permits',      columns: ['permit_number', 'permit_type', 'permit_status', 'application_start_date', 'issue_date', 'processing_time'] },
  { key: 'service_311', label: '311 Requests', columns: ['source_id', 'sr_type', 'sr_short_code', 'status', 'created_date', 'closed_date'] },
  { key: 'tax_liens',   label: 'Tax Liens',    columns: ['tax_sale_year', 'lien_type', 'sold_at_sale', 'total_amount_offered', 'buyer_name'] },
]

function DataTabs({ records }: { records: Record<string, Record<string, unknown>[]> }) {
  const [active, setActive] = useState<TabKey>('violations')
  const current = tabMeta.find(t => t.key === active)!
  const rows = records[active] ?? []

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">

      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-slate-700/50">
        {tabMeta.map(t => {
          const count = (records[t.key] ?? []).length
          const isActive = t.key === active
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors
                ${isActive
                  ? 'border-b-2 border-cyan-500 text-cyan-400'
                  : 'text-slate-500 hover:text-slate-300 border-b-2 border-transparent'
                }`}
            >
              {t.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono
                ${isActive ? 'bg-cyan-500/15 text-cyan-400' : 'bg-slate-800 text-slate-500'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500 italic p-6">No records found.</p>
        ) : (
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                {current.columns.map(c => (
                  <th key={c} className="px-4 py-3 text-left text-slate-400 uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">
                    {formatSourceName(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/20'}>
                  {current.columns.map(c => (
                    <td key={c} className="px-4 py-2 text-slate-300 max-w-xs truncate">
                      {formatCellValue(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
