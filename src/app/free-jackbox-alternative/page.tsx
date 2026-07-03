import { MarketingLanding } from '@/components/marketing/MarketingLanding'
import { getMarketingPage, marketingMetadata } from '@/lib/marketing-landing'

export const metadata = marketingMetadata('free-jackbox-alternative')

export default function FreeJackboxAlternativePage() {
  return <MarketingLanding content={getMarketingPage('free-jackbox-alternative')!} />
}
