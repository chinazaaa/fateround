import { Suspense } from 'react'
import type { Metadata } from 'next'
import { noIndexMetadata } from '@/lib/seo'
import { SiteLogoHeader } from '@/components/SiteLogoHeader'

// A personal page — nothing here should be indexed or served as a landing page.
export const metadata: Metadata = noIndexMetadata('Your profile')

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteLogoHeader />
      <div className="pt-14">
        <Suspense>{children}</Suspense>
      </div>
    </>
  )
}
