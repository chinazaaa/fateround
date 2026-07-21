'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Belt-and-suspenders scroll reset on route change. Next.js already scrolls to the top on a
 * normal `<Link>` navigation, but this guarantees it for the public content pages regardless
 * of environment. Skipped when the URL has a hash so in-page anchor jumps (e.g. the /faq
 * section links) still land on their target.
 */
export function ScrollToTopOnNavigate() {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash) return
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
