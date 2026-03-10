import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/* ── Animated noise gradient background ───────────────────────────── */
function NoiseGradient() {
  return (
    <>
      <style>{`
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          25%  { background-position: 100% 25%; }
          50%  { background-position: 50% 100%; }
          75%  { background-position: 0% 75%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 20% 50%, rgba(226,232,240,0.6) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 20%, rgba(203,213,225,0.5) 0%, transparent 50%),
            radial-gradient(ellipse at 60% 80%, rgba(226,232,240,0.4) 0%, transparent 55%),
            radial-gradient(ellipse at 40% 30%, rgba(241,245,249,0.8) 0%, transparent 45%)
          `,
          backgroundSize: '200% 200%',
          animation: 'gradientShift 25s ease-in-out infinite',
        }}
      />
      <svg className="absolute inset-0 w-full h-full opacity-[0.03]">
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </>
  )
}

/* ── Feature item ────────────────────────────────────────────────── */
function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-100
                      flex items-center justify-center text-gray-500">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        <p className="text-xs text-gray-400 leading-relaxed mt-0.5">{desc}</p>
      </div>
    </div>
  )
}

/* ── Login page ──────────────────────────────────────────────────── */
export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else if (err && typeof err === 'object' && 'response' in err) {
        const resp = (err as { response: { status: number } }).response
        if (resp.status === 401) {
          setError('Invalid email or password')
        } else {
          setError('Login failed. Please try again.')
        }
      } else {
        setError('An unexpected error occurred.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel: branding + marketing ── */}
      <div className="hidden lg:flex lg:w-[52%] relative bg-white border-r border-gray-200 overflow-hidden
                      flex-col justify-between p-12">
        <NoiseGradient />

        {/* Top: brand */}
        <div className="relative z-10">
          <h1 className="font-brand text-3xl font-bold tracking-[0.25em] text-gray-900">
            CIVITAS
          </h1>
          <p className="text-gray-400 text-sm mt-1 tracking-wide">Municipal Intelligence</p>
        </div>

        {/* Center: headline + features */}
        <div className="relative z-10">
          <h2 className="text-2xl font-semibold text-gray-900 leading-snug max-w-md">
            Property intelligence<br />
            <span className="text-gray-500">built for due diligence.</span>
          </h2>
          <p className="text-gray-500 text-sm mt-4 max-w-md leading-relaxed">
            CIVITAS aggregates municipal records, code violations, permits, inspections,
            and tax liens into structured, explainable property reports — so you can
            close with confidence.
          </p>

          <div className="mt-8 space-y-5">
            <Feature
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              title="Deterministic Scoring"
              desc="Transparent, rule-based activity scores — no black boxes, no guesswork."
            />
            <Feature
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              title="Municipal Data Aggregation"
              desc="Violations, permits, inspections, 311 requests, and tax liens in one view."
            />
            <Feature
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              title="Portfolio Analysis"
              desc="Batch-process multiple properties and compare reports side by side."
            />
            <Feature
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              }
              title="Legally Cautious"
              desc="AI-generated narratives grounded in structured data with full citations."
            />
          </div>
        </div>

        {/* Bottom: tagline */}
        <p className="relative z-10 text-[11px] text-gray-400 tracking-wide">
          Built for real estate law firms and title companies.
        </p>
      </div>

      {/* ── Right panel: login form ── */}
      <div className="flex-1 flex items-center justify-center bg-[#f5f5f7] px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile-only branding */}
          <div className="text-center mb-8 lg:hidden">
            <h1 className="font-brand text-3xl font-bold tracking-widest text-gray-900">
              CIVITAS
            </h1>
            <p className="text-gray-400 text-sm mt-1">Municipal Intelligence</p>
          </div>

          <div className="lg:mb-8">
            <h2 className="text-2xl font-semibold text-gray-900">Welcome back</h2>
            <p className="text-gray-500 text-sm mt-1">Sign in to your account to continue.</p>
          </div>

          <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6 mt-6 lg:mt-0">
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2.5 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your password"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300
                           text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-gray-500">
              Don&apos;t have an account?{' '}
              <Link to="/signup" className="text-blue-600 hover:text-blue-500 font-medium">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
