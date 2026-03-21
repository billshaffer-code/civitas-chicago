import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

const SHORTCUTS = [
  { keys: ['?'], description: 'Show keyboard shortcuts' },
  { keys: ['Esc'], description: 'Close modal / panel' },
  { keys: ['Cmd', 'K'], description: 'Focus search' },
  { keys: ['1–5'], description: 'Switch report tabs' },
]

export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      if (e.key === 'Escape') {
        if (open) {
          setOpen(false)
          e.preventDefault()
        }
        return
      }

      if (isInput) return

      if (e.key === '?') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative bg-white rounded-apple-lg shadow-apple-sheet border border-separator w-[360px] animate-apple-fade-in">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-separator">
          <h3 className="text-[15px] font-semibold text-ink-primary">Keyboard Shortcuts</h3>
          <button
            onClick={() => setOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-apple-sm hover:bg-surface-raised text-ink-quaternary hover:text-ink-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-[13px] text-ink-secondary">{s.description}</span>
              <div className="flex items-center gap-1">
                {s.keys.map(k => (
                  <kbd key={k} className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-surface-raised border border-separator rounded-[5px] text-[11px] font-mono font-medium text-ink-tertiary">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
