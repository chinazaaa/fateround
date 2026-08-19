import type { Metadata } from 'next'
import { TrollRunDevPlayground } from '@/components/troll-run/TrollRunDevPlayground'

export const metadata: Metadata = {
  title: 'Troll Run Engine Dev Playground | FateRound',
  description: 'Playtest the Level Devil-inspired Troll Run 2D physics engine and World 1 prototype levels.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function TrollRunDevPage() {
  return <TrollRunDevPlayground />
}
