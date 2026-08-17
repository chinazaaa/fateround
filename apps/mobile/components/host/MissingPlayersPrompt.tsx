/**
 * MissingPlayersPrompt — dismissible "make it Public" nudge above the roster.
 *
 * Fires in the host lobby when all four conditions hold:
 *   1. The game has been WAITING for more than 30 seconds.
 *   2. `current_players < max_players - 1` (at least 2 seats still empty).
 *   3. `is_public = false` (already-Public games don't need this nudge).
 *   4. The game type isn't strictly 1v1 (@fateround/shared/public-hints).
 *
 * Tapping "Make public" flips the flag via the shared PATCH endpoint. Dismissing
 * persists per game_code in SecureStore so a host who deliberately kept the game
 * private doesn't get re-prompted every 30 seconds for the rest of the lobby.
 */

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import type { Game } from '@fateround/shared'
import { isHeadToHeadGame } from '@fateround/shared/public-hints'
import { patchGameSettings } from '@/lib/game-api'
import { AppButton } from '@/components/ui/AppButton'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const WAIT_MS = 30_000

// SecureStore keys ban characters outside [A-Za-z0-9._-]. Game codes are safe;
// still normalise so a stray casing never mints two entries for the same game.
function dismissKey(gameCode: string): string {
  return `missing-players-dismissed.${gameCode.toUpperCase()}`
}

type Props = {
  game: Game
  gameCode: string
  hostToken: string
  activePlayers: number
  maxPlayers: number | null
  onSaved: () => void
}

export function MissingPlayersPrompt({ game, gameCode, hostToken, activePlayers, maxPlayers, onSaved }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [waitElapsed, setWaitElapsed] = useState(false)
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Wait 30s after we first see this game in the lobby before showing the
  // prompt. A T=0 nudge fires the second the host lands on the screen and
  // reads as pushy; T=30s gives at least one friend a chance to arrive first.
  useEffect(() => {
    if (game.status !== 'waiting') return undefined
    const t = setTimeout(() => setWaitElapsed(true), WAIT_MS)
    return () => clearTimeout(t)
  }, [game.status, gameCode])

  useEffect(() => {
    void SecureStore.getItemAsync(dismissKey(gameCode)).then((v) => setDismissed(v === '1'))
  }, [gameCode])

  const onMakePublic = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await patchGameSettings(gameCode, hostToken, { is_public: true })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not make this game public')
    } finally {
      setBusy(false)
    }
  }, [gameCode, hostToken, onSaved])

  const onDismiss = useCallback(async () => {
    setDismissed(true)
    try {
      await SecureStore.setItemAsync(dismissKey(gameCode), '1')
    } catch {
      // Persistence is best-effort — state is set locally regardless.
    }
  }, [gameCode])

  const eligible =
    game.status === 'waiting' &&
    game.is_public !== true &&
    !isHeadToHeadGame(game.game_type) &&
    maxPlayers != null &&
    maxPlayers >= 2 &&
    activePlayers < maxPlayers - 1

  if (!eligible || dismissed === null || dismissed || !waitElapsed) return null

  return (
    <SurfaceCard style={styles.card} accent>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Missing players?</Text>
        <Pressable onPress={() => void onDismiss()} hitSlop={8} accessibilityLabel="Dismiss">
          <Text style={styles.dismissX}>×</Text>
        </Pressable>
      </View>
      <Text style={styles.body}>Make this game public so anyone browsing can join.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {busy ? <ActivityIndicator /> : <AppButton label="Make public" onPress={() => void onMakePublic()} size="md" />}
    </SurfaceCard>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { marginBottom: theme.space.sm },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: theme.text, fontSize: theme.type.section.size, fontWeight: '800' },
    dismissX: { color: theme.textMuted, fontSize: 24, fontWeight: '400', paddingHorizontal: 6 },
    body: { color: theme.textMuted, fontSize: theme.type.body.size },
    error: { color: theme.error, fontSize: theme.type.label.size },
  })
