import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import PropertySearch from '../components/PropertySearch'
import PropertyReport from '../components/PropertyReport'
import ParcelVerify from '../components/ParcelVerify'
import { lookupProperty, generateReport, getReportHistory, getReport, getReportSummary } from '../api/civitas'
import type { LookupRequest, LookupResponse, ReportResponse, ReportHistoryItem } from '../api/civitas'
import { LEVEL_CONFIG, type ActivityLevel } from '../constants/terminology'
import { useToast } from '../components/Toast'

type Phase = 'search' | 'lookup-loading' | 'lookup-done' | 'report-loading' | 'report-done'

export default function SearchPage({ embedded = false }: { embedded?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [phase, setPhase]       = useState<Phase>('search')
  const [lookup, setLookup]     = useState<LookupResponse | null>(null)
  const [report, setReport]     = useState<ReportResponse | null>(null)
  const [lastReq, setLastReq]   = useState<LookupRequest>({ address: '' })
  const [error, setError]       = useState<string | null>(null)
  const [history, setHistory]   = useState<ReportHistoryItem[]>([])
  const { toast } = useToast()

  // Load report or trigger search from URL params
  useEffect(() => {
    const reportId = searchParams.get('report')
    const queryAddr = searchParams.get('q')

    if (reportId) {
      setSearchParams({}, { replace: true })
      setPhase('report-loading')
      getReport(reportId)
        .then((r) => {
          setReport(r)
          setLookup({
            resolved: true,
            location_sk: undefined,
            full_address: r.property.address,
            match_confidence: r.match_confidence,
          })
          setLastReq({ address: r.property.address })
          setPhase('report-done')
        })
        .catch(() => {
          setError('Failed to load report')
          setPhase('search')
        })
    } else if (queryAddr) {
      setSearchParams({}, { replace: true })
      handleLookup({ address: queryAddr })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      toast('Report generated successfully')

      // Load AI summary in the background
      if (!r.ai_summary) {
        getReportSummary(r.report_id)
          .then(summary => {
            setReport(prev => prev ? { ...prev, ai_summary: summary } : prev)
          })
          .catch(() => {})
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Report generation failed'
      setError(msg)
      toast(msg, 'error')
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

  const isReportView = (phase === 'report-loading' || phase === 'report-done') && !!lookup?.resolved

  return (
    <div className={embedded ? '' : `mx-auto px-4 py-8 ${isReportView ? 'max-w-7xl' : 'max-w-2xl'}`}>
      {/* Search — vertically centered before report */}
      {!isReportView && (
        <div className={phase === 'search' ? 'min-h-[65vh] flex flex-col justify-center' : ''}>

          {/* Hero heading — only on initial search phase */}
          {phase === 'search' && (
            <div className="text-center mb-8 animate-apple-fade-in">
              <p className="font-brand text-[12px] font-black tracking-[0.3em] text-accent mb-4">CIVITAS</p>
              <h2 className="text-[32px] font-bold text-ink-primary tracking-tight leading-[1.1] mb-2">
                Search a Property
              </h2>
              <p className="text-[15px] text-ink-secondary">
                Chicago municipal intelligence — violations, permits, 311, tax liens.
              </p>
            </div>
          )}

          <PropertySearch
            onSubmit={handleLookup}
            loading={phase === 'lookup-loading'}
          />

          {/* Error banner */}
          {error && (
            <div className="mt-4 flex items-start gap-3 bg-red-50/80 border border-red-200/70 text-red-700 rounded-apple px-4 py-3 text-[13px] animate-apple-fade-in">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {/* Lookup loading skeleton */}
          {phase === 'lookup-loading' && (
            <div className="mt-5 bg-white shadow-apple-xs border border-separator rounded-apple-lg p-5 space-y-3 animate-apple-fade-in">
              <div className="flex items-center gap-3">
                <div className="skeleton w-9 h-9 rounded-apple-sm flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton skeleton-text w-3/4" />
                  <div className="skeleton skeleton-text w-1/3" />
                </div>
              </div>
              <div className="skeleton h-[44px] w-full rounded-apple" />
            </div>
          )}

          {/* Lookup result */}
          {(phase === 'lookup-done' || phase === 'report-loading') && lookup && (
            <>
              {lookup.resolved ? (
                <div className="mt-5 bg-white shadow-apple-xs border border-separator rounded-apple-lg p-5 animate-apple-fade-in">
                  {/* Warning if present */}
                  {lookup.warning && (
                    <div className="mb-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200/70 rounded-apple px-3.5 py-2.5 text-[12px] text-amber-700">
                      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      {lookup.warning}
                    </div>
                  )}

                  {/* Address row */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-apple-sm bg-accent-light flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[17px] font-semibold text-ink-primary leading-tight">{lookup.full_address}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          lookup.match_confidence === 'EXACT' ? 'bg-accent-light text-accent'
                          : lookup.match_confidence === 'HIGH' ? 'bg-blue-50 text-blue-600'
                          : 'bg-amber-50 text-amber-700'
                        }`}>
                          {lookup.match_confidence} MATCH
                        </span>
                        {lookup.parcel_id && (
                          <span className="text-[11px] text-ink-quaternary font-mono">PIN: {lookup.parcel_id}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Parcel verification */}
                  {lookup.parcel_id && (
                    <div className="mt-3">
                      <ParcelVerify pin={lookup.parcel_id} address={lastReq.address} mode="verify" />
                    </div>
                  )}

                  {/* Generate button */}
                  <button
                    onClick={handleGenerateReport}
                    disabled={phase === 'report-loading'}
                    className="mt-4 w-full h-[44px] bg-accent hover:bg-accent-hover disabled:bg-ink-quaternary
                               text-white text-[14px] font-semibold rounded-apple
                               shadow-[0_1px_3px_rgba(0,113,227,0.4)] disabled:shadow-none
                               transition-all duration-150 ease-apple active:scale-[0.99]
                               flex items-center justify-center gap-2"
                  >
                    {phase === 'report-loading' ? (
                      <>
                        <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Generating municipal profile…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Generate Report
                      </>
                    )}
                  </button>

                  {/* Report history */}
                  {history.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-separator">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-[11px] font-semibold text-ink-quaternary uppercase tracking-[0.08em]">Previous Reports</h4>
                        <span className="text-[10px] bg-surface-raised text-ink-quaternary px-1.5 py-0.5 rounded-full font-mono border border-separator">
                          {history.length}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {history.map(h => {
                          const levelCfg = LEVEL_CONFIG[h.activity_level as ActivityLevel]
                          const daysAgo = Math.floor((Date.now() - new Date(h.generated_at).getTime()) / (1000 * 60 * 60 * 24))
                          const timeLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`
                          return (
                            <button
                              key={h.report_id}
                              onClick={() => handleLoadHistorical(h.report_id)}
                              disabled={phase === 'report-loading'}
                              className="group w-full flex items-center gap-3 bg-surface-raised hover:bg-surface-sunken
                                         border border-separator rounded-apple px-4 py-3 text-left
                                         transition-all duration-150 ease-apple
                                         hover:shadow-apple-xs active:scale-[0.99] disabled:opacity-50"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-medium text-ink-primary">{timeLabel}</p>
                                <p className="text-[11px] text-ink-quaternary font-mono mt-0.5">
                                  {new Date(h.generated_at).toLocaleString()}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-[12px] font-bold text-ink-secondary tabular-nums">{h.activity_score}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${levelCfg?.bgAccent ?? 'bg-surface-sunken text-ink-quaternary'}`}>
                                  {h.activity_level}
                                </span>
                                <svg className="w-3.5 h-3.5 text-ink-quaternary group-hover:text-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg p-5 animate-apple-fade-in">
                    <div className="flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-apple-sm bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold text-ink-primary">Address not found</p>
                        <p className="text-[13px] text-ink-secondary mt-0.5">
                          {lookup.warning ?? 'Address match uncertain — manual verification recommended.'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <ParcelVerify address={lastReq.address} mode="search" />
                </div>
              )}
            </>
          )}

        </div>
      )}

      {/* Full report */}
      {isReportView && (
        <PropertyReport
          report={report ?? undefined}
          loading={phase === 'report-loading'}
          locationSk={lookup?.location_sk ?? 0}
          address={lastReq.address}
          lat={lookup?.lat}
          lon={lookup?.lon}
          parcelId={lookup?.parcel_id}
          onNewSearch={handleNewSearch}
        />
      )}
    </div>
  )
}
