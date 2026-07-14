import { StyleSheet, Text, View } from 'react-native'
import { NPAT_REVEAL_SECONDS } from '@fateround/shared/npat'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Self-ticking per-phase countdown (badge + "Xs left"). Owns the 500ms tick to
 * `anchorTime + delaySeconds` so only this leaf re-renders each tick, not the
 * whole I Call On view (M1). Renders nothing while inactive or expired.
 */
export function ICallOnPhaseCountdown({
  anchorTime,
  delaySeconds,
  active,
}: {
  anchorTime: string | null | undefined
  delaySeconds: number
  active: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  const secondsLeft = useDeadlineCountdown(anchorTime, delaySeconds, active && !!anchorTime)
  if (!active || !anchorTime || secondsLeft <= 0) return null
  return (
    <View style={styles.timerWrap}>
      <TimerBadge seconds={secondsLeft} urgentAt={10} />
      <Text style={styles.timerLabel}>{secondsLeft}s left</Text>
    </View>
  )
}

/**
 * Self-ticking "answers auto-send" hint that appears in the last 10s of the
 * writing phase. Owns its own tick so the writing form doesn't re-render 2Hz.
 */
export function ICallOnAutoSendHint({
  anchorTime,
  delaySeconds,
  active,
}: {
  anchorTime: string | null | undefined
  delaySeconds: number
  active: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  const secondsLeft = useDeadlineCountdown(anchorTime, delaySeconds, active && !!anchorTime)
  if (!active || secondsLeft > 10) return null
  return <Text style={styles.autoSendHint}>Unsubmitted answers are sent automatically when time runs out.</Text>
}

/**
 * Self-ticking reveal-phase "Next letter in Xs…" line. Owns the tick to
 * `endedAt + NPAT_REVEAL_SECONDS`; the surrounding scores header stays static.
 */
export function ICallOnRevealCountdown({ endedAt }: { endedAt: string | null | undefined }) {
  const styles = useThemedStyles(makeStyles)
  const secondsLeft = useDeadlineCountdown(endedAt, NPAT_REVEAL_SECONDS, !!endedAt)
  return (
    <Text style={styles.revealCountdown}>
      {endedAt ? `Next letter in ${secondsLeft}s…` : 'Next letter coming up…'}
    </Text>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    timerWrap: { alignItems: 'center', gap: 4, marginBottom: 4 },
    timerLabel: { color: theme.textMuted, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
    autoSendHint: { color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: 6 },
    revealCountdown: { color: theme.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] },
  })
