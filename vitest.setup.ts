// Registers @testing-library/jest-dom matchers (toBeInTheDocument, toHaveTextContent, …)
// on Vitest's expect. Harmless for node-env tests — the matchers only run when called,
// which only happens in jsdom component tests.
import '@testing-library/jest-dom/vitest'
