import type { Metadata } from 'next'
import { BrowseGamesPage } from '@/components/browse/BrowseGamesPage'

export const metadata: Metadata = {
  title: 'Public Games — FateRound',
  description: 'Browse public games happening right now and jump straight in — no sign-up needed.',
}

export default function Page() {
  return <BrowseGamesPage />
}
