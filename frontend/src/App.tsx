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

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ── Nav ──────────────────────────────────────────────────── */}
      <header className="bg-blue-900 text-white px-6 py-4 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <span className="text-2xl font-black tracking-widest">CIVITAS</span>
            <span className="ml-3 text-blue-300 text-sm">Municipal &amp; Tax Risk Intelligence · Chicago v1</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* ── Search form (always visible) ─────────────────────── */}
        <PropertySearch
          onSubmit={handleLookup}
          loading={phase === 'lookup-loading'}
        />

        {/* ── Error banner ─────────────────────────────────────── */}
        {error && (
          <div className="mt-4 bg-red-50 border border-red-300 text-red-800
                          rounded-lg px-5 py-3 text-sm font-medium">
            {error}
          </div>
        )}

        {/* ── Lookup result ────────────────────────────────────── */}
        {phase === 'lookup-loading' && (
          <div className="mt-6 text-center text-gray-500 text-sm">Resolving address…</div>
        )}

        {(phase === 'lookup-done' || phase === 'report-loading') && lookup && (
          <div className="mt-6 bg-white rounded-xl shadow p-5">
            {lookup.resolved ? (
              <>
                {lookup.warning && (
                  <div className="mb-3 bg-yellow-50 border border-yellow-300 text-yellow-800
                                  rounded px-4 py-2 text-sm">
                    ⚠ {lookup.warning}
                  </div>
                )}
                <p className="text-sm text-gray-500 mb-1">
                  Match: <strong>{lookup.match_confidence}</strong>
                  {lookup.parcel_id && <> · PIN: <strong>{lookup.parcel_id}</strong></>}
                </p>
                <p className="text-lg font-bold text-gray-900">{lookup.full_address}</p>
                <button
                  onClick={handleGenerateReport}
                  disabled={phase === 'report-loading'}
                  className="mt-4 bg-blue-700 hover:bg-blue-800 disabled:bg-gray-400
                             text-white font-semibold px-6 py-2 rounded-lg transition-colors text-sm"
                >
                  {phase === 'report-loading' ? 'Generating report…' : 'Generate Risk Report'}
                </button>
              </>
            ) : (
              <div className="text-red-700 font-medium">
                {lookup.warning ?? 'Address match uncertain – manual verification recommended.'}
              </div>
            )}
          </div>
        )}

        {/* ── Full report ──────────────────────────────────────── */}
        {phase === 'report-done' && report && lookup && (
          <RiskReport
            report={report}
            locationSk={lookup.location_sk!}
            address={lastReq.address}
          />
        )}

      </main>
    </div>
  )
}
