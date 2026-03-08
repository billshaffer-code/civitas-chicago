import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  uploadBatch,
  createBatchEventSource,
  getBatch,
} from '../api/civitas'
import type { BatchSSEEvent, BatchItemStatus } from '../api/civitas'
import { LEVEL_CONFIG, type ActivityLevel } from '../constants/terminology'

type Phase = 'upload' | 'processing' | 'results'

export default function BatchPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [phase, setPhase] = useState<Phase>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [batchName, setBatchName] = useState('')
  const [preview, setPreview] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [batchId, setBatchId] = useState('')
  const [totalCount, setTotalCount] = useState(0)
  const [items, setItems] = useState<BatchItemStatus[]>([])
  const [completedCount, setCompletedCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [avgScore, setAvgScore] = useState<number | null>(null)
  const [levelDist, setLevelDist] = useState<Record<string, number>>({})
  const esRef = useRef<EventSource | null>(null)

  // Load existing batch from URL params
  const loadBatchId = searchParams.get('id')
  useEffect(() => {
    if (loadBatchId) {
      getBatch(loadBatchId)
        .then((batch) => {
          setBatchId(batch.batch_id)
          setTotalCount(batch.total_count)
          setItems(batch.items)
          setCompletedCount(batch.completed_count)
          setFailedCount(batch.failed_count)
          setAvgScore(batch.avg_activity_score ?? null)
          setLevelDist(batch.level_distribution)
          setPhase('results')
        })
        .catch(() => setError('Batch not found'))
    }
  }, [loadBatchId])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setError('')

    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const lines = text.split('\n').filter((l) => l.trim())
      // Skip header, show first 10 addresses
      setPreview(lines.slice(1, 11).map((l) => {
        const cols = l.split(',')
        return cols[0]?.replace(/^"|"$/g, '').trim() || l.trim()
      }))
    }
    reader.readAsText(f)
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const res = await uploadBatch(file, batchName || undefined)
      setBatchId(res.batch_id)
      setTotalCount(res.total_count)
      setItems(
        Array.from({ length: res.total_count }, (_, i) => ({
          row_index: i,
          input_address: preview[i] || `Address ${i + 1}`,
          status: 'pending',
        }))
      )
      setPhase('processing')
      startSSE(res.batch_id)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Upload failed'
      setError(msg)
    } finally {
      setUploading(false)
    }
  }

  const handleSSEDone = useCallback(() => {
    // Compute summary stats from items
    const scores: number[] = []
    const levels: Record<string, number> = {}
    // Use latest items from state via functional pattern
    setItems((current) => {
      for (const it of current) {
        if (it.activity_score != null) scores.push(it.activity_score)
        if (it.activity_level) levels[it.activity_level] = (levels[it.activity_level] || 0) + 1
      }
      setAvgScore(scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null)
      setLevelDist(levels)
      setPhase('results')
      return current
    })
  }, [])

  function startSSE(id: string) {
    const es = createBatchEventSource(id)
    esRef.current = es

    es.onmessage = (event) => {
      const data: BatchSSEEvent = JSON.parse(event.data)

      if (data.type === 'processing') {
        setItems((prev) =>
          prev.map((it) =>
            it.row_index === data.row_index ? { ...it, status: 'processing' } : it
          )
        )
      } else if (data.type === 'completed') {
        setCompletedCount((c) => c + 1)
        setItems((prev) =>
          prev.map((it) =>
            it.row_index === data.row_index
              ? {
                  ...it,
                  status: 'completed',
                  report_id: data.report_id,
                  activity_score: data.activity_score,
                  activity_level: data.activity_level,
                  flag_count: data.flag_count,
                }
              : it
          )
        )
      } else if (data.type === 'failed') {
        setFailedCount((c) => c + 1)
        setItems((prev) =>
          prev.map((it) =>
            it.row_index === data.row_index
              ? { ...it, status: 'failed', error_message: data.error }
              : it
          )
        )
      } else if (data.type === 'done') {
        es.close()
        handleSSEDone()
      }
    }

    es.onerror = () => {
      es.close()
      handleSSEDone()
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      esRef.current?.close()
    }
  }, [])

  const processed = completedCount + failedCount
  const progressPct = totalCount > 0 ? Math.round((processed / totalCount) * 100) : 0

  return (
    <div className={embedded ? '' : 'mx-auto max-w-7xl px-4 py-8'}>
      {!embedded && <h1 className="text-2xl font-bold text-gray-900 mb-6">Portfolio Analysis</h1>}

      {/* ── Upload Phase ─────────────────────────────────────── */}
      {phase === 'upload' && (
        <div className="space-y-6">
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload CSV</h2>
            <p className="text-sm text-gray-500 mb-4">
              Upload a CSV file with an address column. Maximum 50 rows.
              Accepted column names: address, property_address, full_address, street_address.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Batch Name (optional)
                </label>
                <input
                  type="text"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="e.g. Q1 2026 Portfolio"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
                />
              </div>

              <div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100"
                />
              </div>

              {preview.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Preview ({preview.length} addresses)
                  </h3>
                  <ul className="space-y-1">
                    {preview.map((addr, i) => (
                      <li key={i} className="text-sm text-gray-700 font-mono">
                        {addr}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
              >
                {uploading ? 'Uploading...' : 'Start Analysis'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Processing Phase ─────────────────────────────────── */}
      {phase === 'processing' && (
        <div className="space-y-6">
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Processing...</h2>
              <span className="text-sm text-gray-500">
                {processed} / {totalCount} ({progressPct}%)
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-6">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Items table */}
            <div className="space-y-2">
              {items.map((it) => {
                const levelCfg = it.activity_level ? LEVEL_CONFIG[it.activity_level as ActivityLevel] : null
                return (
                  <div
                    key={it.row_index}
                    className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <StatusIcon status={it.status} />
                      <span className="text-sm text-gray-700">{it.input_address}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {it.activity_score != null && (
                        <span className="text-xs font-mono text-gray-600">
                          Score: {it.activity_score}
                        </span>
                      )}
                      {it.activity_level && levelCfg && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${levelCfg.bgAccent}`}>
                          {it.activity_level}
                        </span>
                      )}
                      {it.error_message && (
                        <span className="text-xs text-red-500" title={it.error_message}>
                          Error
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Results Phase ────────────────────────────────────── */}
      {phase === 'results' && (
        <div className="space-y-6">
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Total</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totalCount}</p>
            </div>
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Completed</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{completedCount}</p>
            </div>
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Failed</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{failedCount}</p>
            </div>
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Avg Score</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">
                {avgScore != null ? avgScore : '--'}
              </p>
            </div>
          </div>

          {/* Level distribution */}
          {Object.keys(levelDist).length > 0 && (
            <div className="flex gap-2">
              {(['QUIET', 'TYPICAL', 'ACTIVE', 'COMPLEX'] as ActivityLevel[]).map((level) => {
                const count = levelDist[level]
                if (!count) return null
                const cfg = LEVEL_CONFIG[level]
                return (
                  <span
                    key={level}
                    className={`text-xs font-bold px-3 py-1 rounded-full ${cfg.bgAccent}`}
                  >
                    {level}: {count}
                  </span>
                )
              })}
            </div>
          )}

          {/* Results table */}
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Score</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Level</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Findings</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const levelCfg = it.activity_level ? LEVEL_CONFIG[it.activity_level as ActivityLevel] : null
                  return (
                    <tr
                      key={it.row_index}
                      onClick={() => it.report_id && navigate(`/search?report=${it.report_id}`)}
                      className={`border-b border-gray-100 transition-colors ${
                        it.report_id
                          ? 'cursor-pointer hover:bg-gray-50'
                          : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-gray-400">{it.row_index + 1}</td>
                      <td className="px-4 py-3 text-gray-900">{it.input_address}</td>
                      <td className="px-4 py-3 font-mono text-gray-700">
                        {it.activity_score ?? '--'}
                      </td>
                      <td className="px-4 py-3">
                        {it.activity_level && levelCfg ? (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${levelCfg.bgAccent}`}>
                            {it.activity_level}
                          </span>
                        ) : '--'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{it.flag_count ?? '--'}</td>
                      <td className="px-4 py-3">
                        <StatusIcon status={it.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => {
              setPhase('upload')
              setFile(null)
              setPreview([])
              setBatchName('')
              setItems([])
              setCompletedCount(0)
              setFailedCount(0)
              setAvgScore(null)
              setLevelDist({})
              setError('')
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
          >
            New Batch
          </button>
        </div>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') {
    return <span className="text-emerald-500 text-sm" title="Completed">&#10003;</span>
  }
  if (status === 'failed') {
    return <span className="text-red-500 text-sm" title="Failed">&#10007;</span>
  }
  if (status === 'processing') {
    return (
      <span className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" title="Processing" />
    )
  }
  return <span className="text-gray-300 text-sm" title="Pending">&#9679;</span>
}
