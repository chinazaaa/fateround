import type { GameType } from '@fateround/shared'
import { gameLabel } from '@/lib/mobile-registry'
import { gameTypeMeta } from '@/lib/game-type-meta'
import { shareDomain } from '@/lib/config'
import { ResultsCard } from '@/components/lifecycle/ResultsCard'
import { themedResultsPalette, type FinishedLeaderboardRow } from '@/components/game/GameChrome'
import { useTheme } from '@/constants/theme-context'

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

/**
 * Branded results card captured to an image for sharing — the same `ResultsCard`
 * the on-screen finished section renders, drawn with the SAME runtime theme
 * palette (so the shared PNG follows the player's light/dark mode, matching the
 * web share image) plus a brand footer. Kept off-screen and snapshotted via
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
  const theme = useTheme()
  const gameEmoji = gameType ? gameTypeMeta(gameType as GameType).emoji : '🎮'
  const label = gameType ? gameLabel(gameType as GameType) : undefined

  return (
    <ResultsCard
      palette={themedResultsPalette(theme)}
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
