import axios from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'

/**
 * These tests exercise the interceptor patterns in civitas.ts by creating
 * a fresh axios instance with equivalent interceptors for each test.
 * This avoids dynamic-import issues with Vite while testing the actual logic.
 */

function createTestClient(): AxiosInstance {
  const api = axios.create({
    baseURL: '',
    headers: { 'Content-Type': 'application/json' },
  })

  // Request interceptor (mirrors civitas.ts)
  api.interceptors.request.use((config) => {
    const token = localStorage.getItem('civitas_access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  // Response interceptor (mirrors civitas.ts)
  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error.config
      if (error.response?.status === 401 && !original._retry) {
        original._retry = true
        const refreshToken = localStorage.getItem('civitas_refresh_token')
        if (refreshToken) {
          try {
            const { data } = await axios.post(
              `${api.defaults.baseURL}/api/v1/auth/refresh`,
              { refresh_token: refreshToken },
              { headers: { 'Content-Type': 'application/json' } },
            )
            localStorage.setItem('civitas_access_token', data.access_token)
            localStorage.setItem('civitas_refresh_token', data.refresh_token)
            original.headers.Authorization = `Bearer ${data.access_token}`
            return api(original)
          } catch {
            localStorage.removeItem('civitas_access_token')
            localStorage.removeItem('civitas_refresh_token')
            window.location.href = '/login'
          }
        } else {
          window.location.href = '/login'
        }
      }
      return Promise.reject(error)
    },
  )

  return api
}

describe('civitas API client interceptors', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('request interceptor adds Bearer token from localStorage', async () => {
    localStorage.setItem('civitas_access_token', 'test-token')
    const api = createTestClient()

    let capturedAuth: string | undefined
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) => {
      capturedAuth = config.headers?.Authorization as string | undefined
      return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config })
    }) as unknown as typeof api.defaults.adapter

    await api.get('/test')
    expect(capturedAuth).toBe('Bearer test-token')
  })

  it('request interceptor omits Authorization when no token', async () => {
    const api = createTestClient()

    let capturedAuth: string | undefined
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) => {
      capturedAuth = config.headers?.Authorization as string | undefined
      return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config })
    }) as unknown as typeof api.defaults.adapter

    await api.get('/test')
    expect(capturedAuth).toBeUndefined()
  })

  it('response interceptor passes successful responses through', async () => {
    const api = createTestClient()
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) => {
      return Promise.resolve({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config })
    }) as unknown as typeof api.defaults.adapter

    const resp = await api.get('/test')
    expect(resp.data).toEqual({ ok: true })
  })

  it('response interceptor attempts refresh on 401', async () => {
    localStorage.setItem('civitas_access_token', 'old')
    localStorage.setItem('civitas_refresh_token', 'refresh-tok')

    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'new-at', refresh_token: 'new-rt', token_type: 'bearer' },
    })

    const api = createTestClient()
    let callCount = 0
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) => {
      callCount++
      if (callCount === 1) {
        return Promise.reject({
          response: { status: 401 },
          config: { ...config, headers: config.headers ?? {} },
        })
      }
      return Promise.resolve({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config })
    }) as unknown as typeof api.defaults.adapter

    const resp = await api.get('/test')
    expect(resp.data).toEqual({ ok: true })
    expect(postSpy).toHaveBeenCalled()
    expect(localStorage.getItem('civitas_access_token')).toBe('new-at')

    postSpy.mockRestore()
  })

  it('response interceptor redirects to /login when refresh fails', async () => {
    localStorage.setItem('civitas_access_token', 'old')
    localStorage.setItem('civitas_refresh_token', 'bad-refresh')

    const postSpy = vi.spyOn(axios, 'post').mockRejectedValue(new Error('refresh failed'))

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, href: '' },
    })

    const api = createTestClient()
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) => {
      return Promise.reject({
        response: { status: 401 },
        config: { ...config, headers: config.headers ?? {} },
      })
    }) as unknown as typeof api.defaults.adapter

    try { await api.get('/test') } catch { /* expected */ }

    expect(window.location.href).toBe('/login')
    expect(localStorage.getItem('civitas_access_token')).toBeNull()

    postSpy.mockRestore()
  })

  it('response interceptor redirects to /login when no refresh token', async () => {
    localStorage.setItem('civitas_access_token', 'old')

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, href: '' },
    })

    const api = createTestClient()
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) => {
      return Promise.reject({
        response: { status: 401 },
        config: { ...config, headers: config.headers ?? {} },
      })
    }) as unknown as typeof api.defaults.adapter

    try { await api.get('/test') } catch { /* expected */ }
    expect(window.location.href).toBe('/login')
  })

  it('response interceptor does not retry already-retried requests', async () => {
    localStorage.setItem('civitas_access_token', 'old')
    localStorage.setItem('civitas_refresh_token', 'rtok')

    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'new', refresh_token: 'new-r', token_type: 'bearer' },
    })

    const api = createTestClient()
    api.defaults.adapter = ((config: InternalAxiosRequestConfig & { _retry?: boolean }) => {
      return Promise.reject({
        response: { status: 401 },
        config: { ...config, headers: config.headers ?? {} },
      })
    }) as unknown as typeof api.defaults.adapter

    try { await api.get('/test') } catch { /* expected */ }
    expect(postSpy).toHaveBeenCalledTimes(1)

    postSpy.mockRestore()
  })
})
