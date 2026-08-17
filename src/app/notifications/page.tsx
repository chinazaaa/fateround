import type { Metadata } from 'next'
import { MarketingHeader } from '@/components/MarketingHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { NotificationsPage } from '@/components/notifications/NotificationsPage'

export const metadata: Metadata = {
  title: 'Notifications — FateRound',
  description: 'Get a ping when a new Public game of your favourite type opens.',
}

export default function Page({ searchParams }: { searchParams: { type?: string } }) {
  return (
    <div className="fr-site flex min-h-dvh flex-col">
      <MarketingHeader />
      <main className="flex-1">
        <NotificationsPage preselectGameType={searchParams?.type} />
      </main>
      <SiteFooter />
    </div>
  )
}
