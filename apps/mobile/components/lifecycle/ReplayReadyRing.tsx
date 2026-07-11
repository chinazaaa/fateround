import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Player } from '@fateround/shared'
import { postPlayerReady } from '@/lib/game-api'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  players: Player[]
  myPlayerId: string | null
  myResumeToken: string | null
  minPlayers?: number
  onReload: () => void | Promise<unknown>
  /** Host-only: when set, each other player's row shows a Remove control. */
  onRemovePlayer?: (player: Player) => void
}

export function ReplayReadyRing({
  gameCode,
  players,
  myPlayerId,
  myResumeToken,
  minPlayers = 2,
  onReload,
  onRemovePlayer,
}: Props) {
  const styles = useThemedStyles(makeStyles)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = players.length
  const readyCount = players.filter((p) => p.spectator !== true).length
  const canStart = readyCount >= minPlayers
  const me = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const meReady = !!me && me.spectator !== true

  const toggleReady = useCallback(
    async (ready: boolean) => {
      if (!myResumeToken) {
        setError('Your player session expired — rejoin to continue')
        return
      }
      setPending(true)
      setError(null)
      try {
        await postPlayerReady(gameCode, myResumeToken, ready)
        await onReload()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update ready')
      } finally {
        setPending(false)
      }
    },
    [gameCode, myResumeToken, onReload]
  )

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>Play again · same settings</Text>
      <Text style={styles.title}>{canStart ? 'Ready when you are' : 'Waiting for players…'}</Text>
      <Text style={styles.subtitle}>
        Same players, same settings. Tap to get ready — the host starts the next game.
      </Text>

      <View style={styles.ring}>
        <Text style={styles.ringCount}>
          {readyCount}/{total}
        </Text>
        <Text style={styles.ringLabel}>Ready</Text>
      </View>

      <View style={styles.list}>
        {players.map((p) => {
          const on = p.spectator !== true
          const isMe = p.id === myPlayerId
          return (
            <View key={p.id} style={[styles.row, on && styles.rowReady, isMe && styles.rowMe]}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{p.name.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.name}>{isMe ? `${p.name} (you)` : p.name}</Text>
              <Text style={[styles.status, on && styles.statusReady]}>{on ? 'Ready' : 'Not ready'}</Text>
              {onRemovePlayer && !isMe ? (
                <Pressable onPress={() => onRemovePlayer(p)} hitSlop={8}>
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          )
        })}
      </View>

      {meReady ? (
        <Pressable style={[styles.secondaryButton, pending && styles.buttonDisabled]} onPress={() => void toggleReady(false)} disabled={pending}>
          <Text style={styles.secondaryButtonText}>You're ready — tap to cancel</Text>
        </Pressable>
      ) : (
        <Pressable style={[styles.primaryButton, pending && styles.buttonDisabled]} onPress={() => void toggleReady(true)} disabled={pending}>
          <Text style={styles.primaryButtonText}>Tap to get ready</Text>
        </Pressable>
      )}

      {!canStart ? (
        <Text style={styles.hint}>
          Need at least {minPlayers} players ready to start ({readyCount} so far)
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
    alignItems: 'center',
  },
  kicker: {
    color: theme.textFaint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
  },
  ring: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 10,
    borderColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    backgroundColor: theme.surface,
  },
  ringCount: {
    color: theme.text,
    fontSize: 32,
    fontWeight: '800',
  },
  ringLabel: {
    color: theme.textFaint,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  list: {
    width: '100%',
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
  },
  rowReady: {
    borderColor: theme.primary,
  },
  rowMe: {
    backgroundColor: theme.primarySoft,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: theme.text,
    fontWeight: '800',
  },
  name: {
    flex: 1,
    color: theme.text,
    fontSize: 15,
    fontWeight: '600',
  },
  status: {
    color: theme.textFaint,
    fontSize: 12,
    fontWeight: '600',
  },
  statusReady: {
    color: theme.primaryMuted,
  },
  remove: {
    color: theme.error,
    fontSize: 13,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
  },
  primaryButtonText: {
    // white on the solid rose button — intentional
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: theme.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  hint: {
    color: theme.textFaint,
    fontSize: 12,
    textAlign: 'center',
  },
  error: {
    color: '#fb7185',
    fontSize: 13,
    textAlign: 'center',
  },
})
