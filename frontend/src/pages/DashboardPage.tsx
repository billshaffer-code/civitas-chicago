import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getMyReports, getReport } from '../api/civitas'
import type { ReportHistoryItem } from '../api/civitas'

const tierColors: Record<string, string> = {
  LOW: 'bg-emerald-50 text-emerald-600',
  MODERATE: 'bg-yellow-50 text-yellow-600',
  ELEVATED: 'bg-orange-50 text-orange-600',
  HIGH: 'bg-red-50 text-red-600',
}

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [reports, setReports] = useState<ReportHistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMyReports()
      .then(setReports)
      .catch(() => setReports([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.full_name?.split(' ')[0]}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          CIVITAS Municipal &amp; Tax Risk Intelligence
        </p>
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <button
          onClick={() => navigate('/search')}
          className="bg-white shadow-sm border border-gray-200 rounded-xl p-6
                     text-left hover:border-blue-300 hover:shadow-md transition-all group"
        >
          <div className="text-2xl mb-2">&#128269;</div>
          <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
            Run Property Search
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Look up a Chicago address or PIN and generate a risk report
          </p>
        </button>

        <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
          <div className="text-2xl mb-2">&#128202;</div>
          <h3 className="font-semibold text-gray-900">Reports Generated</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {loading ? '--' : reports.length}
          </p>
          <p className="text-sm text-gray-500 mt-1">Total reports on your account</p>
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
            {reports.map((r) => (
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
                    Score: {r.risk_score}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tierColors[r.risk_tier] ?? 'bg-gray-100 text-gray-500'}`}>
                    {r.risk_tier}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
