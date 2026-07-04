import { notFound } from 'next/navigation'
import { MarketingLanding } from '@/components/marketing/MarketingLanding'
import { getMarketingPage, marketingMetadata } from '@/lib/marketing-landing'

/**
 * Builds the `metadata` export and page component for a marketing landing route
 * from its slug, in one place. Resolves the content once and 404s via
 * `notFound()` if the slug has no matching entry — instead of the `!` non-null
 * assertion each route used to carry, which would have rendered
 * `MarketingLanding` with `null` content at runtime on any slug drift.
 */
export function createMarketingPage(slug: string) {
  return {
    metadata: marketingMetadata(slug),
    Page: function MarketingPage() {
      const content = getMarketingPage(slug)
      if (!content) notFound()
      return <MarketingLanding content={content} />
    },
  }
}
