import type { Metadata } from 'next'
import { RoomsPage } from '@/components/rooms/RoomsPage'

export const metadata: Metadata = {
  title: 'Game Rooms — Fate Round',
  description:
    'Create a persistent room for your friend group. Play multiple games, track stats, and chat — no sign-up needed.',
}

export default function Page() {
  return <RoomsPage />
}
