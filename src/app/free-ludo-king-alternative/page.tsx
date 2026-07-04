import { MarketingLanding } from '@/components/marketing/MarketingLanding'
import { getMarketingPage, marketingMetadata } from '@/lib/marketing-landing'

export const metadata = marketingMetadata('free-ludo-king-alternative')

export default function FreeLudoKingAlternativePage() {
  return <MarketingLanding content={getMarketingPage('free-ludo-king-alternative')!} />
}
