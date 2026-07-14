import { View, type StyleProp, type ViewStyle } from 'react-native'
import type { Game, Round } from '@fateround/shared'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { useRoundTimer } from '@/hooks/useRoundTimer'

const NOOP = () => {}

/**
 * Self-ticking wrapper around {@link useRoundTimer}. It owns the 500ms round
 * countdown (and fires `onExpire` on expiry), so only this leaf re-renders each
 * tick — not the heavy parent player view (M1: parents that ran `useRoundTimer`
 * themselves re-rendered the whole view twice a second). Renders the badge only
 * while `show` and `seconds > 0`, matching the old
 * `timeLeft > 0 ? <TimerBadge/> : null` call sites; the timer keeps running (and
 * can still call `onExpire`) even when the badge is hidden via `show={false}`.
 */
export function RoundTimerBadge({
  game,
  currentRound,
  active,
  onExpire,
  show = true,
  containerStyle,
  urgentAt,
  enableAlerts,
}: {
  game: Game | null
  currentRound: Round | null
  active: boolean
  onExpire?: () => void
  /** When false the timer still runs (so `onExpire` fires) but the badge is hidden. */
  show?: boolean
  /** Optional wrapper style (e.g. a centering row); omitted → bare badge. */
  containerStyle?: StyleProp<ViewStyle>
  urgentAt?: number
  enableAlerts?: boolean
}) {
  const seconds = useRoundTimer({ game, currentRound, active, onExpire: onExpire ?? NOOP })
  if (!show || seconds <= 0) return null
  const badge = <TimerBadge seconds={seconds} urgentAt={urgentAt} enableAlerts={enableAlerts} />
  return containerStyle ? <View style={containerStyle}>{badge}</View> : badge
}
