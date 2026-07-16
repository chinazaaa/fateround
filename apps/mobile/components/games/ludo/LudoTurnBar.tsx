import { StyleSheet, Text, View } from 'react-native'
import type { LudoSession } from '@fateround/shared'
import { apiUrl } from '@/lib/config'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { useAbsoluteDeadline } from '@/components/party/useAbsoluteDeadline'
import { useTurnExpiryTimer } from '@/hooks/useTurnExpiryTimer'
import { TimerBadge } from '@/components/ui/TimerBadge'

/**
 * Per-turn countdown bar for Ludo. Mirrors the web LudoTurnBar + useLudoTurnTimer
 * exactly: shows whose turn it is and a live countdown to `turn_deadline_at`, and
 * once the clock hits zero POSTs to the server expire-turn endpoint (idempotent +
 * deadline-gated server-side) so a stalled turn passes on. Auto-expiry is driven
 * through the shared `useTurnExpiryTimer` (fire-once + 3s cooldown, same as web's
 * useTurnTimer) and only by non-viewer players while the game is active — viewers/
 * spectators never fire expire-turn, matching web's `enabled` gate. The countdown
 * only shows when the host configured a per-turn timer (a deadline is present).
 */
export function LudoTurnBar({
  gameCode,
  session,
  turnPlayerName,
  isMyTurn,
  active,
  isViewer = false,
}: {
  gameCode: string
  session: LudoSession
  turnPlayerName?: string
  isMyTurn: boolean
  active: boolean
  isViewer?: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  const hasTimer = !!session.turn_deadline_at && session.phase !== 'finished'
  // Web parity: game.status === 'active' && !isViewer decides who drives the timer.
  const enabled = active && hasTimer && !isViewer
  const secondsLeft = useAbsoluteDeadline(session.turn_deadline_at, enabled)

  useTurnExpiryTimer({
    deadlineAt: hasTimer ? session.turn_deadline_at : null,
    enabled,
    onExpire: () =>
      fetch(apiUrl('/api/ludo/expire-turn'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode.toUpperCase() }),
      }),
  })

  return (
    <View style={[styles.bar, isMyTurn && styles.barMine]}>
      <Text style={[styles.label, isMyTurn && styles.labelMine]}>
        {isMyTurn ? 'Your turn' : turnPlayerName ? `${turnPlayerName}'s turn` : 'Waiting…'}
      </Text>
      {hasTimer && secondsLeft > 0 ? <TimerBadge seconds={secondsLeft} /> : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    barMine: { borderColor: theme.primary, backgroundColor: theme.surfaceHover },
    label: { color: theme.textMuted, fontWeight: '700', fontSize: 14 },
    labelMine: { color: theme.text },
  })
