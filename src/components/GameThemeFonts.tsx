import { Barlow_Condensed, IM_Fell_English_SC, Pirata_One } from 'next/font/google'

const pirataOne = Pirata_One({ weight: '400', variable: '--font-pirata', subsets: ['latin'], display: 'swap' })
const imFell = IM_Fell_English_SC({ weight: '400', variable: '--font-naval', subsets: ['latin'], display: 'swap' })
const arcticHeader = Barlow_Condensed({
  weight: ['500', '600', '700'],
  variable: '--font-arctic',
  subsets: ['latin'],
  display: 'swap',
})

const gameFontClass = `${pirataOne.variable} ${imFell.variable} ${arcticHeader.variable}`

/** Decorative game-theme fonts — loaded only on play/host routes, not the marketing homepage. */
export function GameThemeFonts({ children }: { children: React.ReactNode }) {
  return <div className={`contents ${gameFontClass}`}>{children}</div>
}
