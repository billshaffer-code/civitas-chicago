import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const isSearchPage = location.pathname === '/search'

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-gray-900">
      <header className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-gray-200 px-6 py-3">
        <div className={`mx-auto flex items-center justify-between ${isSearchPage ? 'max-w-7xl' : 'max-w-5xl'}`}>
          <div className="flex items-center gap-6">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-baseline gap-3 hover:opacity-80 transition-opacity"
            >
              <span className="font-brand text-xl font-bold tracking-widest text-gray-900">
                CIVITAS
              </span>
              <span className="text-gray-400 text-xs hidden sm:inline">
                Municipal &amp; Tax Risk Intelligence
              </span>
            </button>
            <nav className="flex items-center gap-4 ml-4">
              <button
                onClick={() => navigate('/dashboard')}
                className={`text-sm font-medium transition-colors ${
                  location.pathname === '/dashboard'
                    ? 'text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => navigate('/search')}
                className={`text-sm font-medium transition-colors ${
                  location.pathname === '/search'
                    ? 'text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Search
              </button>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:inline">
              {user?.full_name}
            </span>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-red-500 font-semibold transition-colors"
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
