import { MarketingLanding } from '@/components/marketing/MarketingLanding'
import { getMarketingPage, marketingMetadata } from '@/lib/marketing-landing'

export const metadata = marketingMetadata('nigerian-games')

export default function NigerianGamesPage() {
  return <MarketingLanding content={getMarketingPage('nigerian-games')!} />
}
