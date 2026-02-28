import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
  headers: { 'Content-Type': 'application/json' },
})

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
  }
  ai_summary: string
  data_freshness: Record<string, string | null>
  pdf_url?: string
  disclaimer: string
}

// ── API calls ─────────────────────────────────────────────────────────────────

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

export async function downloadPdf(location_sk: number, address: string): Promise<Blob> {
  const { data } = await api.post(
    '/api/v1/report/generate?format=pdf',
    { location_sk, address },
    { responseType: 'blob' },
  )
  return data
}
