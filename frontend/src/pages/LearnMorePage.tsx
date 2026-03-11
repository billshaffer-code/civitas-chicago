import { Link } from 'react-router-dom'

/* ── Section block ────────────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {children}
    </section>
  )
}

/* ── Bullet list ──────────────────────────────────────────────────── */
function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-gray-600 leading-relaxed">
          <span className="text-gray-300 mt-0.5">&bull;</span>
          {item}
        </li>
      ))}
    </ul>
  )
}

/* ── Learn More page ──────────────────────────────────────────────── */
export default function LearnMorePage() {
  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* ── Hero ── */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-8"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Sign In
          </Link>

          <h1 className="font-brand text-3xl font-bold tracking-[0.25em] text-gray-900">
            CIVITAS
          </h1>
          <p className="text-gray-400 text-sm mt-1 tracking-wide">Municipal Intelligence</p>

          <h2 className="text-2xl font-semibold text-gray-900 mt-10 leading-snug max-w-lg">
            Municipal Intelligence for<br />
            <span className="text-gray-500">Property Due Diligence</span>
          </h2>
          <p className="text-gray-600 text-sm mt-4 max-w-lg leading-relaxed">
            Property decisions should be based on facts, not scavenger hunts through
            government websites. CIVITAS aggregates municipal records — violations, permits,
            inspections, service requests, and tax liens — into structured, explainable
            property reports built specifically for investors, lenders, attorneys, and analysts.
          </p>
          <p className="text-gray-600 text-sm mt-3 max-w-lg leading-relaxed">
            Instead of manually searching five city databases and a handful of PDFs, you get a
            single, clear report that shows the full municipal history of a property.
          </p>
          <p className="text-sm font-semibold text-gray-900 mt-4">Close with confidence.</p>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="max-w-3xl mx-auto px-6 py-12 space-y-12">

        {/* The Problem */}
        <Section title="The Problem">
          <p className="text-sm text-gray-600 leading-relaxed">
            Municipal data is fragmented. A single property might have:
          </p>
          <Bullets items={[
            'Code violations in one system',
            'Permits in another',
            '311 complaints somewhere else',
            'Tax liens buried in court records',
          ]} />
          <p className="text-sm text-gray-600 leading-relaxed">
            Finding the real story behind a property requires hours of manual research. And
            missing one critical record can turn a deal into a very expensive mistake.
          </p>
          <p className="text-sm font-medium text-gray-800">CIVITAS brings that story together.</p>
        </Section>

        {/* Property Intelligence */}
        <Section title="Property Intelligence Built for Due Diligence">
          <p className="text-sm text-gray-600 leading-relaxed">
            CIVITAS transforms messy municipal data into structured property intelligence
            designed for real-world risk analysis. Every report consolidates public records into
            a unified timeline so you can quickly understand the operational, regulatory, and
            legal history of a property.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">From a single address, you can see:</p>
          <Bullets items={[
            'Code violations and compliance history',
            'Building permits and construction activity',
            'Inspection results',
            'Resident complaints and service requests',
            'Tax liens and municipal enforcement activity',
          ]} />
          <p className="text-sm font-medium text-gray-800">No guesswork. No scattered searches.</p>
        </Section>

        {/* Deterministic Scoring */}
        <Section title="Deterministic Property Risk Scoring">
          <p className="text-sm text-gray-600 leading-relaxed">
            CIVITAS uses transparent, rule-based scoring models to evaluate municipal activity.
            No black boxes. No opaque algorithms.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            Every score is derived from clear rules applied to structured data, so you can see
            exactly why a property was flagged and what events contributed to the risk profile.
          </p>
          <p className="text-sm font-medium text-gray-800">
            Think of it as an explainable audit trail for municipal risk.
          </p>
        </Section>

        {/* Data Aggregation */}
        <Section title="Municipal Data Aggregation">
          <p className="text-sm text-gray-600 leading-relaxed">
            CIVITAS continuously aggregates and standardizes municipal datasets including:
          </p>
          <Bullets items={[
            'Code violations',
            'Building permits',
            'Inspections',
            '311 service requests',
            'Tax liens and enforcement records',
          ]} />
          <p className="text-sm text-gray-600 leading-relaxed">
            These records are normalized into a canonical data model so every property can be
            analyzed consistently. The result is a unified municipal intelligence layer for
            real estate.
          </p>
        </Section>

        {/* Portfolio Analysis */}
        <Section title="Portfolio Analysis">
          <p className="text-sm text-gray-600 leading-relaxed">
            Due diligence rarely happens one property at a time. CIVITAS allows you to analyze
            entire portfolios in batch, generating reports and activity scores for multiple
            addresses simultaneously.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            Compare properties side-by-side, identify risk clusters, and surface potential
            issues before they become expensive surprises.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            For investors, lenders, and analysts working at scale, this turns municipal research
            from a manual task into a data product.
          </p>
        </Section>

        {/* Legally Cautious */}
        <Section title="Legally Cautious Intelligence">
          <p className="text-sm text-gray-600 leading-relaxed">
            CIVITAS generates narrative summaries of municipal activity using structured data
            and fully cited sources. Every claim in a report is grounded in verifiable records.
          </p>
          <p className="text-sm font-medium text-gray-800">
            No speculation. No hallucinated analysis. Just explainable insights derived from
            real municipal data.
          </p>
        </Section>

        {/* Built for Professionals */}
        <Section title="Built for Professionals Who Need the Real Story">
          <p className="text-sm text-gray-600 leading-relaxed">CIVITAS is designed for:</p>
          <Bullets items={[
            'Real estate investors',
            'Private lenders',
            'Attorneys',
            'Property managers',
            'Due diligence analysts',
          ]} />
          <p className="text-sm text-gray-600 leading-relaxed">
            Anyone making financial decisions about property should have access to the complete
            municipal history behind an address.
          </p>
        </Section>

        {/* Closing CTA */}
        <div className="border-t border-gray-200 pt-10 text-center">
          <h3 className="text-xl font-semibold text-gray-900">Start Seeing What the City Sees</h3>
          <p className="text-sm text-gray-500 mt-2">
            Municipal records already contain the signals that matter. CIVITAS simply makes them visible.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              to="/signup"
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
            >
              Get Started
            </Link>
            <Link
              to="/login"
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
