import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import type { Player } from '@fateround/shared'
import { getSupabase, PLAYER_SELECT } from '@/lib/supabase'
import { postTransferHost, verifyHost } from '@/lib/game-api'
import { clearHostToken, getPlayerSession } from '@/lib/secure-session'
import { useHostNomination } from '@/hooks/useHostNomination'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  hostToken: string
  visible: boolean
  onClose: () => void
}

/**
 * Host-side host-transfer: pick a player to nominate, wait for them to accept or
 * decline. If they accept, our host token stops working — we drop host and return
 * to the player view. Batch 24.
 */
export function TransferHostSheet({ gameCode, hostToken, visible, onClose }: Props) {
  const router = useRouter()
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const { pendingHostPlayerId } = useHostNomination(gameCode)
  const [players, setPlayers] = useState<Player[]>([])
  const [ownPlayerId, setOwnPlayerId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolution, setResolution] = useState<'declined' | null>(null)
  const nominatedRef = useRef<string | null>(null)

  const loadPlayers = useCallback(async () => {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('players')
      .select(PLAYER_SELECT)
      .eq('game_id', gameCode)
      .order('joined_at')
    setPlayers((data ?? []) as Player[])
  }, [gameCode])

  useEffect(() => {
    if (!visible) return
    void loadPlayers()
    void getPlayerSession(gameCode).then((s) => setOwnPlayerId(s?.playerId ?? null))
    setResolution(null)
    setError(null)
  }, [visible, loadPlayers, gameCode])

  // Resolve when a pending nomination clears: accepted (our token died) vs declined.
  useEffect(() => {
    if (pendingHostPlayerId) {
      nominatedRef.current = pendingHostPlayerId
      setResolution(null)
      return
    }
    const nominee = nominatedRef.current
    if (!nominee) return
    nominatedRef.current = null
    void (async () => {
      try {
        const res = await verifyHost(gameCode, hostToken)
        if (!res.ok) {
          await clearHostToken(gameCode)
          onClose()
          router.replace(`/game/${gameCode}`)
        } else {
          setResolution('declined')
        }
      } catch {
        setResolution('declined')
      }
    })()
  }, [pendingHostPlayerId, gameCode, hostToken, onClose, router])

  const nominate = async (playerId: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await postTransferHost(gameCode, hostToken, playerId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not nominate')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await postTransferHost(gameCode, hostToken, null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel')
    } finally {
      setBusy(false)
    }
  }

  const candidates = players.filter((p) => !p.spectator && p.id !== ownPlayerId)
  const pendingPlayer = players.find((p) => p.id === pendingHostPlayerId)

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Transfer host</Text>

          {pendingHostPlayerId ? (
            <View style={styles.waiting}>
              <ActivityIndicator color={theme.primary} />
              <Text style={styles.waitingText}>
                Waiting for {pendingPlayer?.name ?? 'the player'} to accept…
              </Text>
              <Pressable style={styles.secondary} onPress={() => void cancel()} disabled={busy}>
                <Text style={styles.secondaryText}>Cancel invite</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {resolution === 'declined' ? (
                <Text style={styles.declined}>That player declined — you’re still the host.</Text>
              ) : (
                <Text style={styles.body}>Hand the game over to another player. They accept, then take over.</Text>
              )}
              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {candidates.length === 0 ? (
                  <Text style={styles.empty}>No other players to transfer to yet.</Text>
                ) : (
                  candidates.map((p) => (
                    <Pressable
                      key={p.id}
                      style={[styles.row, busy && styles.disabled]}
                      disabled={busy}
                      onPress={() => void nominate(p.id)}
                    >
                      <Text style={styles.rowName}>{p.name}</Text>
                      <Text style={styles.rowAction}>Nominate →</Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.bgElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: theme.space.lg,
    gap: theme.space.md,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
    alignSelf: 'center',
  },
  title: { color: theme.text, fontSize: 20, fontWeight: '800' },
  body: { color: theme.textMuted, fontSize: 14, lineHeight: 20 },
  declined: { color: theme.primaryMuted, fontSize: 14, fontWeight: '700' },
  list: { maxHeight: 320 },
  listContent: { gap: theme.space.sm },
  empty: { color: theme.textFaint, fontSize: 14, paddingVertical: theme.space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: 14,
  },
  rowName: { color: theme.text, fontSize: 16, fontWeight: '600' },
  rowAction: { color: theme.primaryMuted, fontSize: 14, fontWeight: '700' },
  waiting: { alignItems: 'center', gap: theme.space.md, paddingVertical: theme.space.md },
  waitingText: { color: theme.textSecondary, fontSize: 15, textAlign: 'center' },
  secondary: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    paddingHorizontal: theme.space.lg,
  },
  secondaryText: { color: theme.textSecondary, fontWeight: '700', fontSize: 15 },
  error: { color: theme.error, fontSize: 13 },
  close: { alignItems: 'center', paddingVertical: theme.space.sm },
  closeText: { color: theme.textMuted, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
})
