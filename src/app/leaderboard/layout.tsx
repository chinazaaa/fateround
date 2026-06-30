import { SiteLogoHeader } from '@/components/SiteLogoHeader'

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteLogoHeader />
      {children}
    </>
  )
}
