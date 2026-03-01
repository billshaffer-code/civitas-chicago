import { useState, useEffect } from 'react'
import PropertySearch from './components/PropertySearch'
import RiskReport from './components/RiskReport'
import { lookupProperty, generateReport, getReportHistory, getReport } from './api/civitas'
import type { LookupRequest, LookupResponse, ReportResponse, ReportHistoryItem } from './api/civitas'

type Phase = 'search' | 'lookup-loading' | 'lookup-done' | 'report-loading' | 'report-done'

const tierColors: Record<string, string> = {
  LOW: 'bg-emerald-50 text-emerald-600',
  MODERATE: 'bg-yellow-50 text-yellow-600',
  ELEVATED: 'bg-orange-50 text-orange-600',
  HIGH: 'bg-red-50 text-red-600',
}

export default function App() {
  const [phase, setPhase]       = useState<Phase>('search')
  const [lookup, setLookup]     = useState<LookupResponse | null>(null)
  const [report, setReport]     = useState<ReportResponse | null>(null)
  const [lastReq, setLastReq]   = useState<LookupRequest>({ address: '' })
  const [error, setError]       = useState<string | null>(null)
  const [history, setHistory]   = useState<ReportHistoryItem[]>([])

  // Fetch report history when lookup resolves
  useEffect(() => {
    if (lookup?.resolved && lookup.location_sk) {
      getReportHistory(lookup.location_sk)
        .then(setHistory)
        .catch(() => setHistory([]))
    } else {
      setHistory([])
    }
  }, [lookup])

  function handleNewSearch() {
    setPhase('search')
    setLookup(null)
    setReport(null)
    setError(null)
    setLastReq({ address: '' })
    setHistory([])
  }

  async function handleLookup(req: LookupRequest) {
    setError(null)
    setLookup(null)
    setReport(null)
    setLastReq(req)
    setPhase('lookup-loading')

    try {
      const result = await lookupProperty(req)
      setLookup(result)
      setPhase('lookup-done')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Lookup failed')
      setPhase('search')
    }
  }

  async function handleGenerateReport() {
    if (!lookup?.location_sk) return
    setError(null)
    setPhase('report-loading')

    try {
      const r = await generateReport(lookup.location_sk, lastReq.address)
      setReport(r)
      setPhase('report-done')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Report generation failed')
      setPhase('lookup-done')
    }
  }

  async function handleLoadHistorical(reportId: string) {
    setError(null)
    setPhase('report-loading')

    try {
      const r = await getReport(reportId)
      setReport(r)
      setPhase('report-done')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load report')
      setPhase('lookup-done')
    }
  }

  const isReportView = phase === 'report-done' && report

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-gray-900">

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-gray-200 px-6 py-3">
        <div className={`mx-auto flex items-center justify-between ${isReportView ? 'max-w-7xl' : 'max-w-lg'}`}>
          <div className="flex items-baseline gap-3">
            <span className="font-brand text-xl font-bold tracking-widest text-gray-900">
              CIVITAS
            </span>
            <span className="text-gray-400 text-xs hidden sm:inline">
              Municipal &amp; Tax Risk Intelligence
            </span>
          </div>
          {isReportView && (
            <button
              onClick={handleNewSearch}
              className="text-xs text-blue-600 hover:text-blue-500 font-semibold transition-colors"
            >
              New Search
            </button>
          )}
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────── */}
      <main className={`mx-auto px-4 py-8 ${isReportView ? 'max-w-7xl' : 'max-w-lg'}`}>

        {/* Search — vertically centered when no report */}
        {!isReportView && (
          <div className={phase === 'search' ? 'min-h-[60vh] flex flex-col justify-center' : ''}>

            <PropertySearch
              onSubmit={handleLookup}
              loading={phase === 'lookup-loading'}
            />

            {/* Error banner */}
            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-600
                              rounded-lg px-5 py-3 text-sm font-medium animate-fade-in">
                {error}
              </div>
            )}

            {/* Lookup loading skeleton */}
            {phase === 'lookup-loading' && (
              <div className="mt-6 space-y-3 animate-fade-in">
                <div className="skeleton h-5 w-48" />
                <div className="skeleton h-4 w-64" />
                <div className="skeleton h-10 w-44 mt-2" />
              </div>
            )}

            {/* Lookup result */}
            {(phase === 'lookup-done' || phase === 'report-loading') && lookup && (
              <div className="mt-6 bg-white shadow-sm border border-gray-200 rounded-xl p-5 animate-fade-in">
                {lookup.resolved ? (
                  <>
                    {lookup.warning && (
                      <div className="mb-3 bg-yellow-50 border border-yellow-200 text-yellow-700
                                      rounded-lg px-4 py-2 text-sm">
                        {lookup.warning}
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mb-1">
                      Match: <strong className="text-gray-600">{lookup.match_confidence}</strong>
                      {lookup.parcel_id && <> &middot; PIN: <strong className="text-gray-600">{lookup.parcel_id}</strong></>}
                    </p>
                    <p className="text-lg font-bold text-gray-900">{lookup.full_address}</p>
                    <button
                      onClick={handleGenerateReport}
                      disabled={phase === 'report-loading'}
                      className="mt-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-200 disabled:text-gray-400
                                 text-white font-semibold px-6 py-2 rounded-lg transition-colors text-sm"
                    >
                      {phase === 'report-loading' ? 'Generating report...' : 'Generate Risk Report'}
                    </button>

                    {/* Report History */}
                    {history.length > 0 && (
                      <div className="mt-5 border-t border-gray-200 pt-4">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                          Previous Reports
                          <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-mono">
                            {history.length}
                          </span>
                        </h4>
                        <div className="space-y-2">
                          {history.map(h => (
                            <button
                              key={h.report_id}
                              onClick={() => handleLoadHistorical(h.report_id)}
                              disabled={phase === 'report-loading'}
                              className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100
                                         border border-gray-200 rounded-lg px-4 py-2.5 text-left transition-colors
                                         disabled:opacity-50"
                            >
                              <span className="text-xs text-gray-500">
                                {new Date(h.generated_at).toLocaleString()}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-gray-700">
                                  Score: {h.risk_score}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tierColors[h.risk_tier] ?? 'bg-gray-100 text-gray-500'}`}>
                                  {h.risk_tier}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-red-600 font-medium">
                    {lookup.warning ?? 'Address match uncertain \u2013 manual verification recommended.'}
                  </div>
                )}
              </div>
            )}

            {/* Report loading skeleton */}
            {phase === 'report-loading' && (
              <div className="mt-6 space-y-4 animate-fade-in">
                <div className="skeleton h-24 w-full" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="skeleton h-48" />
                  <div className="skeleton h-48" />
                </div>
                <div className="skeleton h-32 w-full" />
              </div>
            )}
          </div>
        )}

        {/* Full report */}
        {isReportView && report && lookup && (
          <RiskReport
            report={report}
            locationSk={lookup.location_sk!}
            address={lastReq.address}
            lat={lookup.lat}
            lon={lookup.lon}
            onNewSearch={handleNewSearch}
          />
        )}

      </main>
    </div>
  )
}
