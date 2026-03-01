import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { login as apiLogin, register as apiRegister, getMe } from '../api/civitas'
import type { UserResponse } from '../api/civitas'

interface AuthContextType {
  user: UserResponse | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, fullName: string, companyName?: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('civitas_access_token')
    if (token) {
      getMe()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('civitas_access_token')
          localStorage.removeItem('civitas_refresh_token')
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await apiLogin(email, password)
    localStorage.setItem('civitas_access_token', tokens.access_token)
    localStorage.setItem('civitas_refresh_token', tokens.refresh_token)
    const me = await getMe()
    setUser(me)
  }, [])

  const register = useCallback(async (
    email: string,
    password: string,
    fullName: string,
    companyName?: string,
  ) => {
    await apiRegister(email, password, fullName, companyName)
    // Auto-login after registration
    const tokens = await apiLogin(email, password)
    localStorage.setItem('civitas_access_token', tokens.access_token)
    localStorage.setItem('civitas_refresh_token', tokens.refresh_token)
    const me = await getMe()
    setUser(me)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('civitas_access_token')
    localStorage.removeItem('civitas_refresh_token')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
