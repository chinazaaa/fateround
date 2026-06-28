// Registers @testing-library/jest-dom matchers (toBeInTheDocument, toHaveTextContent, …)
// on Vitest's expect. Harmless for node-env tests — the matchers only run when called,
// which only happens in jsdom component tests.
import '@testing-library/jest-dom/vitest'

// Unmount React trees between tests. Vitest doesn't expose `afterEach` as a global (no
// `globals: true`), so RTL's automatic cleanup doesn't register itself — wire it up here
// or rendered output leaks across tests.
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
