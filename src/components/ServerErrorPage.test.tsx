// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// SiteChrome pulls in the app's whole provider stack (toasts, confirm dialogs, profile
// modals), all of which the root layout supplies in production — it wraps error.tsx. This
// test is about what the error card itself renders, so stand the chrome down rather than
// rebuild that stack.
vi.mock('@/components/SiteChrome', () => ({
  SiteChrome: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { ServerErrorPage } from './ServerErrorPage'

function renderPage(ui: React.ReactElement) {
  return render(ui)
}

describe('ServerErrorPage', () => {
  it('shows a reference code for an error with no digest and an empty message', () => {
    // `new Error()` carries no digest and an empty message — the case most in need of a code
    // to quote to support.
    renderPage(<ServerErrorPage error={new Error()} />)
    expect(screen.getByText(/Reference/i)).toBeTruthy()
  })

  it('prefers the digest when there is one', () => {
    const err = Object.assign(new Error('boom'), { digest: 'abc123' })
    renderPage(<ServerErrorPage error={err} />)
    expect(screen.getByText('abc123')).toBeTruthy()
  })

  it('keeps the raw message behind the details toggle, not on display', () => {
    renderPage(<ServerErrorPage error={new Error('TypeError: x is not a function')} />)
    expect(screen.getByText('Technical details')).toBeTruthy()
    expect(screen.getByText(/x is not a function/)).toBeTruthy()
  })

  it('renders no reference at all when there is no error', () => {
    renderPage(<ServerErrorPage />)
    expect(screen.queryByText(/Reference/i)).toBeNull()
  })
})
