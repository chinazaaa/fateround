import type { Metadata } from 'next'
import { noIndexMetadata } from '@/lib/seo'

export const metadata: Metadata = noIndexMetadata('Game History')

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return children
}
