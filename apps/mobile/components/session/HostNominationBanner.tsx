import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { postClaimHost, postDeclineHost } from '@/lib/game-api'
import { setHostToken } from '@/lib/secure-session'
import { useHostNomination } from '@/hooks/useHostNomination'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  playerId: string | null
  resumeToken: string | null
}

/**
 * Shows when the current host has nominated this player to take over. Accept mints
 * a fresh host token and opens the host dashboard; decline clears the invite. Batch 24.
 */
export function HostNominationBanner({ gameCode, playerId, resumeToken }: Props) {
  const router = useRouter()
  const styles = useThemedStyles(makeStyles)
  const { pendingHostPlayerId, refetch } = useHostNomination(gameCode)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const invited = !!playerId && !!resumeToken && pendingHostPlayerId === playerId
  if (!invited) return null

  const onAccept = async () => {
    if (!resumeToken || busy) return
    setBusy(true)
    setError(null)
    try {
      const { hostToken } = await postClaimHost(gameCode, resumeToken)
      await setHostToken(gameCode, hostToken)
      router.push(`/host/${gameCode}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept')
      refetch()
    } finally {
      setBusy(false)
    }
  }

  const onDecline = async () => {
    if (!resumeToken || busy) return
    setBusy(true)
    setError(null)
    try {
      await postDeclineHost(gameCode, resumeToken)
      refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not decline')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.banner}>
      <Text style={styles.title}>You’ve been invited to host</Text>
      <Text style={styles.body}>The current host wants to hand this game over to you.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.row}>
        <Pressable
          style={[styles.accept, busy && styles.disabled]}
          disabled={busy}
          onPress={() => void onAccept()}
        >
          <Text style={styles.acceptText}>{busy ? '…' : 'Become host'}</Text>
        </Pressable>
        <Pressable
          style={[styles.decline, busy && styles.disabled]}
          disabled={busy}
          onPress={() => void onDecline()}
        >
          <Text style={styles.declineText}>Decline</Text>
        </Pressable>
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  banner: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.borderAccent,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    margin: theme.space.md,
    gap: theme.space.sm,
  },
  title: { color: theme.text, fontSize: 16, fontWeight: '800' },
  body: { color: theme.textSecondary, fontSize: 14, lineHeight: 20 },
  error: { color: theme.error, fontSize: 13 },
  row: { flexDirection: 'row', gap: theme.space.sm },
  accept: {
    flex: 1,
    backgroundColor: theme.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  acceptText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  decline: {
    flex: 1,
    backgroundColor: theme.bgElevated,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  declineText: { color: theme.textSecondary, fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
})
