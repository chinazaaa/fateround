import type { GameType } from '@fateround/shared'
import { gameLabel } from '@/lib/mobile-registry'
import { gameTypeMeta } from '@/lib/game-type-meta'
import { shareDomain } from '@/lib/config'
import { ResultsCard, type ResultsPalette } from '@/components/lifecycle/ResultsCard'
import type { FinishedLeaderboardRow } from '@/components/game/GameChrome'

type Props = {
  gameType?: GameType | string | null
  gameTitle?: string | null
  /** Headline, e.g. "Naza wins!". */
  resultTitle?: string
  /** Short uppercase flavor line, e.g. "FINAL STANDINGS". */
  subtitle?: string | null
  /** Sub-headline, e.g. "BINGO!". */
  resultDetail?: string | null
  /** Hero emoji — 🏆 for a winner, 🏁 otherwise. */
  emoji?: string
  leaderboard?: FinishedLeaderboardRow[]
}

/** Fixed light palette so the shared PNG looks the same in light or dark mode. */
const LIGHT_PALETTE: ResultsPalette = {
  cardBg: '#ffffff',
  gameTitle: '#e11d48',
  label: '#9ca3af',
  divider: '#f1e0e4',
  result: '#0b0b0f',
  subtitle: '#e11d48',
  detail: '#9ca3af',
  rowBg: '#f7f7fa',
  rowBorder: '#eee',
  rowWinnerBg: '#fdeef1',
  rowWinnerBorder: '#f43f5e',
  rank: '#6b7280',
  rowName: '#1a1a1a',
  rowNameWinner: '#0b0b0f',
  you: '#0d9488',
  rowDetail: '#9ca3af',
  rowValue: '#6b7280',
  rowValueWinner: '#e11d48',
  brand: '#d1d5db',
}

/**
 * Light, branded results card captured to an image for sharing — the same
 * `ResultsCard` the on-screen finished section renders, drawn with a fixed light
 * palette and a brand footer. Kept off-screen and snapshotted via
 * react-native-view-shot.
 */
export function ShareResultCard({
  gameType,
  gameTitle,
  resultTitle,
  subtitle,
  resultDetail,
  emoji = '🏆',
  leaderboard,
}: Props) {
  const gameEmoji = gameType ? gameTypeMeta(gameType as GameType).emoji : '🎮'
  const label = gameType ? gameLabel(gameType as GameType) : undefined

  return (
    <ResultsCard
      palette={LIGHT_PALETTE}
      gameEmoji={gameEmoji}
      gameTitle={gameTitle}
      label={label}
      emoji={emoji}
      resultTitle={resultTitle}
      subtitle={subtitle}
      detail={resultDetail}
      leaderboard={leaderboard}
      brand={shareDomain()}
      width={340}
    />
  )
}
