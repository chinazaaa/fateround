import type { Metadata } from 'next'
import { Suspense } from 'react'
import { GameHostChrome } from '@/components/GameHostChrome'
import { HostScrollToTop } from '@/components/host/HostScrollToTop'
import { HostPlayerSessionBootstrap } from '@/components/HostPlayerSessionBootstrap'
import { GameRulesLoader } from '@/components/GameRulesLoader'
import { GameRulesProvider } from '@/contexts/GameRulesContext'
import { noIndexMetadata } from '@/lib/seo'

export const metadata: Metadata = noIndexMetadata('Host Panel')

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return (
    <GameRulesProvider>
      <GameRulesLoader />
      <Suspense fallback={null}>
        <HostScrollToTop />
        <HostPlayerSessionBootstrap />
        <GameHostChrome />
      </Suspense>
      <main className="pt-[3.75rem]">{children}</main>
    </GameRulesProvider>
  )
}
