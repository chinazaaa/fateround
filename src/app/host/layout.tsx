import type { Metadata } from 'next'
import { HostRulesChrome } from '@/components/HostRulesChrome'
import { noIndexMetadata } from '@/lib/seo'

export const metadata: Metadata = noIndexMetadata('Host Panel')

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HostRulesChrome />
      {children}
    </>
  )
}
