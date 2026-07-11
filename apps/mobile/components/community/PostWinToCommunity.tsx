import { useEffect, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text } from 'react-native'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { apiUrl, WEB_BASE_URL } from '@/lib/config'
import { theme } from '@/constants/theme'

type Props = {
  /** Leaderboard entry to post to — usually the game type, e.g. "ayo". */
  gameType: string
  gameCode: string
  winnerName: string
  /** Changes each round so a fresh round posts again (use the session row id). */
  roundKey?: string | null
}

// Per-round, per-device de-dup so a remount within a session doesn't re-post
// (the server also de-dups).
const posted = new Set<string>()

/**
 * Shown to the WINNER on a game's end screen — the caller gates on "did I win".
 * Auto-posts the win to the community leaderboard (no button); a 404 means the
 * game isn't tracked, in which case it renders nothing. Mirrors the web
 * PostWinToCommunity.
 */
export function PostWinToCommunity({ gameType, gameCode, winnerName, roundKey }: Props) {
  const [status, setStatus] = useState<'idle' | 'posted' | 'error' | 'untracked'>('idle')
  const [retry, setRetry] = useState(0)
  const key = `${gameCode}_${roundKey ?? 'default'}`

  useEffect(() => {
    if (!winnerName.trim()) return
    if (posted.has(key)) {
      setStatus('posted')
      return
    }
    let alive = true
    void fetch(apiUrl('/api/community/post-win'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerName: winnerName.trim(),
        gameId: gameCode,
        roundKey: roundKey ?? null,
        leaderboardType: gameType,
      }),
    })
      .then((res) => {
        if (!alive) return
        if (res.ok || res.status === 409) {
          posted.add(key)
          setStatus('posted')
        } else if (res.status === 404) {
          setStatus('untracked')
        } else {
          setStatus('error')
        }
      })
      .catch(() => {
        if (alive) setStatus('error')
      })
    return () => {
      alive = false
    }
  }, [winnerName, gameCode, gameType, roundKey, key, retry])

  if (!winnerName.trim() || status === 'untracked') return null

  if (status === 'error') {
    return (
      <SurfaceCard style={styles.card}>
        <Text style={styles.muted}>Couldn’t add this win to the community leaderboard.</Text>
        <Pressable
          onPress={() => {
            setStatus('idle')
            setRetry((n) => n + 1)
          }}
        >
          <Text style={styles.link}>Retry</Text>
        </Pressable>
      </SurfaceCard>
    )
  }

  if (status === 'posted') {
    return (
      <SurfaceCard style={styles.card}>
        <Text style={styles.added}>✓ Added to the community leaderboard 🏆</Text>
        <Pressable onPress={() => void Linking.openURL(`${WEB_BASE_URL}/leaderboard`)}>
          <Text style={styles.link}>See where you rank ↗</Text>
        </Pressable>
      </SurfaceCard>
    )
  }

  return (
    <SurfaceCard style={styles.card}>
      <Text style={styles.muted}>Adding your win to the community leaderboard…</Text>
    </SurfaceCard>
  )
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 8 },
  added: { color: theme.success, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  muted: { color: theme.textMuted, fontSize: 14, textAlign: 'center' },
  link: { color: theme.primaryMuted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
})
