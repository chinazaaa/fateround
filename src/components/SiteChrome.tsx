import type { ReactNode } from 'react'
import { MarketingHeader } from '@/components/MarketingHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { ScrollToTopOnNavigate } from '@/components/ScrollToTopOnNavigate'

/**
 * Full public-site shell — the `.fr-site` design-system scope plus the shared
 * marketing header (logo + nav + mobile drawer) and footer. Wrap landing pages
 * (rooms, tournament, leaderboard, updates, …) in this so the site nav is
 * consistent with the home page.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <div className="fr-site flex min-h-dvh flex-col">
      <ScrollToTopOnNavigate />
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
