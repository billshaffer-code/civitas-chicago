import { useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getNeighborhoodList, getNeighborhoodGeoJSON } from '../api/civitas'
import RecentActivityDropdown from './RecentActivityDropdown'

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/search',    label: 'Search' },
  { path: '/browse',    label: 'Browse' },
  { path: '/batch',     label: 'Portfolio' },
  { path: '/compare',       label: 'Compare' },
]

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Prefetch neighborhood data on app shell mount (cached, so dashboard loads instantly)
  useEffect(() => {
    getNeighborhoodList().catch(() => {})
    getNeighborhoodGeoJSON().catch(() => {})
  }, [])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const initial = user?.full_name?.charAt(0)?.toUpperCase() ?? '?'

  return (
    <div className="min-h-screen bg-surface-raised text-ink-primary">

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 bg-white/72 backdrop-blur-xl backdrop-saturate-[180%] border-b border-separator">
        <div className="mx-auto max-w-7xl h-[52px] px-6 flex items-center justify-between">

          {/* Left: logo + nav */}
          <div className="flex items-center gap-5">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2.5 hover:opacity-70 transition-opacity duration-150"
            >
              <span className="font-brand text-[16px] font-black tracking-[0.3em] text-ink-primary">
                CIVITAS
              </span>
              <span className="w-px h-3.5 bg-separator-opaque" />
              <span className="text-ink-quaternary text-[11px] hidden sm:inline tracking-wide">
                Municipal Intelligence
              </span>
            </button>

            <nav className="flex items-center gap-0.5">
              {NAV_ITEMS.map(({ path, label }) => {
                const isActive = location.pathname === path
                return (
                  <button
                    key={path}
                    onClick={() => navigate(path)}
                    className={`px-3 py-1.5 text-[13px] font-medium rounded-lg transition-colors duration-150 ${
                      isActive
                        ? 'text-accent bg-accent-light'
                        : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-raised'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Right: recent activity + avatar + sign out */}
          <div className="flex items-center gap-3">
            <RecentActivityDropdown />
            <div className="w-7 h-7 rounded-full bg-surface-sunken flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] font-bold text-ink-secondary select-none">{initial}</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-[12px] font-medium text-ink-tertiary hover:text-ink-primary transition-colors duration-150"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <Outlet />
    </div>
  )
}
