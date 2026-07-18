import type { Metadata } from 'next'
import { GamePlayerChrome } from '@/components/GamePlayerChrome'
import { GameRulesLoader } from '@/components/GameRulesLoader'
import { GameThemeFonts } from '@/components/GameThemeFonts'
import { GameRulesProvider } from '@/contexts/GameRulesContext'
import { RosterDrawerProvider } from '@/components/roster/RosterDrawerContext'
import { RosterDrawer } from '@/components/roster/RosterDrawer'
import { noIndexMetadata } from '@/lib/seo'

export const metadata: Metadata = noIndexMetadata('Join Game')

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <GameThemeFonts>
      <GameRulesProvider>
        <RosterDrawerProvider>
          <GameRulesLoader />
          <GamePlayerChrome />
          <main className="pt-[3.75rem]">{children}</main>
          <RosterDrawer />
        </RosterDrawerProvider>
      </GameRulesProvider>
    </GameThemeFonts>
  )
}
