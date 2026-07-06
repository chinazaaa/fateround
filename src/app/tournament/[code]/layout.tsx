import { SiteLogoHeader } from '@/components/SiteLogoHeader'

// Live tournament lobby keeps the minimal wordmark header (not the full site
// nav), so the in-game flow isn't wrapped in marketing chrome.
export default function TournamentLobbyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteLogoHeader />
      {children}
    </>
  )
}
