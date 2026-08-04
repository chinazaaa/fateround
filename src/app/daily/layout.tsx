import { SiteChrome } from '@/components/SiteChrome'

export const dynamic = 'force-dynamic'

export default function DailyLayout({ children }: { children: React.ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>
}
