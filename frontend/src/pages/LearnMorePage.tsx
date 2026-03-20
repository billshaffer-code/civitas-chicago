import { Link } from 'react-router-dom'

/* ── Section block ────────────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="text-[22px] font-semibold text-ink-primary tracking-tight">{title}</h3>
      {children}
    </section>
  )
}

/* ── Bullet list ──────────────────────────────────────────────────── */
function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-[15px] text-ink-secondary leading-[1.65]">
          <span className="text-accent mt-0.5 flex-shrink-0">&ndash;</span>
          {item}
        </li>
      ))}
    </ul>
  )
}

/* ── Learn More page ──────────────────────────────────────────────── */
export default function LearnMorePage() {
  return (
    <div className="min-h-screen bg-white">

      {/* ── Hero ── */}
      <header className="border-b border-separator bg-surface-overlay">
        <div className="max-w-2xl mx-auto px-6 py-20">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:text-accent-hover transition-colors mb-10"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Sign In
          </Link>

          <h1 className="font-brand text-[28px] font-black tracking-[0.3em] text-ink-primary">
            CIVITAS
          </h1>
          <p className="text-ink-quaternary text-[12px] mt-1 tracking-wide">Municipal Intelligence</p>

          <h2 className="text-[36px] font-bold text-ink-primary mt-10 leading-[1.1] tracking-tight max-w-lg">
            Municipal Intelligence for<br />
            <span className="text-ink-tertiary">Property Due Diligence</span>
          </h2>
          <p className="text-[15px] text-ink-secondary mt-5 max-w-xl leading-[1.65]">
            Property decisions should be based on facts, not scavenger hunts through
            government websites. CIVITAS aggregates municipal records — violations, permits,
            inspections, service requests, and tax liens — into structured, explainable
            property reports built specifically for investors, lenders, attorneys, and analysts.
          </p>
          <p className="text-[15px] text-ink-secondary mt-4 max-w-xl leading-[1.65]">
            Instead of manually searching five city databases and a handful of PDFs, you get a
            single, clear report that shows the full municipal history of a property.
          </p>
          <p className="text-[15px] font-semibold text-ink-primary mt-5">Close with confidence.</p>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="max-w-2xl mx-auto px-6 py-16 space-y-14">

        <Section title="The Problem">
          <p className="text-[15px] text-ink-secondary leading-[1.65]">
            Municipal data is fragmented. A single property might have:
          </p>
          <Bullets items={[
            'Code violations in one system',
            'Permits in another',
            '311 complaints somewhere else',
            'Tax liens buried in court records',
          ]} />
          <p className="text-[15px] text-ink-secondary leading-[1.65]">
            Finding the real story behind a property requires hours of manual research. And
            missing one critical record can turn a deal into a very expensive mistake.
          </p>
          <p className="text-[15px] font-semibold text-ink-primary">CIVITAS brings that story together.</p>
        </Section>

        <Section title="Property Intelligence Built for Due Diligence">
          <p className="text-[15px] text-ink-secondary leading-[1.65]">
            CIVITAS transforms messy municipal data into structured property intelligence
            designed for real-world risk analysis. Every report consolidates public records into
            a unified timeline so you can quickly understand the operational, regulatory, and
            legal history of a property.
          </p>
          <p className="text-[15px] text-ink-secondary leading-[1.65]">From a single address, you can see:</p>
          <Bullets items={[
            'Code violations and compliance history',
            'Building permits and construction activity',
            'Inspection results',
            'Resident complaints and service requests',
            'Tax liens and municipal enforcement activity',
          ]} />
          <p className="text-[15px] font-semibold text-ink-primary">No guesswork. No scattered searches.</p>
        </Section>

        <Section title="Deterministic Property Risk Scoring">
          <p className="text-[15px] text-ink-secondary leading-[1.65]">
            CIVITAS uses transparent, rule-based scoring models to evaluate municipal activity.
            No black boxes. No opaque algorithms.
          </p>
          <p className="text-[15px] text-ink-secondary leading-[1.65]">
            Every score is derived from clear rules applied to structured data, so you can see
            exactly why a property was flagged and what events contributed to the risk profile.
          </p>
          <p className="text-[15px] font-semibold text-ink-primary">
            Think of it as an explainable audit trail for municipal risk.
          </p>
        </Section>

        <Section title="Municipal Data Aggregation">
          <p className="text-[15px] text-ink-secondary leading-[1.65]">
            CIVITAS continuously aggregates and standardizes municipal datasets including:
          </p>
          <Bullets items={[
            'Code violations',
            'Building permits',
            'Inspections',
            '311 service requests',
            'Tax liens and enforcement records',
          ]} />
          <p className="text-[15px] text-ink-secondary leading-[1.65]">
            These records are normalized into a canonical data model so every property can be
            analyzed consistently. The result is a unified municipal intelligence layer for
            real estate.
          </p>
        </Section>

        <Section title="Portfolio Analysis">
          <p className="text-[15px] text-ink-secondary leading-[1.65]">
            Due diligence rarely happens one property at a time. CIVITAS allows you to analyze
            entire portfolios in batch, generating reports and activity scores for multiple
            addresses simultaneously.
          </p>
          <p className="text-[15px] text-ink-secondary leading-[1.65]">
            Compare properties side-by-side, identify risk clusters, and surface potential
            issues before they become expensive surprises.
          </p>
          <p className="text-[15px] text-ink-secondary leading-[1.65]">
            For investors, lenders, and analysts working at scale, this turns municipal research
            from a manual task into a data product.
          </p>
        </Section>

        <Section title="Legally Cautious Intelligence">
          <p className="text-[15px] text-ink-secondary leading-[1.65]">
            CIVITAS generates narrative summaries of municipal activity using structured data
            and fully cited sources. Every claim in a report is grounded in verifiable records.
          </p>
          <p className="text-[15px] font-semibold text-ink-primary">
            No speculation. No hallucinated analysis. Just explainable insights derived from
            real municipal data.
          </p>
        </Section>

        <Section title="Built for Professionals Who Need the Real Story">
          <p className="text-[15px] text-ink-secondary leading-[1.65]">CIVITAS is designed for:</p>
          <Bullets items={[
            'Real estate investors',
            'Private lenders',
            'Attorneys',
            'Property managers',
            'Due diligence analysts',
          ]} />
          <p className="text-[15px] text-ink-secondary leading-[1.65]">
            Anyone making financial decisions about property should have access to the complete
            municipal history behind an address.
          </p>
        </Section>

        {/* ── CTA ── */}
        <div className="border-t border-separator pt-12 text-center">
          <h3 className="text-[24px] font-semibold text-ink-primary tracking-tight">
            Start Seeing What the City Sees
          </h3>
          <p className="text-[15px] text-ink-secondary mt-3 max-w-md mx-auto leading-[1.65]">
            Municipal records already contain the signals that matter. CIVITAS simply makes them visible.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              to="/signup"
              className="bg-accent hover:bg-accent-hover text-white text-[15px] font-semibold px-7 py-3 rounded-apple shadow-[0_1px_3px_rgba(0,113,227,0.4)] transition-all duration-150 ease-apple active:scale-[0.99]"
            >
              Get Started
            </Link>
            <Link
              to="/login"
              className="bg-surface-sunken hover:bg-surface-raised text-ink-primary text-[15px] font-medium px-7 py-3 rounded-apple border border-separator transition-all duration-150 ease-apple"
            >
              Sign In
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
