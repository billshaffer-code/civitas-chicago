import { useState, useEffect, useRef, type FormEvent } from 'react'
import type { LookupRequest, AutocompleteItem } from '../api/civitas'
import { autocompleteAddress } from '../api/civitas'

interface Props {
  onSubmit: (req: LookupRequest) => void
  loading: boolean
}

export default function PropertySearch({ onSubmit, loading }: Props) {
  const [address, setAddress] = useState('')
  const [pin, setPin]         = useState('')
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [pinExpanded, setPinExpanded] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Debounced autocomplete
  useEffect(() => {
    if (address.trim().length < 2) {
      setSuggestions([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const items = await autocompleteAddress(address.trim())
        setSuggestions(items)
        setShowDropdown(items.length > 0)
        setActiveIndex(-1)
      } catch {
        setSuggestions([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [address])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selectSuggestion(item: AutocompleteItem) {
    setAddress(item.full_address)
    setShowDropdown(false)
    setSuggestions([])
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      selectSuggestion(suggestions[activeIndex])
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!address.trim()) return
    setShowDropdown(false)
    onSubmit({ address: address.trim(), pin: pin.trim() || undefined })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {/* Spotlight search input */}
      <div ref={wrapperRef} className="relative">
        {/* Location pin icon */}
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-tertiary pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>

        <input
          type="text"
          value={address}
          onChange={e => setAddress(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. 123 N MAIN ST, CHICAGO IL 60601"
          className="w-full h-[56px] pl-12 pr-[130px] bg-white rounded-apple-lg text-[15px] text-ink-primary placeholder:text-ink-placeholder shadow-apple focus:shadow-apple-md border border-separator focus:border-accent/40 transition-all duration-200 ease-apple-decel focus:outline-none"
          required
          autoComplete="off"
        />

        {/* Embedded submit button */}
        <button
          type="submit"
          disabled={loading || !address.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-[40px] px-5 bg-accent hover:bg-accent-hover disabled:bg-ink-quaternary text-white text-[13px] font-semibold rounded-apple-sm shadow-[0_1px_3px_rgba(0,113,227,0.4)] disabled:shadow-none transition-all duration-150 ease-apple active:scale-[0.98] flex items-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Searching
            </>
          ) : (
            'Look Up'
          )}
        </button>

        {/* Autocomplete dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white/95 backdrop-blur-xl rounded-apple-lg shadow-apple-md border border-separator animate-apple-scale-in overflow-hidden">
            {suggestions.map((item, i) => (
              <button
                key={item.location_sk}
                type="button"
                onClick={() => selectSuggestion(item)}
                className={`w-full text-left px-4 py-2.5 text-[13px] flex items-center gap-2.5 transition-colors
                  ${i === activeIndex
                    ? 'bg-accent-light text-accent'
                    : 'text-ink-primary hover:bg-surface-raised'
                  }
                  ${i < suggestions.length - 1 ? 'border-b border-separator' : ''}`}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {item.full_address}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* PIN toggle */}
      <div>
        <button
          type="button"
          onClick={() => setPinExpanded(v => !v)}
          className="text-[12px] text-ink-tertiary hover:text-accent transition-colors flex items-center gap-1"
        >
          <svg
            className={`w-3 h-3 transition-transform duration-200 ease-apple ${pinExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Cook County PIN (optional)
        </button>

        {pinExpanded && (
          <div className="mt-2 animate-apple-fade-in">
            <input
              type="text"
              value={pin}
              onChange={e => setPin(e.target.value)}
              placeholder="e.g. 17141040280000"
              className="w-full h-[44px] px-4 bg-white border border-separator rounded-apple text-[14px] text-ink-primary placeholder:text-ink-placeholder font-mono shadow-apple-xs focus:outline-none focus:border-accent/40 focus:shadow-apple transition-all duration-200 ease-apple-decel"
              maxLength={17}
              autoComplete="off"
            />
          </div>
        )}
      </div>
    </form>
  )
}
