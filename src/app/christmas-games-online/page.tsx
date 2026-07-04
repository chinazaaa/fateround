import { MarketingLanding } from '@/components/marketing/MarketingLanding'
import { getMarketingPage, marketingMetadata } from '@/lib/marketing-landing'

export const metadata = marketingMetadata('christmas-games-online')

export default function ChristmasGamesOnlinePage() {
  return <MarketingLanding content={getMarketingPage('christmas-games-online')!} />
}
