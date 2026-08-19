import { MarketingHeader } from '@/components/MarketingHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { Skeleton } from '@/components/Skeleton'

/**
 * Shown while the force-dynamic trophy cabinet builds server-side. See ../loading.tsx — without a
 * loading boundary the click reads as frozen until every query resolves.
 */
export default function Loading() {
  return (
    <div className="fr-site flex min-h-dvh flex-col">
      <MarketingHeader hideBack />
      <main className="flex-1 pb-14" aria-busy="true">
        <div className="border-b border-[var(--border)]">
          <div className="mx-auto max-w-3xl space-y-3 p-6">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
          {Array.from({ length: 3 }).map((_, g) => (
            <div key={g} className="space-y-3">
              <Skeleton className="h-5 w-40" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
      <SiteFooter />
      <span className="sr-only">Loading trophies…</span>
    </div>
  )
}
