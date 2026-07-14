import { View, type StyleProp, type ViewStyle } from 'react-native'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'

/**
 * Self-ticking wrapper around {@link useDeadlineCountdown}. Owns the 500ms
 * countdown to `anchorTime + delaySeconds`, so only this leaf re-renders each
 * tick — not the heavy parent player view (M1). Renders the badge only while
 * `active` and `seconds > 0`, matching the old
 * `active && seconds > 0 ? <TimerBadge/> : null` call sites.
 */
export function CountdownTimerBadge({
  anchorTime,
  delaySeconds,
  active = true,
  containerStyle,
  urgentAt,
  enableAlerts,
}: {
  anchorTime: string | null | undefined
  delaySeconds: number
  active?: boolean
  containerStyle?: StyleProp<ViewStyle>
  urgentAt?: number
  enableAlerts?: boolean
}) {
  const seconds = useDeadlineCountdown(anchorTime, delaySeconds, active && !!anchorTime)
  if (!active || seconds <= 0) return null
  const badge = <TimerBadge seconds={seconds} urgentAt={urgentAt} enableAlerts={enableAlerts} />
  return containerStyle ? <View style={containerStyle}>{badge}</View> : badge
}
