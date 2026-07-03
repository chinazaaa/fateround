import { MarketingLanding } from '@/components/marketing/MarketingLanding'
import { getMarketingPage, marketingMetadata } from '@/lib/marketing-landing'

export const metadata = marketingMetadata('long-distance-games')

export default function LongDistanceGamesPage() {
  return <MarketingLanding content={getMarketingPage('long-distance-games')!} />
}
