import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { normalizeGameCode } from '@fateround/shared'
import { HostGameScreen } from '@/components/host/HostGameScreen'
import { getHostToken, setHostToken } from '@/lib/secure-session'
import { verifyHost } from '@/lib/game-api'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Phase = 'checking' | 'ready' | 'denied' | 'notFound'

/**
 * Host entry point. Reached either from an in-app route or a deep link
 * (`fateround://host/CODE?hostToken=…`) opened from the web create flow. When a
 * hostToken arrives in the query it's persisted to SecureStore, then verified
 * against the server before the lobby renders. Host-only v1 (see HostLobbyScreen).
 */
export default function HostScreen() {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const params = useLocalSearchParams<{ code: string; hostToken?: string; token?: string }>()
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
      // A deep link may carry the host token as a query param — capture it first.
      // Custom-scheme links use `hostToken`; web/universal host links use `token`
      // (see hostGameUrl), so accept either.
      const linked =
        (typeof params.hostToken === 'string' ? params.hostToken.trim() : '') ||
        (typeof params.token === 'string' ? params.token.trim() : '')
      if (linked) {
        await setHostToken(gameCode, linked)
        // Drop the token from the URL so it isn't left in navigation history.
        router.setParams({ hostToken: undefined, token: undefined })
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
        <ActivityIndicator color={theme.primary} size="large" />
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

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 8,
    },
    errorText: { color: theme.text, fontSize: 18, textAlign: 'center' },
    subText: { color: theme.textMuted, fontSize: 14, textAlign: 'center' },
  })
