import { MarketingLanding } from '@/components/marketing/MarketingLanding'
import { getMarketingPage, marketingMetadata } from '@/lib/marketing-landing'

export const metadata = marketingMetadata('virtual-team-games')

export default function VirtualTeamGamesPage() {
  return <MarketingLanding content={getMarketingPage('virtual-team-games')!} />
}
