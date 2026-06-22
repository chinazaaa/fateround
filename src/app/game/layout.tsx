import type { Metadata } from 'next'
import { GamePlayerChrome } from '@/components/GamePlayerChrome'
import { GameRulesLoader } from '@/components/GameRulesLoader'
import { GameRulesProvider } from '@/contexts/GameRulesContext'
import { WhatsAppChannelLink } from '@/components/WhatsAppChannelLink'
import { noIndexMetadata } from '@/lib/seo'

export const metadata: Metadata = noIndexMetadata('Join Game')

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <GameRulesProvider>
      <GameRulesLoader />
      <GamePlayerChrome />
      <main className="pt-[3.75rem]">{children}</main>
      <footer className="flex justify-center py-5">
        <WhatsAppChannelLink />
      </footer>
    </GameRulesProvider>
  )
}
