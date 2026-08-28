'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

/**
 * Last-resort boundary: errors thrown by the ROOT LAYOUT itself, which `error.tsx`
 * cannot catch because it renders inside that layout. React unmounts everything and
 * renders this instead, so it must supply its own <html>/<body> and cannot use the
 * fonts, theme variables, providers or any component that depends on them — hence the
 * inline styles rather than the design system.
 *
 * Without this file, a root-layout crash renders Next's built-in error page and is
 * never reported to Sentry.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          background: '#0b0b0f',
          color: '#f5f5f7',
        }}
      >
        <div style={{ maxWidth: '28rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.75rem' }}>Something went wrong</h1>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.6, opacity: 0.75, margin: '0 0 1.5rem' }}>
            FateRound hit an unexpected error and couldn&apos;t finish loading. Reloading usually fixes it.
          </p>
          {error.digest ? (
            <p style={{ fontSize: '0.75rem', opacity: 0.5, margin: '0 0 1.5rem' }}>
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
          <a
            href="/"
            style={{
              display: 'inline-block',
              padding: '0.65rem 1.25rem',
              borderRadius: '9999px',
              background: '#f5f5f7',
              color: '#0b0b0f',
              fontWeight: 600,
              fontSize: '0.9rem',
              textDecoration: 'none',
            }}
          >
            Back to FateRound
          </a>
        </div>
      </body>
    </html>
  )
}
