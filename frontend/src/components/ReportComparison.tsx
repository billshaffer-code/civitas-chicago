import { useState, useEffect } from 'react'
import Markdown from 'react-markdown'
import type { ReportResponse } from '../api/civitas'
import { getCompareSummary } from '../api/civitas'
import ActivityBar from './ActivityBar'
import FindingCard from './FindingCard'

interface Props {
  reportA: ReportResponse
  reportB: ReportResponse
}

const recordLabels: Record<string, string> = {
  violations: 'Violations',
  inspections: 'Inspections',
  permits: 'Permits',
  tax_liens: 'Tax Liens',
  service_311: '311 Requests',
  vacant_buildings: 'Vacant Buildings',
}

export default function ReportComparison({ reportA, reportB }: Props) {
  const [aiComparison, setAiComparison] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    if (reportA.report_id && reportB.report_id) {
      setAiLoading(true)
      getCompareSummary([reportA.report_id, reportB.report_id])
        .then(setAiComparison)
        .catch(() => setAiComparison(null))
        .finally(() => setAiLoading(false))
    }
  }, [reportA.report_id, reportB.report_id])

  const scoreDelta = reportB.activity_score - reportA.activity_score

  // Finding set diff
  const flagsA = new Set(reportA.triggered_flags.map((f) => f.flag_code))
  const flagsB = new Set(reportB.triggered_flags.map((f) => f.flag_code))
  const onlyA = reportA.triggered_flags.filter((f) => !flagsB.has(f.flag_code))
  const shared = reportA.triggered_flags.filter((f) => flagsB.has(f.flag_code))
  const onlyB = reportB.triggered_flags.filter((f) => !flagsA.has(f.flag_code))

  // Record count diffs
  const recordKeys = ['violations', 'inspections', 'permits', 'tax_liens', 'service_311', 'vacant_buildings']

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Report A</h3>
          <p className="text-lg font-bold text-gray-900">{reportA.property.address}</p>
          <p className="text-xs text-gray-400 mt-1">{new Date(reportA.generated_at).toLocaleString()}</p>
        </div>
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Report B</h3>
          <p className="text-lg font-bold text-gray-900">{reportB.property.address}</p>
          <p className="text-xs text-gray-400 mt-1">{new Date(reportB.generated_at).toLocaleString()}</p>
        </div>
      </div>

      {/* Score comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
          <ActivityBar score={reportA.activity_score} level={reportA.activity_level} />
        </div>
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
          <ActivityBar score={reportB.activity_score} level={reportB.activity_level} />
        </div>
      </div>

      {/* Score delta */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4 text-center">
        <span className="text-sm text-gray-500">Score Delta: </span>
        <span className={`text-lg font-bold ${scoreDelta !== 0 ? 'text-blue-600' : 'text-gray-600'}`}>
          {scoreDelta > 0 ? '+' : ''}{scoreDelta}
        </span>
      </div>

      {/* Findings comparison */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Findings Comparison
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <h4 className="text-xs font-semibold text-blue-700 uppercase mb-2">
              Only in A ({onlyA.length})
            </h4>
            {onlyA.length === 0 ? (
              <p className="text-xs text-gray-400 italic">None</p>
            ) : (
              onlyA.map((f) => <FindingCard key={f.flag_code} flag={f} />)
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-blue-500 uppercase mb-2">
              Shared ({shared.length})
            </h4>
            {shared.length === 0 ? (
              <p className="text-xs text-gray-400 italic">None</p>
            ) : (
              shared.map((f) => <FindingCard key={f.flag_code} flag={f} />)
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-blue-400 uppercase mb-2">
              Only in B ({onlyB.length})
            </h4>
            {onlyB.length === 0 ? (
              <p className="text-xs text-gray-400 italic">None</p>
            ) : (
              onlyB.map((f) => <FindingCard key={f.flag_code} flag={f} />)
            )}
          </div>
        </div>
      </div>

      {/* Record counts */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Records</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Report A</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Report B</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Delta</th>
            </tr>
          </thead>
          <tbody>
            {recordKeys.map((key) => {
              const countA = (reportA.supporting_records as Record<string, unknown[]>)[key]?.length ?? 0
              const countB = (reportB.supporting_records as Record<string, unknown[]>)[key]?.length ?? 0
              const delta = countB - countA
              return (
                <tr key={key} className="border-b border-gray-100">
                  <td className="px-4 py-2.5 text-gray-700">{recordLabels[key] ?? key}</td>
                  <td className="px-4 py-2.5 text-center font-mono text-gray-700">{countA}</td>
                  <td className="px-4 py-2.5 text-center font-mono text-gray-700">{countB}</td>
                  <td className="px-4 py-2.5 text-center font-mono">
                    <span className={delta !== 0 ? 'text-blue-600' : 'text-gray-400'}>
                      {delta > 0 ? '+' : ''}{delta}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* AI Comparative Summary */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          AI Comparative Analysis
        </h3>
        {aiLoading ? (
          <div className="flex items-center gap-2 py-4">
            <div className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-blue-600 animate-spin" />
            <span className="text-sm text-gray-500">Generating comparison…</span>
          </div>
        ) : aiComparison ? (
          <div className="prose prose-sm prose-slate max-w-none">
            <Markdown>{aiComparison}</Markdown>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">Comparative analysis unavailable.</p>
        )}
      </div>

      {/* AI Summaries side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Summary — A
          </h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{reportA.ai_summary}</p>
        </div>
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Summary — B
          </h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{reportB.ai_summary}</p>
        </div>
      </div>
    </div>
  )
}
