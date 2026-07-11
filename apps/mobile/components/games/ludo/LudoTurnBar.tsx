import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { LudoSession } from '@fateround/shared'
import { apiUrl } from '@/lib/config'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { useAbsoluteDeadline } from '@/components/party/useAbsoluteDeadline'
import { TimerBadge } from '@/components/ui/TimerBadge'

/**
 * Per-turn countdown bar for Ludo. Mirrors the web LudoTurnBar + useLudoTurnTimer:
 * shows whose turn it is and a live countdown to `turn_deadline_at`, and once the
 * clock hits zero best-effort POSTs to the server expire-turn endpoint (idempotent +
 * deadline-gated server-side) so a stalled turn passes on. The countdown only shows
 * when the host configured a per-turn timer (a deadline is present).
 */
export function LudoTurnBar({
  gameCode,
  session,
  turnPlayerName,
  isMyTurn,
  active,
}: {
  gameCode: string
  session: LudoSession
  turnPlayerName?: string
  isMyTurn: boolean
  active: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  const hasTimer = !!session.turn_deadline_at && session.phase !== 'finished'
  const secondsLeft = useAbsoluteDeadline(session.turn_deadline_at, active && hasTimer)

  useEffect(() => {
    if (!active || !hasTimer || secondsLeft > 0) return
    let cancelled = false
    let retryId: ReturnType<typeof setTimeout> | undefined
    const fire = async () => {
      try {
        await fetch(apiUrl('/api/ludo/expire-turn'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode.toUpperCase() }),
        })
      } catch {
        // Best-effort client expiry; retry until the realtime update arrives.
      } finally {
        if (!cancelled) retryId = setTimeout(() => void fire(), 5000)
      }
    }
    void fire()
    return () => {
      cancelled = true
      if (retryId) clearTimeout(retryId)
    }
  }, [active, hasTimer, secondsLeft, gameCode])

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
