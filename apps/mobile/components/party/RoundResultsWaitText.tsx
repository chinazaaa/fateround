import { Text, type StyleProp, type TextStyle } from 'react-native'
import {
  ROUND_RESULTS_AUTO_ADVANCE_SECONDS,
  finalResultsAutoRevealSeconds,
  roundResultsWaitMessage,
} from '@fateround/shared/round-timing'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'

/**
 * Self-ticking round-results wait line ("Next round starting in Xs…" / "Final
 * results in Xs…"). Owns the countdown to `anchorTime + delay`, so only this
 * leaf re-renders each tick instead of the whole results view (M1). Mirrors the
 * old parent-computed `roundResultsWaitMessage` call sites.
 */
export function RoundResultsWaitText({
  anchorTime,
  isLastRound,
  autoReveal,
  gameType,
  active = true,
  style,
}: {
  anchorTime: string | null | undefined
  isLastRound: boolean
  autoReveal: boolean
  gameType?: string | null
  active?: boolean
  style?: StyleProp<TextStyle>
}) {
  const delay = isLastRound
    ? finalResultsAutoRevealSeconds(gameType ?? undefined)
    : ROUND_RESULTS_AUTO_ADVANCE_SECONDS
  const secondsLeft = useDeadlineCountdown(anchorTime, delay, active)
  const message = roundResultsWaitMessage({
    isLastRound,
    autoReveal,
    nextRoundSecondsLeft: isLastRound ? 0 : secondsLeft,
    finalRevealSecondsLeft: isLastRound ? secondsLeft : undefined,
  })
  return <Text style={style}>{message}</Text>
}
