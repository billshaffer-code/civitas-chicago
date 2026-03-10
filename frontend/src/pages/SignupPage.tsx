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
        <filter id="grain-signup">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-signup)" />
      </svg>
    </>
  )
}

export default function SignupPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      await register(email, password, fullName, companyName || undefined)
      navigate('/dashboard')
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else if (err && typeof err === 'object' && 'response' in err) {
        const resp = (err as { response: { status: number } }).response
        if (resp.status === 409) {
          setError('An account with this email already exists')
        } else {
          setError('Registration failed. Please try again.')
        }
      } else {
        setError('Registration failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel: branding ── */}
      <div className="hidden lg:flex lg:w-[52%] relative bg-white border-r border-gray-200 overflow-hidden
                      flex-col justify-between p-12">
        <NoiseGradient />

        <div className="relative z-10">
          <h1 className="font-brand text-3xl font-bold tracking-[0.25em] text-gray-900">
            CIVITAS
          </h1>
          <p className="text-gray-400 text-sm mt-2 tracking-wide">Municipal Intelligence</p>
        </div>

        <div className="relative z-10 space-y-5">
          <h2 className="text-2xl font-semibold text-gray-900 leading-relaxed max-w-md">
            Property intelligence<br />
            <span className="text-gray-500">built for due diligence.</span>
          </h2>
          <p className="text-gray-500 text-sm max-w-md leading-relaxed">
            Join firms that use CIVITAS to surface municipal findings before closing.
            Transparent scoring, structured data, legally cautious narratives.
          </p>
        </div>

        <p className="relative z-10 text-[11px] text-gray-400 tracking-wide">
          Built for real estate law firms and title companies.
        </p>
      </div>

      {/* ── Right panel: signup form ── */}
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
            <h2 className="text-2xl font-semibold text-gray-900">Create your account</h2>
            <p className="text-gray-500 text-sm mt-1">Get started with CIVITAS in seconds.</p>
          </div>

          <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6 mt-6 lg:mt-0">
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2.5 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Jane Smith"
                />
              </div>
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
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Repeat your password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Your firm or company"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300
                           text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-gray-500">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-600 hover:text-blue-500 font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
