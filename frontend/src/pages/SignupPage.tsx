import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      await register(email, password, fullName, companyName || undefined)
      navigate('/dashboard')
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else if (err && typeof err === 'object' && 'response' in err) {
        const resp = (err as { response: { status: number } }).response
        setError(resp.status === 409 ? 'An account with this email already exists' : 'Registration failed. Please try again.')
      } else {
        setError('Registration failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const inputClass = `w-full h-[44px] bg-surface-raised border border-separator rounded-apple px-4
    text-[15px] text-ink-primary placeholder:text-ink-placeholder
    focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50
    transition-all duration-200 ease-apple`

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel: branding ── */}
      <div className="hidden lg:flex lg:w-[52%] relative bg-white border-r border-separator overflow-hidden flex-col justify-between p-12">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse at 20% 50%, rgba(0,113,227,0.04) 0%, transparent 60%),
              radial-gradient(ellipse at 80% 20%, rgba(0,113,227,0.03) 0%, transparent 50%)
            `,
          }}
        />

        <div className="relative z-10">
          <h1 className="font-brand text-[28px] font-black tracking-[0.3em] text-ink-primary">
            CIVITAS
          </h1>
          <p className="text-ink-quaternary text-[12px] mt-1 tracking-wide">Municipal Intelligence</p>
        </div>

        <div className="relative z-10 space-y-5">
          <h2 className="text-[26px] font-semibold text-ink-primary leading-[1.2] max-w-md tracking-tight">
            Property intelligence<br />
            <span className="text-ink-tertiary">built for due diligence.</span>
          </h2>
          <p className="text-ink-secondary text-[14px] max-w-md leading-[1.65]">
            Join firms that use CIVITAS to surface municipal findings before closing.
            Transparent scoring, structured data, legally cautious narratives.
          </p>
        </div>

        <p className="relative z-10 text-[11px] text-ink-quaternary tracking-wide">
          Built for real estate law firms and title companies.
        </p>
      </div>

      {/* ── Right panel: signup form ── */}
      <div className="flex-1 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">

          {/* Mobile-only branding */}
          <div className="text-center mb-8 lg:hidden">
            <h1 className="font-brand text-[24px] font-black tracking-[0.3em] text-ink-primary">CIVITAS</h1>
            <p className="text-ink-quaternary text-[12px] mt-1">Municipal Intelligence</p>
          </div>

          <div className="mb-7">
            <h2 className="text-[22px] font-semibold text-ink-primary tracking-tight">Create your account</h2>
            <p className="text-ink-secondary text-[14px] mt-1">Get started with CIVITAS in seconds.</p>
          </div>

          {error && (
            <div className="mb-5 bg-red-50/80 border border-red-200/70 text-red-700 rounded-apple px-4 py-3 text-[13px]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary mb-1.5">Full Name</label>
              <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                className={inputClass} placeholder="Jane Smith" />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary mb-1.5">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className={inputClass} placeholder="you@company.com" />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary mb-1.5">Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className={inputClass} placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary mb-1.5">Confirm Password</label>
              <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass} placeholder="Repeat your password" />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-secondary mb-1.5">
                Company <span className="text-ink-quaternary font-normal">(optional)</span>
              </label>
              <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                className={inputClass} placeholder="Your firm or company" />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-[44px] bg-accent hover:bg-accent-hover disabled:bg-ink-quaternary
                         text-white text-[15px] font-semibold rounded-apple
                         shadow-[0_1px_3px_rgba(0,113,227,0.4)] disabled:shadow-none
                         transition-all duration-150 ease-apple active:scale-[0.99]"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px] text-ink-secondary">
            Already have an account?{' '}
            <Link to="/login" className="text-accent hover:text-accent-hover font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
