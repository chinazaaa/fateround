import { SiteLogoHeader } from '@/components/SiteLogoHeader'

export default function TournamentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteLogoHeader />
      {children}
    </>
  )
}
