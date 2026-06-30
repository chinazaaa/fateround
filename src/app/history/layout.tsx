import type { Metadata } from 'next'
import { noIndexMetadata } from '@/lib/seo'
import { SiteLogoHeader } from '@/components/SiteLogoHeader'

export const metadata: Metadata = noIndexMetadata('Game History')

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteLogoHeader />
      {children}
    </>
  )
}
