import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { GameRouter, hasMobilePlayerView } from '@/components/games/GameRouter'
import { WebFallbackScreen } from '@/components/WebFallbackScreen'
import { fetchMobileConfig } from '@/lib/api'
import type { MobileConfig } from '@fateround/shared'
import { getSupabase, GAME_SELECT } from '@/lib/supabase'
import type { Game } from '@fateround/shared'
import { normalizeGameCode } from '@fateround/shared'

export default function GameScreen() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const gameCode = typeof code === 'string' ? normalizeGameCode(code) : ''
  const [mobileConfig, setMobileConfig] = useState<MobileConfig | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    void fetchMobileConfig()
      .then(setMobileConfig)
      .catch(() => setMobileConfig(null))
  }, [])

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
        setGame(res.data as Game)
        setNotFound(false)
      }
      setLoading(false)
    }

    void load()
    const supabase = getSupabase()
    const channel = supabase
      .channel(`game-meta-${gameCode}`)
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
        <ActivityIndicator color="#f43f5e" size="large" />
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

  const forceWebFallback = mobileConfig?.forceWebFallbackFor.includes(game.game_type) ?? false
  if (forceWebFallback || !hasMobilePlayerView(game.game_type)) {
    return <WebFallbackScreen gameCode={gameCode} gameType={game.game_type} />
  }

  return <GameRouter gameCode={gameCode} gameType={game.game_type} />
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
  },
})
