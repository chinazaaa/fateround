import type { Metadata } from 'next'
import { MarketingLanding } from '@/components/marketing/MarketingLanding'
import { getMarketingPage } from '@/lib/marketing-landing'
import { SITE_NAME, OG_IMAGE } from '@/lib/seo'

const content = getMarketingPage('free-jackbox-alternative')!

export const metadata: Metadata = {
  title: content.seoTitle,
  description: content.seoDescription,
  keywords: content.keywords,
  alternates: { canonical: `/${content.slug}` },
  openGraph: {
    title: `${content.seoTitle} | ${SITE_NAME}`,
    description: content.seoDescription,
    url: `/${content.slug}`,
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${content.seoTitle} | ${SITE_NAME}`,
    description: content.seoDescription,
    images: [OG_IMAGE.url],
  },
}

export default function FreeJackboxAlternativePage() {
  return <MarketingLanding content={content} />
}
