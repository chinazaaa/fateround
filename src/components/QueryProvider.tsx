'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from '@/lib/query-client'

const ReactQueryDevtools =
  process.env.NODE_ENV === 'development'
    ? dynamic(() => import('@tanstack/react-query-devtools').then((m) => m.ReactQueryDevtools), { ssr: false })
    : () => null

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </QueryClientProvider>
  )
}
