/**
 * ScheduledConfirmReadyPrompt — post-open "I'm ready" prompt.
 *
 * Once a scheduled game flips to `waiting`, RSVPers see this floating card
 * on top of the lobby until they tap "I'm ready" (which stamps
 * game_rsvps.confirmed_at so the 10-min unconfirmed-drop cron leaves them
 * alone). Auto-hides for anyone who never RSVP'd or already confirmed.
 */

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import type { Game } from '@fateround/shared'
import { AppButton } from '@/components/ui/AppButton'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { confirmReady, fetchRsvpStatus } from '@/lib/rsvp-api'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export function ScheduledConfirmReadyPrompt({ gameCode, game }: { gameCode: string; game: Game }) {
  const styles = useThemedStyles(makeStyles)
  const [rsvped, setRsvped] = useState<boolean | null>(null)
  const [confirmed, setConfirmed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const s = await fetchRsvpStatus(gameCode)
      if (cancelled) return
      setRsvped(s.rsvped)
      setConfirmed(s.confirmed)
    })()
    return () => {
      cancelled = true
    }
  }, [gameCode])

  const onReady = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await confirmReady(gameCode)
      setConfirmed(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }, [gameCode])

  // Only fires for RSVPers who are still unconfirmed while the lobby is open.
  if (game.status !== 'waiting') return null
  if (rsvped !== true || confirmed !== false) return null

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <SurfaceCard accent style={styles.card}>
        <Text style={styles.title}>You RSVP’d 🎉</Text>
        <Text style={styles.body}>Tap “I’m ready” to take a seat. Unconfirmed RSVPs drop off after 10 min.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {busy ? <ActivityIndicator /> : <AppButton label="I’m ready" onPress={() => void onReady()} size="md" />}
      </SurfaceCard>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { position: 'absolute', top: theme.space.md, left: theme.space.md, right: theme.space.md, zIndex: 40 },
    card: { gap: theme.space.xs },
    title: { color: theme.text, fontSize: theme.type.section.size, fontWeight: '800' },
    body: { color: theme.textMuted, fontSize: theme.type.body.size },
    error: { color: theme.error, fontSize: theme.type.label.size },
  })
