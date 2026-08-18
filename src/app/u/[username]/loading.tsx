import { MarketingHeader } from '@/components/MarketingHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { Skeleton } from '@/components/Skeleton'

/**
 * Shown the instant a public profile link is clicked, while the force-dynamic page runs its
 * queries server-side. Without this boundary the App Router leaves the old page on screen with no
 * feedback until the server finishes — the "is it frozen?" wait. The chrome matches the real page
 * so only the card swaps in.
 */
export default function Loading() {
  return (
    <div className="fr-site flex min-h-dvh flex-col">
      <MarketingHeader hideBack />
      <main className="flex-1 pb-14" aria-busy="true">
        <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      </main>
      <SiteFooter />
      <span className="sr-only">Loading profile…</span>
    </div>
  )
}
