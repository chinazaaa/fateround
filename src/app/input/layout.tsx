import { SiteLogoHeader } from '@/components/SiteLogoHeader'

export default function InputLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteLogoHeader />
      {children}
    </>
  )
}
