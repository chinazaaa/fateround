import { useEffect, useState } from 'react'
import { uniqueTopic } from '@/lib/realtime'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { GameRouter, resolveMobilePlayerView } from '@/components/games/GameRouter'
import { PlayerSessionShell } from '@/components/session/PlayerSessionShell'
import { GamePushSetup } from '@/components/push/GamePushSetup'
import { WebFallbackScreen } from '@/components/WebFallbackScreen'
import { getSupabase, GAME_SELECT } from '@/lib/supabase'
import type { Game, GameType } from '@fateround/shared'
import { normalizeGameCode } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

export default function GameScreen() {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const { code } = useLocalSearchParams<{ code: string }>()
  const gameCode = typeof code === 'string' ? normalizeGameCode(code) : ''
  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

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
      </View>
    )
  }

  if (loading) {
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
    <PlayerSessionShell gameCode={gameCode} game={game}>
      <GamePushSetup gameCode={gameCode} />
      <GameRouter gameCode={gameCode} gameType={gameType} />
    </PlayerSessionShell>
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
  })
