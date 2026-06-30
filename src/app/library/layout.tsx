import { SiteLogoHeader } from '@/components/SiteLogoHeader'

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteLogoHeader />
      {children}
    </>
  )
}
