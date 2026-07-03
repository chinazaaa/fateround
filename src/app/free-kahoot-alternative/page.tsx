import { MarketingLanding } from '@/components/marketing/MarketingLanding'
import { getMarketingPage, marketingMetadata } from '@/lib/marketing-landing'

export const metadata = marketingMetadata('free-kahoot-alternative')

export default function FreeKahootAlternativePage() {
  return <MarketingLanding content={getMarketingPage('free-kahoot-alternative')!} />
}
