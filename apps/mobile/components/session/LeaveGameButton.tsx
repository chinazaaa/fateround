import { useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { leaveGame } from '@/lib/game-api'
import { getPlayerSession } from '@/lib/secure-session'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

type Props = {
  gameCode: string
  playerId: string
  onLeft: () => void
  label?: string
  inLobby?: boolean
  quiet?: boolean
}

export function LeaveGameButton({
  gameCode,
  playerId,
  onLeft,
  label = 'Leave game',
  inLobby = false,
  quiet = true,
}: Props) {
  const { error: toastError } = useToast()
  const [leaving, setLeaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const leave = async () => {
    if (leaving) return
    const session = await getPlayerSession(gameCode)
    if (!session?.resumeToken) {
      setConfirmOpen(false)
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setLeaving(true)
    try {
      await leaveGame(gameCode, playerId, session.resumeToken)
      setConfirmOpen(false)
      onLeft()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to leave')
    } finally {
      setLeaving(false)
    }
  }

  return (
    <>
      <Pressable
        style={[quiet ? styles.quiet : styles.loud, leaving && styles.disabled]}
        onPress={() => setConfirmOpen(true)}
        disabled={leaving}
      >
        <Text style={[quiet ? styles.quietText : styles.loudText]}>{leaving ? 'Leaving…' : label}</Text>
      </Pressable>
      <ConfirmDialog
        visible={confirmOpen}
        title={inLobby ? 'Leave this lobby?' : 'Leave this game?'}
        message={
          inLobby
            ? 'You can rejoin with your player code if there is room.'
            : 'You can continue later with your player code if the host opens the lobby again.'
        }
        confirmLabel="Leave"
        destructive
        confirming={leaving}
        onConfirm={() => void leave()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  quiet: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f8717155',
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  quietText: { color: '#f87171', fontSize: 14, fontWeight: '600' },
  loud: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  loudText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.6 },
})
