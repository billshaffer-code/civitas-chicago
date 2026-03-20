import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/* ── Feature item ────────────────────────────────────────────────── */
function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-9 h-9 rounded-apple-sm bg-accent-light flex items-center justify-center text-accent">
        {icon}
      </div>
      <div>
        <p className="text-[13px] font-semibold text-ink-primary">{title}</p>
        <p className="text-[12px] text-ink-tertiary leading-[1.6] mt-0.5">{desc}</p>
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
        setError(resp.status === 401 ? 'Invalid email or password' : 'Login failed. Please try again.')
      } else {
        setError('An unexpected error occurred.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel: branding ── */}
      <div className="hidden lg:flex lg:w-[52%] relative bg-white border-r border-separator overflow-hidden flex-col justify-between p-12">
        {/* Subtle radial gradient background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse at 20% 50%, rgba(0,113,227,0.04) 0%, transparent 60%),
              radial-gradient(ellipse at 80% 20%, rgba(0,113,227,0.03) 0%, transparent 50%),
              radial-gradient(ellipse at 60% 80%, rgba(0,113,227,0.02) 0%, transparent 55%)
            `,
          }}
        />

        {/* Top: brand */}
        <div className="relative z-10">
          <h1 className="font-brand text-[28px] font-black tracking-[0.3em] text-ink-primary">
            CIVITAS
          </h1>
          <p className="text-ink-quaternary text-[12px] mt-1 tracking-wide">Municipal Intelligence</p>
        </div>

        {/* Center: headline + features */}
        <div className="relative z-10">
          <h2 className="text-[26px] font-semibold text-ink-primary leading-[1.2] max-w-md tracking-tight">
            Property intelligence<br />
            <span className="text-ink-tertiary">built for due diligence.</span>
          </h2>
          <p className="text-ink-secondary text-[14px] mt-4 max-w-md leading-[1.65]">
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

        {/* Bottom */}
        <p className="relative z-10 text-[11px] text-ink-quaternary tracking-wide">
          Built for real estate law firms and title companies.
        </p>
      </div>

      {/* ── Right panel: login form ── */}
      <div className="flex-1 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">

          {/* Mobile-only branding */}
          <div className="text-center mb-8 lg:hidden">
            <h1 className="font-brand text-[24px] font-black tracking-[0.3em] text-ink-primary">
              CIVITAS
            </h1>
            <p className="text-ink-quaternary text-[12px] mt-1">Municipal Intelligence</p>
          </div>

          <div className="mb-7">
            <h2 className="text-[22px] font-semibold text-ink-primary tracking-tight">Welcome back</h2>
            <p className="text-ink-secondary text-[14px] mt-1">Sign in to your account to continue.</p>
          </div>

          {error && (
            <div className="mb-5 bg-red-50/80 border border-red-200/70 text-red-700 rounded-apple px-4 py-3 text-[13px]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-[44px] bg-surface-raised border border-separator rounded-apple px-4
                           text-[15px] text-ink-primary placeholder:text-ink-placeholder
                           focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50
                           transition-all duration-200 ease-apple"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-[44px] bg-surface-raised border border-separator rounded-apple px-4
                           text-[15px] text-ink-primary placeholder:text-ink-placeholder
                           focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50
                           transition-all duration-200 ease-apple"
                placeholder="Enter your password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-[44px] bg-accent hover:bg-accent-hover disabled:bg-ink-quaternary
                         text-white text-[15px] font-semibold rounded-apple
                         shadow-[0_1px_3px_rgba(0,113,227,0.4)] disabled:shadow-none
                         transition-all duration-150 ease-apple active:scale-[0.99]"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px] text-ink-secondary">
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="text-accent hover:text-accent-hover font-medium transition-colors">
              Create one
            </Link>
          </p>

          <p className="mt-3 text-center text-[13px] text-ink-tertiary">
            <Link to="/learn-more" className="hover:text-ink-secondary transition-colors">
              Learn more about CIVITAS &rarr;
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
