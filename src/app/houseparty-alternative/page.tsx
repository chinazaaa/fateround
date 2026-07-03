import { MarketingLanding } from '@/components/marketing/MarketingLanding'
import { getMarketingPage, marketingMetadata } from '@/lib/marketing-landing'

export const metadata = marketingMetadata('houseparty-alternative')

export default function HousepartyAlternativePage() {
  return <MarketingLanding content={getMarketingPage('houseparty-alternative')!} />
}
