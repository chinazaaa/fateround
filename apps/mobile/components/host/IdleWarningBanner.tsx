/**
 * IdleWarningBanner — T-13min "keep this lobby open" prompt for the host.
 *
 * Shows in the host lobby when `last_activity_at` is older than 13 minutes
 * (the plan's 2-minute warning before the 15-minute auto-close cron). One
 * bite per game — a Keep-open tap stamps `host_idle_warning_sent_at`
 * server-side, so a subsequent idle window never re-warns.
 *
 * The T-13min DIRECTED PUSH to the host device is a companion to this banner
 * and lives on the server (see docs/mobile-discovery-plan.md § "Host T-13min
 * warning — banner AND push"); when that ships, both stay deduped by the same
 * `host_idle_warning_sent_at` column.
 */

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import type { Game } from '@fateround/shared'
import { patchGameSettings } from '@/lib/game-api'
import { apiUrl } from '@/lib/config'
import { AppButton } from '@/components/ui/AppButton'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const WARN_AT_MS = 13 * 60 * 1000
// Re-eval the "is it 13 minutes stale yet?" predicate every 30 seconds while
// mounted so the banner appears without needing a game-row update to trigger a
// re-render.
const RECHECK_INTERVAL_MS = 30_000

type Props = {
  game: Game
  gameCode: string
  hostToken: string
  onSaved: () => void
}

export function IdleWarningBanner({ game, gameCode, hostToken, onSaved }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (game.status !== 'waiting') return undefined
    const t = setInterval(() => setNow(Date.now()), RECHECK_INTERVAL_MS)
    return () => clearInterval(t)
  }, [game.status])

  // Client-side fallback for the T-13 push. Fires from the host's device
  // once the banner reaches its trigger threshold, so the push still lands
  // when the pg_cron job isn't set up. Endpoint's atomic stamp de-dupes
  // against the cron path.
  useEffect(() => {
    if (game.status !== 'waiting') return
    if (game.host_idle_warning_sent_at) return
    const lastMs = game.last_activity_at ? new Date(game.last_activity_at).getTime() : 0
    if (!lastMs || now - lastMs < WARN_AT_MS) return
    void fetch(apiUrl(`/api/games/${gameCode.toUpperCase()}/warn-idle-now`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostToken }),
    }).catch(() => undefined)
  }, [game.status, game.host_idle_warning_sent_at, game.last_activity_at, now, gameCode, hostToken])

  const onKeepOpen = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await patchGameSettings(gameCode, hostToken, { keep_lobby_alive: true } as { keep_lobby_alive: true })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not keep the lobby open')
    } finally {
      setBusy(false)
    }
  }, [gameCode, hostToken, onSaved])

  if (game.status !== 'waiting') return null
  if (game.host_idle_warning_sent_at) return null
  const lastMs = game.last_activity_at ? new Date(game.last_activity_at).getTime() : 0
  if (!lastMs) return null
  if (now - lastMs < WARN_AT_MS) return null

  return (
    <SurfaceCard style={styles.card} accent>
      <Text style={styles.title}>⏳ This lobby closes in 2 minutes</Text>
      <Text style={styles.body}>Nobody joined and the game hasn’t started. Tap to keep it open.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {busy ? <ActivityIndicator /> : <AppButton label="Keep open" onPress={() => void onKeepOpen()} size="md" />}
    </SurfaceCard>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { marginBottom: theme.space.sm },
    title: { color: theme.text, fontSize: theme.type.section.size, fontWeight: '800' },
    body: { color: theme.textMuted, fontSize: theme.type.body.size },
    error: { color: theme.error, fontSize: theme.type.label.size },
  })
