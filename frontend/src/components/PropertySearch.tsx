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
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Property Address <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="e.g. 123 N MAIN ST, CHICAGO IL 60601"
          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Cook County PIN{' '}
          <span className="text-gray-400 font-normal">(optional, 14 digits)</span>
        </label>
        <input
          type="text"
          value={pin}
          onChange={e => setPin(e.target.value)}
          placeholder="e.g. 17141040280000"
          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
          maxLength={17}
        />
      </div>

      <button
        type="submit"
        disabled={loading || !address.trim()}
        className="w-full bg-blue-800 hover:bg-blue-900 disabled:bg-gray-400
                   text-white font-semibold py-2 rounded-lg transition-colors"
      >
        {loading ? 'Searching…' : 'Look Up Property'}
      </button>
    </form>
  )
}
