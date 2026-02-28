import { useState } from 'react'
import PropertySearch from './components/PropertySearch'
import RiskReport from './components/RiskReport'
import { lookupProperty, generateReport } from './api/civitas'
import type { LookupRequest, LookupResponse, ReportResponse } from './api/civitas'

type Phase = 'search' | 'lookup-loading' | 'lookup-done' | 'report-loading' | 'report-done'

export default function App() {
  const [phase, setPhase]       = useState<Phase>('search')
  const [lookup, setLookup]     = useState<LookupResponse | null>(null)
  const [report, setReport]     = useState<ReportResponse | null>(null)
  const [lastReq, setLastReq]   = useState<LookupRequest>({ address: '' })
  const [error, setError]       = useState<string | null>(null)

  function handleNewSearch() {
    setPhase('search')
    setLookup(null)
    setReport(null)
    setError(null)
    setLastReq({ address: '' })
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

  const isReportView = phase === 'report-done' && report

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="bg-slate-900/80 backdrop-blur border-b border-slate-800 px-6 py-3">
        <div className={`mx-auto flex items-center justify-between ${isReportView ? 'max-w-7xl' : 'max-w-lg'}`}>
          <div className="flex items-baseline gap-3">
            <span className="font-brand text-xl font-extrabold tracking-widest text-slate-100">
              CIVITAS
            </span>
            <span className="text-slate-500 text-xs hidden sm:inline">
              Municipal &amp; Tax Risk Intelligence
            </span>
          </div>
          {isReportView && (
            <button
              onClick={handleNewSearch}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
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
              <div className="mt-4 bg-red-500/10 border border-red-500/30 text-red-400
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
              <div className="mt-6 bg-slate-900 border border-slate-700/50 rounded-xl p-5 animate-fade-in">
                {lookup.resolved ? (
                  <>
                    {lookup.warning && (
                      <div className="mb-3 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400
                                      rounded-lg px-4 py-2 text-sm">
                        {lookup.warning}
                      </div>
                    )}
                    <p className="text-xs text-slate-500 mb-1">
                      Match: <strong className="text-slate-400">{lookup.match_confidence}</strong>
                      {lookup.parcel_id && <> &middot; PIN: <strong className="text-slate-400">{lookup.parcel_id}</strong></>}
                    </p>
                    <p className="text-lg font-bold text-slate-100">{lookup.full_address}</p>
                    <button
                      onClick={handleGenerateReport}
                      disabled={phase === 'report-loading'}
                      className="mt-4 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500
                                 text-white font-semibold px-6 py-2 rounded-lg transition-colors text-sm"
                    >
                      {phase === 'report-loading' ? 'Generating report...' : 'Generate Risk Report'}
                    </button>
                  </>
                ) : (
                  <div className="text-red-400 font-medium">
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
            onNewSearch={handleNewSearch}
          />
        )}

      </main>
    </div>
  )
}
