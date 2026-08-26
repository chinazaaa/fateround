import type { Metadata } from 'next'
import { createMetadata } from '@/lib/seo'
import { SiteLogoHeader } from '@/components/SiteLogoHeader'

export const metadata: Metadata = createMetadata()

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteLogoHeader />
      {children}
    </>
  )
}
