import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
  headers: { 'Content-Type': 'application/json' },
})

// ── Auth interceptors ────────────────────────────────────────────────────────

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('civitas_access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refreshToken = localStorage.getItem('civitas_refresh_token')
      if (refreshToken) {
        try {
          const { data } = await axios.post<TokenResponse>(
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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LookupRequest {
  address: string
  pin?: string
}

export interface LookupResponse {
  resolved: boolean
  location_sk?: number
  full_address?: string
  house_number?: string
  street_direction?: string
  street_name?: string
  street_type?: string
  zip?: string
  lat?: number
  lon?: number
  parcel_id?: string
  match_confidence: string
  warning?: string
}

export interface FlagResult {
  flag_code: string
  category: string
  description: string
  severity_score: number
  supporting_count: number
}

export interface ReportResponse {
  report_id: string
  generated_at: string
  property: { address: string; zip?: string; city: string; state: string }
  match_confidence: string
  risk_score: number
  risk_tier: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH'
  triggered_flags: FlagResult[]
  supporting_records: {
    violations: Record<string, unknown>[]
    inspections: Record<string, unknown>[]
    permits: Record<string, unknown>[]
    tax_liens: Record<string, unknown>[]
    service_311: Record<string, unknown>[]
    vacant_buildings: Record<string, unknown>[]
  }
  ai_summary: string
  data_freshness: Record<string, string | null>
  pdf_url?: string
  disclaimer: string
}

export interface AutocompleteItem {
  location_sk: number
  full_address: string
}

export interface ReportHistoryItem {
  report_id: string
  query_address: string
  risk_score: number
  risk_tier: string
  generated_at: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface UserResponse {
  user_id: string
  email: string
  full_name: string
  company_name?: string | null
  created_at: string
}

// ── Auth API calls ───────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>('/api/v1/auth/login', { email, password })
  return data
}

export async function register(
  email: string,
  password: string,
  full_name: string,
  company_name?: string,
): Promise<UserResponse> {
  const { data } = await api.post<UserResponse>('/api/v1/auth/register', {
    email,
    password,
    full_name,
    company_name: company_name || undefined,
  })
  return data
}

export async function getMe(): Promise<UserResponse> {
  const { data } = await api.get<UserResponse>('/api/v1/auth/me')
  return data
}

export async function getMyReports(limit = 20): Promise<ReportHistoryItem[]> {
  const { data } = await api.get<ReportHistoryItem[]>('/api/v1/report/my-reports', {
    params: { limit },
  })
  return data
}

// ── Existing API calls ───────────────────────────────────────────────────────

export async function lookupProperty(req: LookupRequest): Promise<LookupResponse> {
  const { data } = await api.post<LookupResponse>('/api/v1/property/lookup', req)
  return data
}

export async function generateReport(location_sk: number, address: string): Promise<ReportResponse> {
  const { data } = await api.post<ReportResponse>('/api/v1/report/generate', {
    location_sk,
    address,
  })
  return data
}

export async function autocompleteAddress(q: string): Promise<AutocompleteItem[]> {
  const { data } = await api.get<AutocompleteItem[]>('/api/v1/property/autocomplete', { params: { q } })
  return data
}

export async function getReportHistory(location_sk: number): Promise<ReportHistoryItem[]> {
  const { data } = await api.get<ReportHistoryItem[]>('/api/v1/report/history', { params: { location_sk } })
  return data
}

export async function getReport(report_id: string): Promise<ReportResponse> {
  const { data } = await api.get<ReportResponse>(`/api/v1/report/${report_id}`)
  return data
}

export async function downloadPdf(location_sk: number, address: string): Promise<Blob> {
  const { data } = await api.post(
    '/api/v1/report/generate?format=pdf',
    { location_sk, address },
    { responseType: 'blob' },
  )
  return data
}
