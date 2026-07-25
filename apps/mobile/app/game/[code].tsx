import { useEffect, useState } from 'react'
import { uniqueTopic } from '@/lib/realtime'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { GameRouter, resolveMobilePlayerView } from '@/components/games/GameRouter'
import { PlayerSessionShell } from '@/components/session/PlayerSessionShell'
import { MatureGameGate } from '@/components/MatureGameGate'
import { GamePushSetup } from '@/components/push/GamePushSetup'
import { WebFallbackScreen } from '@/components/WebFallbackScreen'
import { autoJoinGame } from '@/lib/api'
import { getPlayerSession, setPlayerSession } from '@/lib/secure-session'
import { getSupabase, GAME_SELECT } from '@/lib/supabase'
import type { Game, GameType } from '@fateround/shared'
import { normalizeGameCode } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { GameThemeProvider, useTheme, useThemedStyles } from '@/constants/theme-context'

export default function GameScreen() {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const { code, player } = useLocalSearchParams<{ code: string; player?: string }>()
  const router = useRouter()
  const gameCode = typeof code === 'string' ? normalizeGameCode(code) : ''
  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  // A player-resume link (`/game/CODE?player=TOKEN`) carries a seat token. Adopt
  // it before rendering so the player is restored into their existing seat
  // (instead of landing on the join screen) — e.g. opening the link on a new
  // device. `false` until we've either resumed or confirmed there's nothing to do.
  const [resumeChecked, setResumeChecked] = useState(false)

  useEffect(() => {
    const token = typeof player === 'string' ? player.trim() : ''
    if (!gameCode || !token) {
      setResumeChecked(true)
      return
    }
    let cancelled = false
    const resume = async () => {
      try {
        // Only adopt the link's seat when we don't already hold one on this
        // device — a local session always wins over a token from a link.
        const existing = await getPlayerSession(gameCode)
        if (!existing) {
          const data = await autoJoinGame(gameCode, token)
          if (!cancelled && data.playerId) {
            await setPlayerSession(
              gameCode,
              data.playerId,
              data.playerName,
              data.playerGender ?? 'both',
              data.resumeToken ?? token
            )
          }
        }
      } catch {
        // Invalid/expired token — fall through to the normal join screen.
      } finally {
        if (!cancelled) {
          // Drop the token from the URL so it isn't left in navigation history.
          router.setParams({ player: undefined })
          setResumeChecked(true)
        }
      }
    }
    void resume()
    return () => {
      cancelled = true
    }
    // `player` is cleared via setParams once consumed; re-running on that change
    // would just no-op, so key the resume on the game code only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameCode])

  useEffect(() => {
    if (!gameCode) {
      setLoading(false)
      return
    }

    let cancelled = false
    const load = async () => {
      setLoading(true)
      const res = await getSupabase().from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle()
      if (cancelled) return
      if (res.error || !res.data) {
        setNotFound(true)
        setGame(null)
      } else {
        const row = res.data as Game
        if (__DEV__ && !row.game_type) {
          console.warn('[GameScreen] loaded game without game_type', gameCode, row)
        }
        setGame(row)
        setNotFound(false)
      }
      setLoading(false)
    }

    void load()
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`game-meta-${gameCode}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        () => void load()
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [gameCode])

  if (!gameCode) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Missing game code</Text>
        <Pressable style={styles.homeButton} onPress={() => router.replace('/')}>
          <Text style={styles.homeButtonText}>Back to home</Text>
        </Pressable>
      </View>
    )
  }

  if (loading || !resumeChecked) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    )
  }

  if (notFound || !game) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Game {gameCode} not found</Text>
        <Text style={styles.errorHint}>Double-check the code, or head back and try again.</Text>
        <Pressable style={styles.homeButton} onPress={() => router.replace('/')}>
          <Text style={styles.homeButtonText}>Back to home</Text>
        </Pressable>
      </View>
    )
  }

  const gameType = game.game_type as GameType
  const NativeView = resolveMobilePlayerView(gameType)
  if (!NativeView) {
    return (
      <WebFallbackScreen
        gameCode={gameCode}
        gameType={gameType}
        debugReason={`no native view for ${JSON.stringify(gameType)}`}
      />
    )
  }

  return (
    <GameThemeProvider theme={game.theme}>
      <PlayerSessionShell gameCode={gameCode} game={game}>
        <GamePushSetup gameCode={gameCode} />
        <GameRouter gameCode={gameCode} gameType={gameType} />
      </PlayerSessionShell>
      <MatureGameGate gameType={gameType} />
    </GameThemeProvider>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    errorText: {
      color: theme.text,
      fontSize: 18,
      textAlign: 'center',
    },
    errorHint: {
      color: theme.textMuted,
      fontSize: 14,
      textAlign: 'center',
      marginTop: 8,
    },
    homeButton: {
      marginTop: 24,
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 28,
    },
    homeButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  })
