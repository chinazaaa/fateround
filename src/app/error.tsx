'use client'

import { ServerErrorPage } from '@/components/ServerErrorPage'

export default function GlobalErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ServerErrorPage error={error} reset={reset} />
}
