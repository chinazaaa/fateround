import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { Game } from '@fateround/shared'
import { apiUrl } from '@/lib/config'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'

function formatMinutesSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${rem.toString().padStart(2, '0')}`
}

// Mirrors web MatchingPairsGameTimerBar: a "Game time left" countdown bar driven by
// the host's time limit (timer_seconds). Turns urgent (red) under 60s and best-effort
// fires the server expiry once the clock hits zero. Anchors to the round start so the
// clock is consistent across rounds.
export function MatchingPairsGameTimerBar({
  gameCode,
  game,
  roundStartedAt,
}: {
  gameCode: string
  game: Pick<Game, 'status' | 'session_started_at' | 'timer_seconds'> | null
  roundStartedAt?: string | null
}) {
  const styles = useThemedStyles(makeStyles)
  const duration = game?.timer_seconds ?? 0
  const active = game?.status === 'active' && duration > 0
  const anchor = roundStartedAt || game?.session_started_at
  const secondsLeft = useDeadlineCountdown(anchor, duration, active)

  useEffect(() => {
    if (!active || secondsLeft > 0) return
    let cancelled = false
    let retryId: ReturnType<typeof setTimeout> | undefined
    const fire = async () => {
      try {
        await fetch(apiUrl(`/api/games/${gameCode.toUpperCase()}/expire-matching-pairs`), { method: 'POST' })
      } catch {
        // Best-effort client expiry; retry until the game status update arrives.
      } finally {
        if (!cancelled) retryId = setTimeout(() => void fire(), 5000)
      }
    }
    void fire()
    return () => {
      cancelled = true
      if (retryId) clearTimeout(retryId)
    }
  }, [active, secondsLeft, gameCode])

  if (!active) return null

  const urgent = secondsLeft <= 60
  const progress = Math.max(0, Math.min(100, (secondsLeft / duration) * 100))

  return (
    <View style={[styles.bar, urgent && styles.barUrgent]}>
      <View style={styles.row}>
        <Text style={styles.label}>Game time left</Text>
        <Text style={[styles.time, urgent && styles.timeUrgent]}>{formatMinutesSeconds(secondsLeft)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, urgent && styles.fillUrgent, { width: `${progress}%` }]} />
      </View>
      <Text style={styles.footnote}>When time runs out, the current scores are final</Text>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 6,
    },
    // Functional urgent-amber state — kept fixed across themes.
    barUrgent: { borderColor: '#f59e0b59', backgroundColor: 'rgba(245,158,11,0.08)' },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    label: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    time: { color: theme.text, fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
    timeUrgent: { color: '#f43f5e' },
    track: { height: 4, borderRadius: 999, backgroundColor: theme.surfaceHover, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 999, backgroundColor: theme.primary },
    fillUrgent: { backgroundColor: '#f43f5e' },
    footnote: { color: theme.textMuted, fontSize: 10, textAlign: 'center' },
  })
