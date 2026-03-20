import type { FlagResult } from '../api/civitas'
import { ACTION_GROUP_CONFIG, type ActionGroup } from '../constants/terminology'

const fallback = { border: 'border-separator-opaque', bg: 'bg-white', code: 'text-ink-secondary', icon: 'info' }

function ActionIcon({ icon }: { icon: string }) {
  const cls = "w-3.5 h-3.5 inline-block mr-1 -mt-0.5"
  if (icon === 'alert') return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  )
  if (icon === 'clipboard') return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
  if (icon === 'eye') return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
  return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

export default function FindingCard({ flag, onClick }: { flag: FlagResult; onClick?: () => void }) {
  const group = flag.action_group as ActionGroup
  const c = ACTION_GROUP_CONFIG[group] ?? fallback

  return (
    <div
      className={`group relative border-l-[3px] ${c.border} ${c.bg} rounded-r-apple-sm
                  px-3.5 py-2.5 shadow-apple-xs hover:shadow-apple-sm min-w-0
                  transition-all duration-150 ease-apple
                  ${onClick ? 'cursor-pointer active:scale-[0.99]' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      <div className="flex justify-between items-start gap-2">
        <span className={`font-mono font-bold text-[11px] ${c.code} break-words min-w-0`}>
          <ActionIcon icon={c.icon} />
          {flag.flag_code}
        </span>
        <span className="text-[10px] text-ink-quaternary font-medium shrink-0">
          {flag.action_group}
        </span>
      </div>
      <p className="text-[12px] text-ink-secondary mt-1 leading-[1.5]">{flag.description}</p>

      {/* Chevron on clickable cards */}
      {onClick && (
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-quaternary
                        group-hover:text-accent transition-colors opacity-0 group-hover:opacity-100"
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </div>
  )
}
