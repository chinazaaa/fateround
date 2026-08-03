import type { Metadata } from 'next'
import { noIndexMetadata } from '@/lib/seo'
import { SiteLogoHeader } from '@/components/SiteLogoHeader'

// A personal page — nothing here should be indexed or served as a landing page.
export const metadata: Metadata = noIndexMetadata('Your trophies')

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteLogoHeader />
      {/* SiteLogoHeader is fixed, so the page needs to clear it — without this the heading sits
          underneath the logo. */}
      <div className="pt-14">{children}</div>
    </>
  )
}
