import { SiteLogoHeader } from '@/components/SiteLogoHeader'

// Wraps every /tournament route (landing, create, and each tournament lobby) so
// the top-left FateRound wordmark shows across all of them.
export default function TournamentSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteLogoHeader />
      {children}
    </>
  )
}
