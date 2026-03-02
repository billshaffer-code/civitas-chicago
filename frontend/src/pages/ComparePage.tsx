import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getMyReports, getReport } from '../api/civitas'
import type { ReportHistoryItem, ReportResponse } from '../api/civitas'
import ReportComparison from '../components/ReportComparison'

const tierColors: Record<string, string> = {
  LOW: 'bg-emerald-50 text-emerald-600',
  MODERATE: 'bg-yellow-50 text-yellow-600',
  ELEVATED: 'bg-orange-50 text-orange-600',
  HIGH: 'bg-red-50 text-red-600',
}

export default function ComparePage() {
  const [searchParams] = useSearchParams()
  const [reports, setReports] = useState<ReportHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [idA, setIdA] = useState(searchParams.get('a') ?? '')
  const [idB, setIdB] = useState(searchParams.get('b') ?? '')
  const [reportA, setReportA] = useState<ReportResponse | null>(null)
  const [reportB, setReportB] = useState<ReportResponse | null>(null)
  const [comparing, setComparing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getMyReports(100)
      .then(setReports)
      .catch(() => setReports([]))
      .finally(() => setLoading(false))
  }, [])

  // Auto-compare if both params provided
  useEffect(() => {
    const a = searchParams.get('a')
    const b = searchParams.get('b')
    if (a && b) {
      setIdA(a)
      setIdB(b)
      handleCompare(a, b)
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCompare(aId?: string, bId?: string) {
    const a = aId ?? idA
    const b = bId ?? idB
    if (!a || !b) return
    setComparing(true)
    setError('')
    try {
      const [rA, rB] = await Promise.all([getReport(a), getReport(b)])
      setReportA(rA)
      setReportB(rB)
    } catch {
      setError('Failed to load one or both reports')
    } finally {
      setComparing(false)
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Compare Reports</h1>

      {/* Selection */}
      {!reportA || !reportB ? (
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6 space-y-4">
          <p className="text-sm text-gray-500">
            Select two reports to compare side-by-side. You can compare the same property over time
            or different properties.
          </p>

          {loading ? (
            <p className="text-sm text-gray-400">Loading reports...</p>
          ) : reports.length < 2 ? (
            <p className="text-sm text-gray-400">
              You need at least 2 reports to compare. Generate reports first.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Report A</label>
                  <select
                    value={idA}
                    onChange={(e) => setIdA(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
                  >
                    <option value="">Select a report...</option>
                    {reports.map((r) => (
                      <option key={r.report_id} value={r.report_id}>
                        {r.query_address} — Score: {r.risk_score} ({r.risk_tier}) — {new Date(r.generated_at).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Report B</label>
                  <select
                    value={idB}
                    onChange={(e) => setIdB(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
                  >
                    <option value="">Select a report...</option>
                    {reports.map((r) => (
                      <option key={r.report_id} value={r.report_id}>
                        {r.query_address} — Score: {r.risk_score} ({r.risk_tier}) — {new Date(r.generated_at).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Selected reports preview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[idA, idB].map((id, idx) => {
                  const r = reports.find((rep) => rep.report_id === id)
                  if (!r) return <div key={idx} />
                  return (
                    <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-gray-900">{r.query_address}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-mono text-gray-600">Score: {r.risk_score}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tierColors[r.risk_tier] ?? ''}`}>
                          {r.risk_tier}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                onClick={() => handleCompare()}
                disabled={!idA || !idB || idA === idB || comparing}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
              >
                {comparing ? 'Loading...' : 'Compare'}
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <button
            onClick={() => {
              setReportA(null)
              setReportB(null)
            }}
            className="text-sm text-blue-600 hover:text-blue-500 font-medium mb-4 inline-block"
          >
            &larr; Choose different reports
          </button>
          <ReportComparison reportA={reportA} reportB={reportB} />
        </>
      )}
    </main>
  )
}
