import { MarketingLanding } from '@/components/marketing/MarketingLanding'
import { getMarketingPage, marketingMetadata } from '@/lib/marketing-landing'

export const metadata = marketingMetadata('free-online-party-games')

export default function FreeOnlinePartyGamesPage() {
  return <MarketingLanding content={getMarketingPage('free-online-party-games')!} />
}
