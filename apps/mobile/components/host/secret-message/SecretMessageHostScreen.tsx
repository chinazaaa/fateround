import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { AnonymousMessage, Game, Player } from '@fateround/shared'
import { postFinishGame, postPlayAgain } from '@/lib/game-api'
import { apiUrl } from '@/lib/config'
import { HostChrome } from '@/components/host/HostChrome'
import { GameFinishedActions } from '@/components/lifecycle/GameFinishedActions'
import { useSecretMessageInbox } from '@/components/host/secret-message/useSecretMessageInbox'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  players: Player[]
  onReload: () => void
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function SecretMessageHostScreen({ gameCode, hostToken, game, players, onReload }: Props) {
  const styles = useThemedStyles(makeStyles)
  const isOpen = game.status === 'active'
  const { messages, loading, removeMessage } = useSecretMessageInbox(gameCode, isOpen)
  const [acting, setActing] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<ScrollView | null>(null)

  // Auto-scroll the inbox to the newest message as it arrives.
  useEffect(() => {
    if (messages.length === 0) return
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)
    return () => clearTimeout(t)
  }, [messages.length])

  const closeBoard = async () => {
    setActing(true)
    setError(null)
    try {
      await postFinishGame(gameCode, hostToken)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close board')
    } finally {
      setActing(false)
    }
  }

  const reopenBoard = async () => {
    setActing(true)
    setError(null)
    try {
      await postPlayAgain(gameCode, hostToken, true)
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen board')
    } finally {
      setActing(false)
    }
  }

  const deleteMessage = async (message: AnonymousMessage) => {
    setRemovingId(message.id)
    try {
      const res = await fetch(apiUrl('/api/anonymous-messages'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode.toUpperCase(), messageId: message.id, hostToken }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to remove message')
      removeMessage(message.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove message')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <HostChrome gameCode={gameCode} hostToken={hostToken} game={game} players={players} onReload={onReload}>
      <Text style={styles.hint}>Only you can read these. Senders stay anonymous.</Text>

      {isOpen ? (
        <View style={styles.statusCard}>
          <View style={styles.statusText}>
            <Text style={styles.statusTitle}>Board is open</Text>
            <Text style={styles.statusMeta}>Anyone with your link can post right now</Text>
          </View>
          <Pressable
            style={[styles.dangerBtn, acting && styles.btnDisabled]}
            disabled={acting}
            onPress={() => void closeBoard()}
          >
            {acting ? (
              <ActivityIndicator color={styles.dangerBtnText.color} />
            ) : (
              <Text style={styles.dangerBtnText}>Close board</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={[styles.statusCard, styles.statusCardClosed]}>
          <View style={styles.statusText}>
            <Text style={styles.statusTitle}>Board is closed</Text>
            <Text style={styles.statusMeta}>Reopen to accept new messages</Text>
          </View>
          <Pressable
            style={[styles.primaryBtn, acting && styles.btnDisabled]}
            disabled={acting}
            onPress={() => void reopenBoard()}
          >
            {acting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Reopen board</Text>
            )}
          </Pressable>
        </View>
      )}

      {isOpen ? (
        <View style={styles.inbox}>
          <View style={styles.inboxHeader}>
            <Text style={styles.inboxTitle}>Your inbox</Text>
            <Text style={styles.inboxCount}>
              {messages.length} message{messages.length === 1 ? '' : 's'}
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator color={styles.inboxTitle.color} style={styles.loader} />
          ) : messages.length === 0 ? (
            <Text style={styles.empty}>No messages yet — share your link to start receiving.</Text>
          ) : (
            <ScrollView
              ref={scrollRef}
              style={styles.messageScroll}
              contentContainerStyle={styles.messageList}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {messages.map((message) => (
                <View key={message.id} style={styles.messageCard}>
                  <View style={styles.messageBody}>
                    {message.message_type === 'gif' && message.media_url ? (
                      <Text style={styles.messageText}>[GIF] {message.media_url}</Text>
                    ) : (
                      <Text style={styles.messageText}>{message.text}</Text>
                    )}
                    <Text style={styles.messageTime}>{formatTime(message.created_at)}</Text>
                  </View>
                  <Pressable
                    style={styles.removeBtn}
                    disabled={removingId === message.id}
                    onPress={() => void deleteMessage(message)}
                    hitSlop={8}
                  >
                    {removingId === message.id ? (
                      <ActivityIndicator color={styles.removeBtnText.color} />
                    ) : (
                      <Text style={styles.removeBtnText}>Remove</Text>
                    )}
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}

      {game.status === 'finished' ? (
        <GameFinishedActions gameCode={gameCode} gameType={game.game_type} gameTitle={game.title} />
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </HostChrome>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    hint: { color: theme.textMuted, fontSize: 14, lineHeight: 20 },
    statusCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
    },
    statusCardClosed: { borderColor: theme.borderAccent },
    statusText: { flex: 1, gap: 2 },
    statusTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
    statusMeta: { color: theme.textFaint, fontSize: 12 },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
    },
    // White on the solid rose button — intentional, correct in both schemes.
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    dangerBtn: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.error,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
    },
    dangerBtnText: { color: theme.error, fontWeight: '700', fontSize: 15 },
    btnDisabled: { opacity: 0.5 },
    inbox: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 12,
    },
    inboxHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    inboxTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
    inboxCount: { color: theme.textFaint, fontSize: 13, fontWeight: '600' },
    loader: { marginVertical: 12 },
    empty: { color: theme.textMuted, fontSize: 14, lineHeight: 20, paddingVertical: 8 },
    messageScroll: { maxHeight: 420 },
    messageList: { gap: 10 },
    messageCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: theme.bg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
    },
    messageBody: { flex: 1, gap: 4 },
    messageText: { color: theme.text, fontSize: 15, lineHeight: 21 },
    messageTime: { color: theme.textFaint, fontSize: 11 },
    removeBtn: { paddingVertical: 2, paddingHorizontal: 4 },
    removeBtnText: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    error: { color: theme.error, fontSize: 14 },
  })
