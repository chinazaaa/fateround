'use client'

import { useEffect } from 'react'
import { ServerErrorPage } from '@/components/ServerErrorPage'

export default function GlobalErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Global Error Boundary caught:', error)
  }, [error])

  return <ServerErrorPage error={error} reset={reset} />
}
