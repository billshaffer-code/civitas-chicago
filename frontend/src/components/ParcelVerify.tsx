import { useState } from 'react'
import { searchParcels, verifyParcel } from '../api/civitas'
import type { AssessmentRecord } from '../api/civitas'

interface Props {
  pin?: string | null
  address: string
  mode: 'verify' | 'search'
}

export default function ParcelVerify({ pin, address, mode }: Props) {
  const [results, setResults] = useState<AssessmentRecord[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAction() {
    setLoading(true)
    setError(null)
    try {
      if (mode === 'verify' && pin) {
        setResults(await verifyParcel(pin))
      } else {
        setResults(await searchParcels(address))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed')
    } finally {
      setLoading(false)
    }
  }

  // Verify mode: compact inline
  if (mode === 'verify' && !results && !loading) {
    return (
      <button
        onClick={handleAction}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-tertiary hover:text-accent transition-colors duration-150"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Verify with Cook County
      </button>
    )
  }

  // Search mode: show as a card with button
  if (mode === 'search' && !results && !loading) {
    return (
      <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg p-4 animate-apple-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-apple-sm bg-blue-50 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-ink-primary">Search Cook County Assessor</p>
            <p className="text-[11px] text-ink-tertiary mt-0.5">Look up this address in the county records</p>
          </div>
          <button
            onClick={handleAction}
            className="h-[32px] px-3.5 bg-surface-raised hover:bg-surface-sunken text-ink-secondary hover:text-ink-primary
                       text-[12px] font-medium rounded-apple-sm border border-separator
                       transition-all duration-150 ease-apple flex-shrink-0"
          >
            Search
          </button>
        </div>
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg p-4 animate-apple-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-separator border-t-accent animate-spin" />
          <span className="text-[12px] text-ink-secondary">
            {mode === 'verify' ? 'Verifying with Cook County…' : 'Searching Cook County…'}
          </span>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg p-4 animate-apple-fade-in">
        <p className="text-[12px] text-ink-secondary">{error}</p>
      </div>
    )
  }

  // Results
  if (!results || results.length === 0) {
    return (
      <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg p-4 animate-apple-fade-in">
        <p className="text-[12px] text-ink-quaternary">No matching parcels found in Cook County records.</p>
      </div>
    )
  }

  // Deduplicate by PIN — show only the most recent year per PIN
  const byPin = results.reduce<Record<string, AssessmentRecord>>((acc, r) => {
    const p = r.pin ?? 'unknown'
    if (!acc[p] || Number(r.tax_year ?? 0) > Number(acc[p].tax_year ?? 0)) {
      acc[p] = r
    }
    return acc
  }, {})
  const unique = Object.values(byPin)

  return (
    <div className="bg-white shadow-apple-xs border border-separator rounded-apple-lg overflow-hidden animate-apple-fade-in">
      <div className="px-4 py-3 border-b border-separator flex items-center justify-between">
        <h4 className="text-[11px] font-semibold text-ink-quaternary uppercase tracking-[0.08em]">
          Cook County {mode === 'verify' ? 'Verification' : 'Results'}
        </h4>
        <span className="text-[10px] text-ink-quaternary font-mono">{unique.length} parcel{unique.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="divide-y divide-separator">
        {unique.map((r) => (
          <div key={r.pin} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink-primary">
                  {r.property_address ?? '—'}
                </p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-[10px] font-mono text-ink-quaternary">PIN: {r.pin}</span>
                  {r.property_class && (
                    <span className="text-[10px] text-ink-tertiary">Class: {r.property_class}</span>
                  )}
                  {r.tax_year && (
                    <span className="text-[10px] text-ink-tertiary">Year: {r.tax_year}</span>
                  )}
                </div>
              </div>
              {r.certified_total && (
                <div className="text-right flex-shrink-0">
                  <p className="text-[14px] font-bold text-ink-primary tabular-nums">
                    ${Number(r.certified_total).toLocaleString()}
                  </p>
                  <p className="text-[9px] text-ink-quaternary">Assessed</p>
                </div>
              )}
            </div>
            {(r.land_square_feet || r.building_square_feet) && (
              <div className="flex gap-4 mt-2">
                {r.land_square_feet && (
                  <span className="text-[10px] text-ink-tertiary">
                    Land: {Number(r.land_square_feet).toLocaleString()} SF
                  </span>
                )}
                {r.building_square_feet && (
                  <span className="text-[10px] text-ink-tertiary">
                    Bldg: {Number(r.building_square_feet).toLocaleString()} SF
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="px-4 py-2 bg-surface-raised border-t border-separator">
        <p className="text-[9px] text-ink-quaternary">Source: Cook County Assessor</p>
      </div>
    </div>
  )
}
