import type { Metadata } from 'next'
import { noIndexMetadata } from '@/lib/seo'

export const metadata: Metadata = noIndexMetadata('Join Game')

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return children
}
