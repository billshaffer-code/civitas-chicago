import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getMyReports, getMyBatches } from '../api/civitas'
import type { ReportHistoryItem, BatchListItem } from '../api/civitas'
import { LEVEL_CONFIG, type ActivityLevel } from '../constants/terminology'

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [reports, setReports] = useState<ReportHistoryItem[]>([])
  const [batches, setBatches] = useState<BatchListItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    Promise.all([
      getMyReports().catch(() => [] as ReportHistoryItem[]),
      getMyBatches(5).catch(() => [] as BatchListItem[]),
    ])
      .then(([r, b]) => {
        setReports(r)
        setBatches(b)
      })
      .finally(() => setLoading(false))
  }, [])

  // Re-fetch every time we navigate to this page
  useEffect(() => {
    fetchData()
  }, [location.key, fetchData])

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.full_name?.split(' ')[0]}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          CIVITAS Municipal Intelligence
        </p>
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <button
          onClick={() => navigate('/search')}
          className="bg-white shadow-sm border border-gray-200 rounded-xl p-6
                     text-left hover:border-blue-300 hover:shadow-md transition-all group"
        >
          <div className="text-2xl mb-2">&#128269;</div>
          <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
            Property Search
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Look up an address or PIN
          </p>
        </button>

        <button
          onClick={() => navigate('/batch')}
          className="bg-white shadow-sm border border-gray-200 rounded-xl p-6
                     text-left hover:border-blue-300 hover:shadow-md transition-all group"
        >
          <div className="text-2xl mb-2">&#128203;</div>
          <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
            Portfolio Analysis
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Upload a CSV of addresses
          </p>
        </button>

        <button
          onClick={() => navigate('/compare')}
          className="bg-white shadow-sm border border-gray-200 rounded-xl p-6
                     text-left hover:border-blue-300 hover:shadow-md transition-all group"
        >
          <div className="text-2xl mb-2">&#128200;</div>
          <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
            Compare Reports
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Side-by-side comparison
          </p>
        </button>

        <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
          <div className="text-2xl mb-2">&#128202;</div>
          <h3 className="font-semibold text-gray-900">Reports Generated</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {loading ? '--' : reports.length}
          </p>
          <p className="text-sm text-gray-500 mt-1">Total reports</p>
        </div>
      </div>

      {/* Recent reports */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Reports</h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">No reports yet. Run a property search to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => {
              const levelCfg = LEVEL_CONFIG[r.activity_level as ActivityLevel]
              return (
                <button
                  key={r.report_id}
                  onClick={() => navigate(`/search?report=${r.report_id}`)}
                  className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100
                             border border-gray-200 rounded-lg px-4 py-3 text-left transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{r.query_address}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(r.generated_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-600">
                      Score: {r.activity_score}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${levelCfg?.bgAccent ?? 'bg-gray-100 text-gray-500'}`}>
                      {r.activity_level}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent batches */}
      {batches.length > 0 && (
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6 mt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Batches</h2>
          <div className="space-y-2">
            {batches.map((b) => (
              <button
                key={b.batch_id}
                onClick={() => navigate(`/batch?id=${b.batch_id}`)}
                className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100
                           border border-gray-200 rounded-lg px-4 py-3 text-left transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{b.batch_name ?? 'Unnamed Batch'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(b.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {b.completed_count}/{b.total_count} completed
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    b.status === 'completed'
                      ? 'bg-emerald-50 text-emerald-600'
                      : b.status === 'failed'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {b.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
