/**
 * ScheduledGameScreen — mobile screen shown on /game/[code] when the game is
 * still `status='scheduled'`. Big RSVP / "RSVP'd — tap to cancel" button,
 * countdown to `scheduled_at`, and a peek at how many others RSVP'd.
 *
 * Once the game flips to `waiting` (T-0), the parent GameScreen unmounts this
 * and mounts the normal game router. The confirm-ready prompt for RSVPers is
 * handled by ScheduledConfirmReadyPrompt on the same screen.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { Game, GameType } from '@fateround/shared'
import { AppButton } from '@/components/ui/AppButton'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { SafeAreaView } from 'react-native-safe-area-context'
import { fetchRsvpStatus, rsvp as apiRsvp, unrsvp as apiUnrsvp } from '@/lib/rsvp-api'
import { gameLabel } from '@/lib/mobile-registry'
import { gameTypeMeta } from '@/lib/game-type-meta'
import { getHostToken } from '@/lib/secure-session'
import { ScheduledHostActionsSheet } from '@/components/host/ScheduledHostActionsSheet'
import type { Theme } from '@/constants/theme'
import { useThemedStyles, useTheme } from '@/constants/theme-context'

function formatFull(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function useCountdown(target: string | null | undefined): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!target) return undefined
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [target])
  return useMemo(() => {
    if (!target) return ''
    const diff = new Date(target).getTime() - now
    if (diff <= 0) return 'Opening now…'
    const mins = Math.floor(diff / 60_000)
    if (mins < 60) return `Opens in ${mins} min`
    const hours = Math.floor(mins / 60)
    if (hours < 48) return `Opens in ${hours} h`
    const days = Math.floor(hours / 24)
    return `Opens in ${days} days`
  }, [target, now])
}

export function ScheduledGameScreen({ gameCode, game }: { gameCode: string; game: Game }) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const router = useRouter()
  const [rsvped, setRsvped] = useState(false)
  const [rsvpCount, setRsvpCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hostToken, setHostToken] = useState<string | null>(null)
  const [hostSheetOpen, setHostSheetOpen] = useState(false)

  useEffect(() => {
    void getHostToken(gameCode).then(setHostToken)
  }, [gameCode])
  const meta = gameTypeMeta(game.game_type as GameType)
  const label = gameLabel(game.game_type as GameType) || game.title || 'Game'
  const countdown = useCountdown(game.scheduled_at)

  const load = useCallback(async () => {
    const s = await fetchRsvpStatus(gameCode)
    setRsvped(s.rsvped)
    setRsvpCount(s.rsvpCount)
    setLoading(false)
  }, [gameCode])

  useEffect(() => {
    void load()
  }, [load])

  const onToggle = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      if (rsvped) {
        await apiUnrsvp(gameCode)
        setRsvped(false)
        setRsvpCount((n) => Math.max(0, n - 1))
      } else {
        await apiRsvp(gameCode)
        setRsvped(true)
        setRsvpCount((n) => n + 1)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }, [gameCode, rsvped])

  return (
    <SafeAreaView style={styles.safe}>
      <AmbientBackground />
      <View style={styles.content}>
        <Pressable style={styles.back} onPress={() => router.replace('/browse' as never)} hitSlop={8}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <View style={styles.hero}>
          <Text style={styles.emoji}>{meta.emoji}</Text>
          <Text style={styles.kicker}>Scheduled game</Text>
          <Text style={styles.title}>{label}</Text>
          {game.scheduled_at ? (
            <>
              <Text style={styles.when}>{formatFull(game.scheduled_at)}</Text>
              <Text style={styles.countdown}>{countdown}</Text>
            </>
          ) : null}
        </View>

        <SurfaceCard>
          <Text style={styles.rowLabel}>
            {rsvpCount === 0 ? 'Be the first to RSVP' : `${rsvpCount} ${rsvpCount === 1 ? 'person' : 'people'} RSVP’d`}
          </Text>
          {loading ? (
            <ActivityIndicator color={theme.primary} />
          ) : busy ? (
            <ActivityIndicator color={theme.primary} />
          ) : rsvped ? (
            <AppButton label="RSVP’d — tap to cancel" tone="secondary" onPress={onToggle} fullWidth size="lg" />
          ) : (
            <AppButton label="RSVP" onPress={onToggle} fullWidth size="lg" />
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.hint}>We’ll ping you 15 minutes before it opens (needs notifications).</Text>
        </SurfaceCard>

        {hostToken ? (
          <SurfaceCard>
            <Text style={styles.rowLabel}>Host controls</Text>
            <Text style={styles.hint}>
              Reschedule to move it earlier (Now / +5 / +15) or later, or cancel the game entirely. Start is disabled on
              scheduled games — reschedule to Now to open the lobby immediately.
            </Text>
            <AppButton
              label="Manage scheduled game"
              tone="secondary"
              onPress={() => setHostSheetOpen(true)}
              fullWidth
              size="md"
            />
          </SurfaceCard>
        ) : null}
      </View>
      {hostToken ? (
        <ScheduledHostActionsSheet
          visible={hostSheetOpen}
          onClose={() => setHostSheetOpen(false)}
          gameCode={gameCode}
          hostToken={hostToken}
          currentScheduledAt={game.scheduled_at ?? null}
        />
      ) : null}
    </SafeAreaView>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    content: { flex: 1, padding: theme.space.md, gap: theme.space.md },
    back: { paddingVertical: 4 },
    backText: { color: theme.primary, fontSize: theme.type.label.size, fontWeight: '700' },
    hero: { alignItems: 'center', gap: 4, paddingVertical: theme.space.md },
    emoji: { fontSize: 44 },
    kicker: {
      color: theme.primaryMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    title: { color: theme.text, fontSize: 28, fontWeight: '900' },
    when: { color: theme.textMuted, fontSize: theme.type.body.size, marginTop: 6 },
    countdown: { color: theme.primary, fontSize: theme.type.section.size, fontWeight: '800', marginTop: 4 },
    rowLabel: { color: theme.text, fontSize: theme.type.section.size, fontWeight: '800' },
    error: { color: theme.error, fontSize: theme.type.label.size },
    hint: { color: theme.textMuted, fontSize: 13 },
  })
