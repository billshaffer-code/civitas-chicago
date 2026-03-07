import { useState, useEffect, useCallback } from 'react'
import { browseData, getTableList } from '../api/civitas'
import type { BrowseResponse, TableInfo } from '../api/civitas'

// ── Column definitions per table ─────────────────────────────────────────────

type ColDef = { key: string; label: string }

const TABLE_COLUMNS: Record<string, ColDef[]> = {
  violations: [
    { key: 'address', label: 'Address' },
    { key: 'violation_date', label: 'Date' },
    { key: 'violation_code', label: 'Code' },
    { key: 'violation_status', label: 'Status' },
    { key: 'violation_description', label: 'Description' },
    { key: 'inspection_status', label: 'Inspection' },
  ],
  inspections: [
    { key: 'address', label: 'Address' },
    { key: 'inspection_date', label: 'Date' },
    { key: 'dba_name', label: 'Business' },
    { key: 'facility_type', label: 'Facility' },
    { key: 'risk_level', label: 'Risk Level' },
    { key: 'results', label: 'Result' },
  ],
  permits: [
    { key: 'address', label: 'Address' },
    { key: 'permit_number', label: 'Permit #' },
    { key: 'permit_type', label: 'Type' },
    { key: 'permit_status', label: 'Status' },
    { key: 'application_start_date', label: 'Applied' },
    { key: 'issue_date', label: 'Issued' },
    { key: 'processing_time', label: 'Days' },
  ],
  service_311: [
    { key: 'address', label: 'Address' },
    { key: 'source_id', label: 'ID' },
    { key: 'sr_type', label: 'Type' },
    { key: 'sr_short_code', label: 'Code' },
    { key: 'status', label: 'Status' },
    { key: 'created_date', label: 'Created' },
    { key: 'closed_date', label: 'Closed' },
  ],
  tax_liens: [
    { key: 'address', label: 'Address' },
    { key: 'tax_sale_year', label: 'Year' },
    { key: 'lien_type', label: 'Type' },
    { key: 'sold_at_sale', label: 'Sold' },
    { key: 'total_amount_offered', label: 'Amount' },
    { key: 'buyer_name', label: 'Buyer' },
  ],
  vacant_buildings: [
    { key: 'address', label: 'Address' },
    { key: 'docket_number', label: 'Docket' },
    { key: 'issued_date', label: 'Date' },
    { key: 'violation_type', label: 'Violation' },
    { key: 'disposition_description', label: 'Disposition' },
    { key: 'current_amount_due', label: 'Due' },
    { key: 'total_paid', label: 'Paid' },
  ],
}

// ── Utilities ────────────────────────────────────────────────────────────────

function formatCell(v: unknown): string {
  if (v == null) return '\u2014'
  if (typeof v === 'number') return v.toLocaleString()
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toLocaleDateString()
  }
  return s
}

function exportCsv(rows: Record<string, unknown>[], columns: ColDef[], filename: string) {
  const header = columns.map(c => c.label).join(',')
  const body = rows.map(row =>
    columns.map(c => {
      const val = formatCell(row[c.key])
      if (/[,"\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`
      return val
    }).join(',')
  ).join('\n')
  const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Page Size Options ────────────────────────────────────────────────────────

const PAGE_SIZES = [25, 50, 100]

// ── Main Component ───────────────────────────────────────────────────────────

export default function BrowsePage() {
  const [tables, setTables] = useState<TableInfo[]>([])
  const [activeTable, setActiveTable] = useState('violations')
  const [data, setData] = useState<BrowseResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [debouncedFilter, setDebouncedFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  // Load table list on mount
  useEffect(() => {
    getTableList().then(setTables).catch(() => {})
  }, [])

  // Debounce filter
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilter(filter), 400)
    return () => clearTimeout(timer)
  }, [filter])

  // Reset page when filter or table changes
  useEffect(() => {
    setPage(1)
    setExpandedRow(null)
  }, [debouncedFilter, activeTable])

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true)
    setExpandedRow(null)
    try {
      const result = await browseData({
        table: activeTable,
        page,
        page_size: pageSize,
        filter: debouncedFilter || undefined,
        sort: sortCol || undefined,
        sort_dir: sortDir,
      })
      setData(result)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [activeTable, page, pageSize, debouncedFilter, sortCol, sortDir])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function handleTabSwitch(key: string) {
    setActiveTable(key)
    setFilter('')
    setDebouncedFilter('')
    setSortCol(null)
    setSortDir('desc')
    setPage(1)
  }

  function handleSort(colKey: string) {
    if (sortCol !== colKey) {
      setSortCol(colKey)
      setSortDir('desc')
    } else if (sortDir === 'desc') {
      setSortDir('asc')
    } else {
      setSortCol(null)
      setSortDir('desc')
    }
    setPage(1)
  }

  function handlePageSizeChange(size: number) {
    setPageSize(size)
    setPage(1)
  }

  const columns = TABLE_COLUMNS[activeTable] ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1
  const rows = data?.rows ?? []

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Browse Data</h1>
        <p className="text-sm text-gray-500 mt-1">
          Explore Chicago municipal datasets
        </p>
      </div>

      {/* ── Table Card ───────────────────────────────────────────── */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">

        {/* Tab bar */}
        <div className="flex overflow-x-auto border-b border-gray-200">
          {tables.map(t => {
            const isActive = t.key === activeTable
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
                  {t.count.toLocaleString()}
                </span>
              </button>
            )
          })}
        </div>

        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-gray-100 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter by address or any column..."
                className="w-full pl-9 pr-4 bg-gray-50 border border-gray-200 rounded-lg py-2 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-gray-400">
              {data ? `${data.total.toLocaleString()} records` : '--'}
            </span>
            <select
              value={pageSize}
              onChange={e => handlePageSizeChange(Number(e.target.value))}
              className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
            >
              {PAGE_SIZES.map(s => (
                <option key={s} value={s}>{s} per page</option>
              ))}
            </select>
            {rows.length > 0 && (
              <button
                onClick={() => exportCsv(rows, columns, `civitas_${activeTable}.csv`)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-blue-600 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export CSV
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="skeleton h-10 w-full rounded" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-400 italic p-6">
              {debouncedFilter ? 'No matching records.' : 'No records found.'}
            </p>
          ) : (
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#e5e7eb]">
                <tr>
                  {columns.map(col => {
                    const isSorted = sortCol === col.key
                    const arrow = isSorted ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ' \u21C5'
                    return (
                      <th key={col.key} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap bg-white">
                        <button
                          onClick={() => handleSort(col.key)}
                          className={`inline-flex items-center gap-0.5 transition-colors ${isSorted ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          {col.label}
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
                          : i % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/30 hover:bg-gray-100/50'
                      }`}
                    >
                      {columns.map(col => (
                        <td
                          key={col.key}
                          className={`px-3 py-2 text-gray-700 ${isExpanded ? 'whitespace-pre-wrap break-words' : 'max-w-xs truncate'}`}
                        >
                          {formatCell(row[col.key])}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-xs font-semibold text-gray-500 hover:text-blue-600 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {buildPageNumbers(page, totalPages).map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`e${idx}`} className="text-xs text-gray-300 px-1">&hellip;</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setPage(item as number)}
                    className={`min-w-[28px] h-7 rounded text-xs font-semibold transition-colors ${
                      page === item
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {item}
                  </button>
                )
              )}
            </div>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="text-xs font-semibold text-gray-500 hover:text-blue-600 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

function buildPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  const pages = Array.from({ length: total }, (_, i) => i + 1)
    .filter(i => i === 1 || i === total || Math.abs(i - current) <= 2)

  const result: (number | 'ellipsis')[] = []
  for (let i = 0; i < pages.length; i++) {
    if (i > 0 && pages[i] - pages[i - 1] > 1) result.push('ellipsis')
    result.push(pages[i])
  }
  return result
}
