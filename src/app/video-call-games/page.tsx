import { MarketingLanding } from '@/components/marketing/MarketingLanding'
import { getMarketingPage, marketingMetadata } from '@/lib/marketing-landing'

export const metadata = marketingMetadata('video-call-games')

export default function VideoCallGamesPage() {
  return <MarketingLanding content={getMarketingPage('video-call-games')!} />
}
