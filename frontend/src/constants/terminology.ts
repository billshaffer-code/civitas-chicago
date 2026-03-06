export type ActivityLevel = 'QUIET' | 'TYPICAL' | 'ACTIVE' | 'COMPLEX'

export const LEVEL_CONFIG: Record<ActivityLevel, {
  text: string
  bar: string
  pillBg: string
  pillText: string
  label: string
  bgAccent: string
}> = {
  QUIET:   { text: 'text-slate-500',   bar: 'bg-slate-400',   pillBg: 'bg-slate-100',  pillText: 'text-slate-600',  label: 'QUIET',   bgAccent: 'bg-slate-50 text-slate-600' },
  TYPICAL: { text: 'text-blue-400',    bar: 'bg-blue-400',    pillBg: 'bg-blue-50',    pillText: 'text-blue-500',   label: 'TYPICAL', bgAccent: 'bg-blue-50 text-blue-500' },
  ACTIVE:  { text: 'text-blue-600',    bar: 'bg-blue-600',    pillBg: 'bg-blue-100',   pillText: 'text-blue-700',   label: 'ACTIVE',  bgAccent: 'bg-blue-100 text-blue-700' },
  COMPLEX: { text: 'text-blue-900',    bar: 'bg-blue-900',    pillBg: 'bg-blue-900',   pillText: 'text-white',      label: 'COMPLEX', bgAccent: 'bg-blue-900 text-white' },
}

export type ActionGroup = 'Informational' | 'Worth Noting' | 'Review Recommended' | 'Action Required'

export const ACTION_GROUP_CONFIG: Record<ActionGroup, {
  border: string
  bg: string
  code: string
  icon: string
}> = {
  'Informational':       { border: 'border-slate-300', bg: 'bg-slate-50',  code: 'text-slate-600', icon: 'info' },
  'Worth Noting':        { border: 'border-blue-300',  bg: 'bg-blue-50',   code: 'text-blue-600',  icon: 'eye' },
  'Review Recommended':  { border: 'border-blue-500',  bg: 'bg-blue-100',  code: 'text-blue-700',  icon: 'clipboard' },
  'Action Required':     { border: 'border-amber-400', bg: 'bg-amber-50',  code: 'text-amber-700', icon: 'alert' },
}

export const ACTION_ORDER: ActionGroup[] = [
  'Action Required',
  'Review Recommended',
  'Worth Noting',
  'Informational',
]
