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
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
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
    <form
      onSubmit={handleSubmit}
      className="animate-fade-in bg-slate-900 border border-slate-700/50 rounded-xl p-6 space-y-4"
    >
      <div className="relative">
        <label className="block text-sm font-semibold text-slate-300 mb-1">
          Property Address <span className="text-red-400">*</span>
        </label>
        <input
          ref={inputRef}
          type="text"
          value={address}
          onChange={e => setAddress(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. 123 N MAIN ST, CHICAGO IL 60601"
          className="w-full bg-slate-800 border border-slate-600 text-slate-100 rounded-lg px-4 py-2.5 text-sm
                     placeholder:text-slate-500
                     focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500
                     transition-shadow"
          required
          autoComplete="off"
        />

        {/* Autocomplete dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-50 left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg
                       shadow-lg shadow-black/30 max-h-60 overflow-y-auto"
          >
            {suggestions.map((item, i) => (
              <button
                key={item.location_sk}
                type="button"
                onClick={() => selectSuggestion(item)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                  ${i === activeIndex
                    ? 'bg-cyan-600/20 text-cyan-300'
                    : 'text-slate-300 hover:bg-slate-700/60'
                  }
                  ${i < suggestions.length - 1 ? 'border-b border-slate-700/50' : ''}`}
              >
                {item.full_address}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-300 mb-1">
          Cook County PIN{' '}
          <span className="text-slate-500 font-normal">(optional, 14 digits)</span>
        </label>
        <input
          type="text"
          value={pin}
          onChange={e => setPin(e.target.value)}
          placeholder="e.g. 17141040280000"
          className="w-full bg-slate-800 border border-slate-600 text-slate-100 rounded-lg px-4 py-2.5 text-sm
                     placeholder:text-slate-500
                     focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500
                     transition-shadow"
          maxLength={17}
        />
      </div>

      <button
        type="submit"
        disabled={loading || !address.trim()}
        className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500
                   text-white font-semibold py-2.5 rounded-lg transition-colors"
      >
        {loading ? 'Searching...' : 'Look Up Property'}
      </button>
    </form>
  )
}
