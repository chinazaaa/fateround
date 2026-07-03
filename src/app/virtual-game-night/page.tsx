import { MarketingLanding } from '@/components/marketing/MarketingLanding'
import { getMarketingPage, marketingMetadata } from '@/lib/marketing-landing'

export const metadata = marketingMetadata('virtual-game-night')

export default function VirtualGameNightPage() {
  return <MarketingLanding content={getMarketingPage('virtual-game-night')!} />
}
