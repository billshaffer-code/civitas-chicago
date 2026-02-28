import type { ReportResponse } from '../api/civitas'
import ScoreGauge from './ScoreGauge'
import FlagBadge from './FlagBadge'
import { downloadPdf } from '../api/civitas'
import Markdown from 'react-markdown'

interface Props {
  report: ReportResponse
  locationSk: number
  address: string
}

export default function RiskReport({ report, locationSk, address }: Props) {
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
    <div className="space-y-6 mt-6">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {report.property.address}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Report ID: {report.report_id} · Generated: {new Date(report.generated_at).toLocaleString()}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Match: {report.match_confidence}
            </p>
          </div>
          <div className="flex-shrink-0">
            <ScoreGauge score={report.risk_score} tier={report.risk_tier} />
          </div>
        </div>
      </div>

      {/* ── Flags ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Risk Flags</h3>
        {report.triggered_flags.length === 0 ? (
          <p className="text-green-700 font-medium">
            No risk flags triggered. No actionable municipal or tax risk findings
            were identified for this address.
          </p>
        ) : (
          report.triggered_flags.map(f => (
            <FlagBadge key={f.flag_code} flag={f} />
          ))
        )}
      </div>

      {/* ── AI Narrative ────────────────────────────────────────── */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">Risk Summary</h3>
        <div className="prose prose-sm prose-blue max-w-none text-blue-900">
          <Markdown>{report.ai_summary}</Markdown>
        </div>
      </div>

      {/* ── Supporting Records ──────────────────────────────────── */}
      <RecordsSection title="Building Violations" rows={report.supporting_records.violations}
        columns={['violation_date','violation_code','violation_status','violation_description','inspection_status']} />

      <RecordsSection title="Food Inspections" rows={report.supporting_records.inspections}
        columns={['inspection_date','dba_name','facility_type','risk_level','results']} />

      <RecordsSection title="Building Permits" rows={report.supporting_records.permits}
        columns={['permit_number','permit_type','permit_status','application_start_date','issue_date','processing_time']} />

      <RecordsSection title="Tax Lien Events" rows={report.supporting_records.tax_liens}
        columns={['tax_sale_year','lien_type','sold_at_sale','total_amount_offered','buyer_name']} />

      {/* ── Actions ─────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <button
          onClick={handlePdf}
          className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-semibold
                     px-6 py-2 rounded-lg transition-colors"
        >
          Download PDF Report
        </button>
      </div>

      {/* ── Disclaimer ──────────────────────────────────────────── */}
      <p className="text-xs text-gray-500 border-t pt-3">{report.disclaimer}</p>

    </div>
  )
}


// ── Helper: generic table ────────────────────────────────────────────────────

function RecordsSection({
  title,
  rows,
  columns,
}: {
  title: string
  rows: Record<string, unknown>[]
  columns: string[]
}) {
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No records found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-100">
                {columns.map(c => (
                  <th key={c} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">
                    {c.replace(/_/g, ' ').toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {columns.map(c => (
                    <td key={c} className="px-3 py-1.5 text-gray-700 max-w-xs truncate">
                      {String(row[c] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
