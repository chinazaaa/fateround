// Registers @testing-library/jest-dom matchers (toBeInTheDocument, toHaveTextContent, …)
// on Vitest's expect. Harmless for node-env tests — the matchers only run when called,
// which only happens in jsdom component tests.
import '@testing-library/jest-dom/vitest'

// Unmount React trees between tests. Vitest doesn't expose `afterEach` as a global (no
// `globals: true`), so RTL's automatic cleanup doesn't register itself — wire it up here
// or rendered output leaks across tests.
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

if (typeof window !== 'undefined') {
  const store = new Map<string, string>()
  const mockStorage: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }

  try {
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    })
  } catch {
    // Already defined
  }
}

afterEach(() => {
  cleanup()
})
