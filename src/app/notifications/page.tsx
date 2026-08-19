import type { Metadata } from 'next'
import { MarketingHeader } from '@/components/MarketingHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { NotificationsPage } from '@/components/notifications/NotificationsPage'

export const metadata: Metadata = {
  title: 'Notifications — FateRound',
  description: 'Get a ping when a new Public game of your favourite type opens.',
}

// Next.js 16 requires `searchParams` to be awaited (App Router async params).
export default async function Page({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams
  return (
    <div className="fr-site flex min-h-dvh flex-col">
      <MarketingHeader />
      <main className="flex-1">
        <NotificationsPage preselectGameType={type} />
      </main>
      <SiteFooter />
    </div>
  )
}
