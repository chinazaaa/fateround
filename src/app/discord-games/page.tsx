import { MarketingLanding } from '@/components/marketing/MarketingLanding'
import { getMarketingPage, marketingMetadata } from '@/lib/marketing-landing'

export const metadata = marketingMetadata('discord-games')

export default function DiscordGamesPage() {
  return <MarketingLanding content={getMarketingPage('discord-games')!} />
}
