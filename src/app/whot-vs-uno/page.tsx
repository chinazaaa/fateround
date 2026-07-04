import { MarketingLanding } from '@/components/marketing/MarketingLanding'
import { getMarketingPage, marketingMetadata } from '@/lib/marketing-landing'

export const metadata = marketingMetadata('whot-vs-uno')

export default function WhotVsUnoPage() {
  return <MarketingLanding content={getMarketingPage('whot-vs-uno')!} />
}
