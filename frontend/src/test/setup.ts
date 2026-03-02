import '@testing-library/jest-dom/vitest'

// Stub window.matchMedia (Tailwind CSS needs it)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Stub URL.createObjectURL / revokeObjectURL (PDF download tests)
URL.createObjectURL = () => 'blob:mock'
URL.revokeObjectURL = () => {}
