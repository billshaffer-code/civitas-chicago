import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import type { UserResponse, FlagResult, ReportResponse, ReportHistoryItem } from '../api/civitas'

/**
 * Render with MemoryRouter wrapper.
 */
export function renderWithRouter(
  ui: ReactElement,
  { initialEntries = ['/'] }: { initialEntries?: string[] } = {},
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>,
  )
}

// ── Factory functions ──────────────────────────────────────────────────────

export function makeUser(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    user_id: 'usr-1',
    email: 'test@example.com',
    full_name: 'Jane Smith',
    company_name: 'Acme Title Co',
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

export function makeFlag(overrides: Partial<FlagResult> = {}): FlagResult {
  return {
    flag_code: 'ACTIVE_MUNICIPAL_VIOLATION',
    category: 'A',
    description: 'Active violation on record',
    severity_score: 25,
    supporting_count: 3,
    ...overrides,
  }
}

export function makeReport(overrides: Partial<ReportResponse> = {}): ReportResponse {
  return {
    report_id: 'rpt-1',
    generated_at: '2025-06-01T12:00:00Z',
    property: { address: '123 N MAIN ST', zip: '60601', city: 'CHICAGO', state: 'IL' },
    match_confidence: 'EXACT',
    risk_score: 45,
    risk_tier: 'MODERATE',
    triggered_flags: [makeFlag()],
    supporting_records: {
      violations: [],
      inspections: [],
      permits: [],
      tax_liens: [],
      service_311: [],
      vacant_buildings: [],
    },
    ai_summary: 'Test summary.',
    data_freshness: {},
    disclaimer: 'For informational purposes only.',
    ...overrides,
  }
}

export function makeReportHistoryItem(
  overrides: Partial<ReportHistoryItem> = {},
): ReportHistoryItem {
  return {
    report_id: 'rpt-1',
    query_address: '123 N MAIN ST',
    risk_score: 45,
    risk_tier: 'MODERATE',
    generated_at: '2025-06-01T12:00:00Z',
    ...overrides,
  }
}

/** Build a mock value for useAuth() with vi.fn() stubs. */
export function makeAuthValue(overrides: Record<string, unknown> = {}) {
  return {
    user: makeUser(),
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  }
}
