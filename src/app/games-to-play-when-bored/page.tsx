import { MarketingLanding } from '@/components/marketing/MarketingLanding'
import { getMarketingPage, marketingMetadata } from '@/lib/marketing-landing'

export const metadata = marketingMetadata('games-to-play-when-bored')

export default function GamesToPlayWhenBoredPage() {
  return <MarketingLanding content={getMarketingPage('games-to-play-when-bored')!} />
}
