import type { Metadata } from 'next'
import { GamePlayerChrome } from '@/components/GamePlayerChrome'
import { noIndexMetadata } from '@/lib/seo'

export const metadata: Metadata = noIndexMetadata('Join Game')

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GamePlayerChrome />
      {children}
    </>
  )
}
