import type { Metadata } from 'next'
import { HomePage } from '@/components/HomePage'
import { homeMetadata, organizationJsonLd, webApplicationJsonLd } from '@/lib/seo'

export const metadata: Metadata = homeMetadata()

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: webApplicationJsonLd() }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: organizationJsonLd() }} />
      <HomePage />
    </>
  )
}
