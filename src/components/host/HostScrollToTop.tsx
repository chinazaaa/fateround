'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { scrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'

/** Scroll host routes to the top on navigation and after async content settles. */
export function HostScrollToTop() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeKey = `${pathname}?${searchParams.toString()}`

  useEffect(() => {
    scrollHostViewToTop()
    const t1 = window.setTimeout(scrollHostViewToTop, 100)
    const t2 = window.setTimeout(scrollHostViewToTop, 350)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [routeKey])

  return null
}
