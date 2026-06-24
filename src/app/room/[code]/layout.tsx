import type { Metadata } from 'next'

type Props = {
  children: React.ReactNode
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { code } = await params
  return {
    title: `Room ${code} — Fate Round`,
    description: 'Your friend group game room. Play, chat, and track stats together.',
  }
}

export default function RoomCodeLayout({ children }: Props) {
  return children
}
