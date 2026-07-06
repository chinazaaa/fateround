import { SiteLogoHeader } from '@/components/SiteLogoHeader'

// Deep tournament routes keep the minimal wordmark header (not the full site
// nav), so a live tournament flow isn't wrapped in marketing chrome.
export default function TournamentCreateLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteLogoHeader />
      {children}
    </>
  )
}
