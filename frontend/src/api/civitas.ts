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
  action_group: string
}

export interface ReportResponse {
  report_id: string
  generated_at: string
  property: { address: string; zip?: string; city: string; state: string }
  match_confidence: string
  activity_score: number
  activity_level: 'QUIET' | 'TYPICAL' | 'ACTIVE' | 'COMPLEX'
  triggered_flags: FlagResult[]
  supporting_records: {
    violations: Record<string, unknown>[]
    inspections: Record<string, unknown>[]
    permits: Record<string, unknown>[]
    tax_liens: Record<string, unknown>[]
    service_311: Record<string, unknown>[]
    vacant_buildings: Record<string, unknown>[]
  }
  location_sk?: number
  ai_summary: string
  data_freshness: Record<string, string | null>
  pdf_url?: string
  baselines?: Record<string, number>
  neighborhood?: {
    community_area_id: number
    community_area_name: string
    baselines: Record<string, number>
  } | null
  disclaimer: string
}

export interface NeighborProperty {
  location_sk: number
  full_address: string
  lat: number
  lon: number
  activity_score: number
  activity_level: 'QUIET' | 'TYPICAL' | 'ACTIVE' | 'COMPLEX'
  flag_count: number
  top_finding: string | null
  distance_m: number
}

export async function getNeighbors(locationSk: number, radius = 500): Promise<NeighborProperty[]> {
  const { data } = await api.get<NeighborProperty[]>('/api/v1/property/neighbors', {
    params: { location_sk: locationSk, radius },
  })
  return data
}

export interface AutocompleteItem {
  location_sk: number
  full_address: string
}

export interface ReportHistoryItem {
  report_id: string
  query_address: string
  activity_score: number
  activity_level: string
  generated_at: string
  flags_count: number
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

// ── Batch types ──────────────────────────────────────────────────────────────

export interface BatchUploadResponse {
  batch_id: string
  batch_name: string | null
  total_count: number
}

export interface BatchItemStatus {
  row_index: number
  input_address: string
  status: string
  report_id?: string | null
  activity_score?: number | null
  activity_level?: string | null
  flag_count?: number | null
  error_message?: string | null
}

export interface BatchSummary {
  batch_id: string
  batch_name: string | null
  total_count: number
  completed_count: number
  failed_count: number
  status: string
  created_at: string
  completed_at?: string | null
  items: BatchItemStatus[]
  avg_activity_score?: number | null
  level_distribution: Record<string, number>
}

export interface BatchListItem {
  batch_id: string
  batch_name: string | null
  total_count: number
  completed_count: number
  failed_count: number
  status: string
  created_at: string
}

export interface BatchSSEEvent {
  type: 'processing' | 'completed' | 'failed' | 'done'
  row_index?: number
  report_id?: string
  activity_score?: number
  activity_level?: string
  flag_count?: number
  error?: string
  completed?: number
  failed?: number
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

export async function getReportSummary(report_id: string): Promise<string> {
  const { data } = await api.get<{ ai_summary: string; error?: string }>(`/api/v1/report/${report_id}/summary`)
  if (data.error) throw new Error(data.error)
  return data.ai_summary
}

export function streamReportSummary(
  reportId: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): () => void {
  const token = localStorage.getItem('civitas_access_token')
  const url = `${api.defaults.baseURL || ''}/api/v1/report/${reportId}/summary/stream?token=${token}`
  const es = new EventSource(url)

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'chunk') onChunk(data.text)
      else if (data.type === 'done') { onDone(); es.close() }
    } catch {
      onError(new Error('Failed to parse stream event'))
      es.close()
    }
  }

  es.onerror = () => {
    onError(new Error('Stream connection failed'))
    es.close()
  }

  return () => es.close()
}

export async function getReportBrief(report_id: string): Promise<string> {
  const { data } = await api.get<{ executive_brief: string }>(`/api/v1/report/${report_id}/brief`)
  return data.executive_brief
}

export async function getCompareSummary(reportIds: string[]): Promise<string> {
  const { data } = await api.post<{ comparative_summary: string }>('/api/v1/report/compare-summary', {
    report_ids: reportIds,
  })
  return data.comparative_summary
}

export async function askFollowup(
  reportId: string,
  question: string,
  history: { role: string; content: string }[],
): Promise<string> {
  const { data } = await api.post<{ answer: string }>(`/api/v1/qa/${reportId}/ask`, {
    question,
    conversation_history: history,
  })
  return data.answer
}

export async function downloadPdf(location_sk: number, address: string): Promise<Blob> {
  const { data } = await api.post(
    '/api/v1/report/generate?format=pdf',
    { location_sk, address },
    { responseType: 'blob' },
  )
  return data
}

export async function getReportPdf(report_id: string): Promise<Blob> {
  const { data } = await api.get(`/api/v1/report/${report_id}/pdf`, {
    responseType: 'blob',
  })
  return data
}

// ── Batch API calls ─────────────────────────────────────────────────────────

export async function uploadBatch(file: File, batchName?: string): Promise<BatchUploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const params = batchName ? { batch_name: batchName } : {}
  const { data } = await api.post<BatchUploadResponse>('/api/v1/batch/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    params,
  })
  return data
}

export function createBatchEventSource(batchId: string): EventSource {
  const token = localStorage.getItem('civitas_access_token') ?? ''
  const base = import.meta.env.VITE_API_URL ?? ''
  return new EventSource(`${base}/api/v1/batch/${batchId}/stream?token=${encodeURIComponent(token)}`)
}

export async function getBatch(batchId: string): Promise<BatchSummary> {
  const { data } = await api.get<BatchSummary>(`/api/v1/batch/${batchId}`)
  return data
}

export async function getMyBatches(limit = 20): Promise<BatchListItem[]> {
  const { data } = await api.get<BatchListItem[]>('/api/v1/batch/my-batches', {
    params: { limit },
  })
  return data
}

// ── Data browse ──────────────────────────────────────────────────────────────

export interface BrowseParams {
  table: string
  page?: number
  page_size?: number
  address?: string
  filter?: string
  sort?: string
  sort_dir?: 'asc' | 'desc'
}

export interface BrowseResponse {
  rows: Record<string, unknown>[]
  total: number
  page: number
  page_size: number
}

export interface TableInfo {
  key: string
  label: string
  count: number
}

export async function browseData(params: BrowseParams): Promise<BrowseResponse> {
  const { data } = await api.get<BrowseResponse>('/api/v1/data/browse', { params })
  return data
}

export async function getTableList(): Promise<TableInfo[]> {
  const { data } = await api.get<{ tables: TableInfo[] }>('/api/v1/data/tables')
  return data.tables
}

// ── Assessment History ──────────────────────────────────────────────────────

export interface AssessmentRecord {
  pin?: string
  tax_year?: string
  property_address?: string
  property_class?: string
  land_square_feet?: string
  building_square_feet?: string
  certified_total?: string
  [key: string]: unknown
}

export async function getAssessmentHistory(pin: string): Promise<AssessmentRecord[]> {
  const { data } = await api.get<AssessmentRecord[]>('/api/v1/property/assessment-history', {
    params: { pin },
  })
  return data
}

// ── Data Health ─────────────────────────────────────────────────────────────

export interface DatasetHealth {
  key: string
  label?: string
  record_count?: number
  last_ingested?: string | null
  portal_updated_at?: string | null
  portal_age_hours?: number | null
  portal_error?: string | null
  staleness?: 'fresh' | 'stale' | 'very_stale'
}

export interface DataHealthResponse {
  datasets: DatasetHealth[]
  quality_alerts: Record<string, unknown>[]
}

export async function getDataHealth(): Promise<DataHealthResponse> {
  const { data } = await api.get<DataHealthResponse>('/api/v1/data/health')
  return data
}

// ── Parcel Verification ─────────────────────────────────────────────────────

export async function searchParcels(address: string): Promise<AssessmentRecord[]> {
  const { data } = await api.get<AssessmentRecord[]>('/api/v1/property/parcel-search', {
    params: { address },
  })
  return data
}

export async function verifyParcel(pin: string): Promise<AssessmentRecord[]> {
  const { data } = await api.get<AssessmentRecord[]>('/api/v1/property/parcel-verify', {
    params: { pin },
  })
  return data
}

// ── Live Record Check ───────────────────────────────────────────────────────

export interface LiveCheckResponse {
  records: Record<string, unknown>[]
  count: number
  error?: string
}

export async function checkLiveRecords(
  dataset: string,
  address: string,
  since: string,
): Promise<LiveCheckResponse> {
  const { data } = await api.get<LiveCheckResponse>('/api/v1/data/live-check', {
    params: { dataset, address, since },
  })
  return data
}

// ── Neighborhood API ───────────────────────────────────────────────────────

export interface CommunityAreaSummary {
  community_area_id: number
  community_area_name: string
  property_count: number
  avg_activity_score: number
  median_activity_score: number
  quiet_count: number
  typical_count: number
  active_count: number
  complex_count: number
  avg_violations: number
  avg_active_violations: number
  avg_311_12mo: number
  avg_lien_events: number
  avg_permit_processing_days: number
  avg_failed_inspections_24mo: number
  total_violations: number
  total_311_12mo: number
  total_lien_events: number
  total_lien_amount: number
  total_vacant_violations: number
}

export interface CommunityAreaDetail extends CommunityAreaSummary {
  boundary_geojson: GeoJSON.Geometry
}

export interface NeighborhoodPropertyItem {
  location_sk: number
  full_address_standardized: string
  lat: number
  lon: number
  total_violations: number
  active_violation_count: number
  sr_count_12mo: number
  total_lien_events: number
  failed_inspection_count_24mo: number
  vacant_violation_count: number
  raw_score?: number
  activity_level?: string
}

export interface NeighborhoodPropertiesResponse {
  total: number
  page: number
  page_size: number
  properties: NeighborhoodPropertyItem[]
}

export interface CommunityAreaGeoJSON {
  type: 'FeatureCollection'
  features: GeoJSON.Feature[]
}

// Session-level cache for neighborhood data (static during a session)
let _neighborhoodListCache: Promise<CommunityAreaSummary[]> | null = null
let _neighborhoodGeoJSONCache: Promise<CommunityAreaGeoJSON> | null = null

export function getNeighborhoodList(): Promise<CommunityAreaSummary[]> {
  if (!_neighborhoodListCache) {
    _neighborhoodListCache = api.get<CommunityAreaSummary[]>('/api/v1/neighborhood/list')
      .then(r => r.data)
      .catch(e => { _neighborhoodListCache = null; throw e })
  }
  return _neighborhoodListCache
}

export async function getNeighborhoodDetail(id: number): Promise<CommunityAreaDetail> {
  const { data } = await api.get<CommunityAreaDetail>(`/api/v1/neighborhood/${id}`)
  return data
}

export async function getNeighborhoodProperties(
  id: number,
  params?: { page?: number; page_size?: number; sort_by?: string; sort_dir?: string; address?: string; activity_level?: string[] },
): Promise<NeighborhoodPropertiesResponse> {
  const { data } = await api.get<NeighborhoodPropertiesResponse>(
    `/api/v1/neighborhood/${id}/properties`,
    { params },
  )
  return data
}

export function getNeighborhoodGeoJSON(): Promise<CommunityAreaGeoJSON> {
  if (!_neighborhoodGeoJSONCache) {
    _neighborhoodGeoJSONCache = api.get<CommunityAreaGeoJSON>('/api/v1/neighborhood/geojson')
      .then(r => r.data)
      .catch(e => { _neighborhoodGeoJSONCache = null; throw e })
  }
  return _neighborhoodGeoJSONCache
}
