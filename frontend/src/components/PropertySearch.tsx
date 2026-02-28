import { useState, type FormEvent } from 'react'
import type { LookupRequest } from '../api/civitas'

interface Props {
  onSubmit: (req: LookupRequest) => void
  loading: boolean
}

export default function PropertySearch({ onSubmit, loading }: Props) {
  const [address, setAddress] = useState('')
  const [pin, setPin]         = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!address.trim()) return
    onSubmit({ address: address.trim(), pin: pin.trim() || undefined })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-fade-in bg-slate-900 border border-slate-700/50 rounded-xl p-6 space-y-4"
    >
      <div>
        <label className="block text-sm font-semibold text-slate-300 mb-1">
          Property Address <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="e.g. 123 N MAIN ST, CHICAGO IL 60601"
          className="w-full bg-slate-800 border border-slate-600 text-slate-100 rounded-lg px-4 py-2.5 text-sm
                     placeholder:text-slate-500
                     focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500
                     transition-shadow"
          required
        />
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
