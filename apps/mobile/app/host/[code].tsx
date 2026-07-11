import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { normalizeGameCode } from '@fateround/shared'
import { HostGameScreen } from '@/components/host/HostGameScreen'
import { getHostToken, setHostToken } from '@/lib/secure-session'
import { verifyHost } from '@/lib/game-api'

type Phase = 'checking' | 'ready' | 'denied' | 'notFound'

/**
 * Host entry point. Reached either from an in-app route or a deep link
 * (`fateround://host/CODE?hostToken=…`) opened from the web create flow. When a
 * hostToken arrives in the query it's persisted to SecureStore, then verified
 * against the server before the lobby renders. Host-only v1 (see HostLobbyScreen).
 */
export default function HostScreen() {
  const params = useLocalSearchParams<{ code: string; hostToken?: string }>()
  const router = useRouter()
  const gameCode = typeof params.code === 'string' ? normalizeGameCode(params.code) : ''
  const [phase, setPhase] = useState<Phase>('checking')
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    if (!gameCode) {
      setPhase('notFound')
      return
    }
    let cancelled = false
    const run = async () => {
      // A deep link may carry the token as a query param — capture it first.
      const linked = typeof params.hostToken === 'string' ? params.hostToken.trim() : ''
      if (linked) {
        await setHostToken(gameCode, linked)
        // Drop the token from the URL so it isn't left in navigation history.
        router.setParams({ hostToken: undefined })
      }
      const stored = await getHostToken(gameCode)
      if (cancelled) return
      if (!stored) {
        setPhase('denied')
        return
      }
      const result = await verifyHost(gameCode, stored).catch(() => ({ ok: false, notFound: false }))
      if (cancelled) return
      if (result.notFound) setPhase('notFound')
      else if (result.ok) {
        setToken(stored)
        setPhase('ready')
      } else setPhase('denied')
    }
    void run()
    return () => {
      cancelled = true
    }
    // params.hostToken intentionally excluded — we clear it via setParams and
    // don't want the capture to re-run when it changes to undefined.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameCode])

  if (phase === 'checking') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#f43f5e" size="large" />
      </View>
    )
  }

  if (phase === 'notFound') {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Game {gameCode || ''} not found</Text>
      </View>
    )
  }

  if (phase === 'denied' || !token) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>You&apos;re not the host of this game.</Text>
        <Text style={styles.subText}>Open the host link from the device that created it.</Text>
      </View>
    )
  }

  return <HostGameScreen gameCode={gameCode} hostToken={token} />
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  errorText: { color: '#fff', fontSize: 18, textAlign: 'center' },
  subText: { color: '#9ca3af', fontSize: 14, textAlign: 'center' },
})
