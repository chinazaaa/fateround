import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import type { AnonymousMessage, Game, Player } from '@fateround/shared'
import { postFinishGame, postPlayAgain } from '@/lib/game-api'
import { apiUrl } from '@/lib/config'
import { gameTypeMeta } from '@/lib/game-type-meta'
import { HostChrome } from '@/components/host/HostChrome'
import { GameFinishedActions } from '@/components/lifecycle/GameFinishedActions'
import { useSecretMessageInbox } from '@/components/host/secret-message/useSecretMessageInbox'
import { ShareMessageCard } from '@/components/host/secret-message/ShareMessageCard'
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
  const [sharingId, setSharingId] = useState<string | null>(null)
  const [shareTarget, setShareTarget] = useState<AnonymousMessage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<ScrollView | null>(null)
  const cardRef = useRef<View>(null)
  const sharingLock = useRef(false)
  const headerEmoji = gameTypeMeta('secret_message').emoji

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

  const shareMessage = async (message: AnonymousMessage) => {
    const text = message.text?.trim()
    if (!text || sharingLock.current) return
    sharingLock.current = true
    setShareTarget(message)
    setSharingId(message.id)
    setError(null)
    try {
      // Let the off-screen card re-render with this message before snapshotting.
      await new Promise((resolve) => setTimeout(resolve, 80))
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 })
      if (Platform.OS === 'ios') {
        await Share.share({ url: uri, message: text })
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share message' })
      } else {
        await Share.share({ message: text })
      }
    } catch (err) {
      // A user-cancelled share dialog throws on some platforms — don't surface it.
      const msg = err instanceof Error ? err.message : ''
      if (!/cancel|dismiss/i.test(msg)) {
        setError('Could not share image')
      }
    } finally {
      sharingLock.current = false
      setSharingId(null)
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
                  <View style={styles.messageActions}>
                    {message.text?.trim() ? (
                      <Pressable
                        style={styles.actionBtn}
                        disabled={sharingId === message.id}
                        onPress={() => void shareMessage(message)}
                        hitSlop={8}
                      >
                        {sharingId === message.id ? (
                          <ActivityIndicator color={styles.shareBtnText.color} />
                        ) : (
                          <Text style={styles.shareBtnText}>Share</Text>
                        )}
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={styles.actionBtn}
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

      {/* Off-screen story card snapshotted for image sharing. */}
      <View style={styles.offscreen} pointerEvents="none">
        <View ref={cardRef} collapsable={false}>
          <ShareMessageCard
            messageText={shareTarget?.text ?? ''}
            gameTitle={game.title || 'Secret Message'}
            headerEmoji={headerEmoji}
          />
        </View>
      </View>
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
    messageActions: { alignItems: 'flex-end', gap: 8 },
    actionBtn: { paddingVertical: 2, paddingHorizontal: 4 },
    shareBtnText: { color: theme.primaryMuted, fontSize: 13, fontWeight: '700' },
    removeBtnText: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    error: { color: theme.error, fontSize: 14 },
    offscreen: { position: 'absolute', left: -10000, top: 0 },
  })
