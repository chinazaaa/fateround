import { useCallback, useEffect, useMemo, useState } from 'react'
import { uniqueTopic } from '@/lib/realtime'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import { type AnonymousMessage, type Game, type Player } from '@fateround/shared'
import { batch9GameLabel } from '@fateround/shared/batch-9-games'
import {
  anonymousPlayerCanPost,
  isPlayerBanned,
} from '@fateround/shared/anonymous-messages'
import { GameLoading, GameNotFound, GameShell, WaitingPanel } from '@/components/game/GameChrome'
import { GifPickerSheet } from '@/components/games/anonymous/GifPickerSheet'
import { EmojiPickerSheet } from '@/components/games/anonymous/EmojiPickerSheet'
import { AnonymousSessionTimerBar } from '@/components/games/anonymous/AnonymousSessionTimerBar'
import { AnonymousRoomSessionSummary } from '@/components/games/anonymous/AnonymousRoomSessionSummary'
import { AnonymousLobbyDetail } from '@/components/games/anonymous/AnonymousLobbyDetail'
import { ShareGameSheet } from '@/components/session/ShareGameSheet'
import { autoJoinGame } from '@/lib/api'
import { leaveGame, postAnonymousGif, postAnonymousMessage } from '@/lib/game-api'
import { useAnonymousReactions } from '@/hooks/useAnonymousReactions'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/secure-session'
import { getSupabase, GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase'
import { ANONYMOUS_MESSAGE_SELECT, ANONYMOUS_ROOM_BAN_SELECT } from '@/lib/supabase-selects'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Screen = 'loading' | 'join' | 'waiting' | 'active' | 'finished' | 'not_found'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

export function AnonymousMessagesPlayerView({ gameCode }: { gameCode: string }) {
  const code = gameCode.toUpperCase()
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [messages, setMessages] = useState<AnonymousMessage[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [canChat, setCanChat] = useState(true)
  const [banUntil, setBanUntil] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [messageInput, setMessageInput] = useState('')
  const [sending, setSending] = useState(false)
  const [timerTick, setTimerTick] = useState(0)
  const [replyTo, setReplyTo] = useState<AnonymousMessage | null>(null)
  const [gifOpen, setGifOpen] = useState(false)
  const [reactingId, setReactingId] = useState<string | null>(null)
  // 'composer' inserts into the message text; a messageId opens a free-choice
  // reaction picker for that message.
  const [emojiTarget, setEmojiTarget] = useState<'composer' | { messageId: string } | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const { reactions, broadcastReaction } = useAnonymousReactions(code, screen === 'active')

  const syncScreen = useCallback((gameData: Game, playerId: string | null) => {
    if (gameData.status === 'waiting') {
      setScreen(playerId ? 'waiting' : 'join')
      return
    }
    if (gameData.status === 'active') {
      setScreen(playerId ? 'active' : 'join')
      return
    }
    setScreen(playerId ? 'finished' : 'finished')
  }, [])

  const loadMessages = useCallback(async () => {
    const res = await getSupabase()
      .from('anonymous_messages')
      .select(ANONYMOUS_MESSAGE_SELECT)
      .eq('game_id', code)
      .order('created_at', { ascending: true })
    if (res.error) return false
    const nameById = new Map(players.map((p) => [p.id, p.name]))
    setMessages(
      ((res.data as AnonymousMessage[]) ?? []).map((row) => ({
        ...row,
        player_name: nameById.get(row.player_id) ?? 'Unknown',
      }))
    )
    return true
  }, [code, players])

  const load = useCallback(async () => {
    const supabase = getSupabase()
    const [gameRes, playersRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', code).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', code).order('joined_at'),
    ])
    if (gameRes.error || playersRes.error) return false
    if (!gameRes.data) {
      setScreen('not_found')
      return true
    }
    const gameData = gameRes.data as Game
    const playerRows = (playersRes.data as Player[]) ?? []
    setGame(gameData)
    setPlayers(playerRows)
    const session = await getPlayerSession(code)
    const playerId = session?.playerId ?? null
    if (session) setMyPlayerId(session.playerId)
    else setMyPlayerId(null)
    syncScreen(gameData, playerId)
    if (playerId) {
      const banRes = await supabase
        .from('anonymous_room_bans')
        .select(ANONYMOUS_ROOM_BAN_SELECT)
        .eq('game_id', code)
        .eq('player_id', playerId)
        .maybeSingle()
      setBanUntil((banRes.data as { banned_until?: string } | null)?.banned_until ?? null)
    }
    await loadMessages()
    return true
  }, [code, loadMessages, syncScreen])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const id = setInterval(() => setTimerTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (screen !== 'active') return
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`anon-mobile-${code}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'anonymous_messages', filter: `game_id=eq.${code}` },
        () => {
          void loadMessages()
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${code}` },
        (payload) => {
          const next = payload.new as Game
          setGame(next)
          syncScreen(next, myPlayerId)
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [code, loadMessages, myPlayerId, screen, syncScreen])

  const myPlayer = players.find((p) => p.id === myPlayerId)
  const canPost =
    !!game &&
    !!myPlayer &&
    anonymousPlayerCanPost(myPlayer, game, banUntil) &&
    canChat &&
    screen === 'active'

  const join = async () => {
    setJoining(true)
    setJoinError(null)
    try {
      const existing = await getPlayerSession(code)
      const data = await autoJoinGame(code, existing?.resumeToken)
      await setPlayerSession(code, data.playerId, data.playerName, data.playerGender ?? 'both', data.resumeToken ?? null)
      setMyPlayerId(data.playerId)
      setCanChat(data.canChat !== false)
      await load()
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setJoining(false)
    }
  }

  const myName = myPlayer?.name ?? ''

  const sendMessage = async () => {
    const text = messageInput.trim()
    if (!text || !myPlayerId || sending || !canPost) return
    setSending(true)
    try {
      await postAnonymousMessage(code, myPlayerId, text, replyTo?.id ?? null)
      setMessageInput('')
      setReplyTo(null)
      await loadMessages()
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const sendGif = async (mediaUrl: string) => {
    if (!myPlayerId || !canPost) return
    setGifOpen(false)
    try {
      await postAnonymousGif(code, myPlayerId, mediaUrl, replyTo?.id ?? null)
      setReplyTo(null)
      await loadMessages()
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to send GIF')
    }
  }

  const toggleReaction = (messageId: string, emoji: string) => {
    if (!myName) return
    const mine = reactions.get(messageId)?.get(emoji)?.has(myName)
    broadcastReaction(messageId, emoji, myName, mine ? 'remove' : 'add')
    setReactingId(null)
  }

  const handleEmojiPick = (emoji: string) => {
    if (emojiTarget === 'composer') {
      setMessageInput((prev) => prev + emoji)
    } else if (emojiTarget && typeof emojiTarget === 'object') {
      toggleReaction(emojiTarget.messageId, emoji)
    }
    setEmojiTarget(null)
  }

  const confirmLeave = () => {
    Alert.alert('Leave this room?', 'You can rejoin later if there is room.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => void doLeave() },
    ])
  }

  const doLeave = async () => {
    if (leaving) return
    const session = await getPlayerSession(code)
    if (!session?.resumeToken || !myPlayerId) {
      setJoinError('Your session expired — rejoin to continue')
      return
    }
    setLeaving(true)
    try {
      await leaveGame(code, myPlayerId, session.resumeToken)
      await clearPlayerSession(code)
      setMyPlayerId(null)
      setScreen('join')
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to leave')
    } finally {
      setLeaving(false)
    }
  }

  const playerCount = useMemo(() => players.filter((p) => !p.spectator).length, [players])

  if (screen === 'loading') return <GameLoading />
  if (screen === 'not_found') return <GameNotFound gameCode={code} />

  if (screen === 'join') {
    return (
      <GameShell title={batch9GameLabel('anonymous_messages')} subtitle="Anonymous room">
        <View style={styles.joinBox}>
          <Text style={styles.joinHint}>Join with a random nickname — no account needed.</Text>
          {joinError ? <Text style={styles.error}>{joinError}</Text> : null}
          <Pressable style={[styles.joinBtn, joining && styles.btnDisabled]} disabled={joining} onPress={() => void join()}>
            {joining ? (
              // white on the solid rose join button — intentional
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.joinBtnText}>Join room</Text>
            )}
          </Pressable>
        </View>
      </GameShell>
    )
  }

  if (screen === 'waiting' && game) {
    return (
      <GameShell title={game.title || batch9GameLabel('anonymous_messages')} subtitle="Lobby">
        <ScrollView contentContainerStyle={styles.lobbyScroll}>
          <WaitingPanel message="Waiting for the host to start the session…" />
          <AnonymousLobbyDetail game={game} players={players} myName={myName} />
          <Pressable style={styles.shareBtn} onPress={() => setShareOpen(true)}>
            <Text style={styles.shareBtnText}>Invite others</Text>
          </Pressable>
          {myPlayerId ? (
            <Pressable
              style={[styles.leaveBtn, leaving && styles.btnDisabled]}
              disabled={leaving}
              onPress={confirmLeave}
            >
              <Text style={styles.leaveBtnText}>{leaving ? 'Leaving…' : 'Leave room'}</Text>
            </Pressable>
          ) : null}
          {joinError ? <Text style={styles.error}>{joinError}</Text> : null}
        </ScrollView>
        <ShareGameSheet visible={shareOpen} gameCode={code} onClose={() => setShareOpen(false)} />
      </GameShell>
    )
  }

  if (screen === 'finished' && game) {
    return (
      <GameShell title={game.title || batch9GameLabel('anonymous_messages')} subtitle="Session ended">
        <ScrollView contentContainerStyle={styles.lobbyScroll}>
          <AnonymousRoomSessionSummary game={game} playerCount={players.length} />
        </ScrollView>
      </GameShell>
    )
  }

  return (
    <GameShell
      title={game?.title || batch9GameLabel('anonymous_messages')}
      subtitle={`${playerCount} in room`}
    >
      <AnonymousSessionTimerBar game={game} tick={timerTick} />
      {!canChat ? (
        <Text style={styles.viewOnly}>View only — you joined after the session started.</Text>
      ) : null}
      {isPlayerBanned(banUntil) ? (
        <Text style={styles.viewOnly}>You are temporarily muted.</Text>
      ) : null}

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        style={styles.feed}
        contentContainerStyle={styles.feedContent}
        renderItem={({ item }) => {
          const mine = item.player_id === myPlayerId
          const isGif = item.message_type === 'gif' && !!item.media_url
          const msgReactions = reactions.get(item.id)
          return (
            <View style={[styles.messageRow, mine && styles.messageRowMine]}>
              <Pressable
                style={[styles.message, mine && styles.messageMine]}
                onLongPress={() => setReactingId(reactingId === item.id ? null : item.id)}
                delayLongPress={220}
              >
                <Text style={styles.messageAuthor}>{item.player_name ?? 'Unknown'}</Text>
                {item.reply_to_text ? (
                  <View style={styles.replyQuote}>
                    <Text style={styles.replyQuoteText} numberOfLines={1}>
                      {item.reply_to_text}
                    </Text>
                  </View>
                ) : null}
                {isGif ? (
                  <Image source={{ uri: item.media_url! }} style={styles.gif} contentFit="cover" />
                ) : (
                  <Text style={styles.messageText}>{item.text}</Text>
                )}
              </Pressable>

              {msgReactions && msgReactions.size > 0 ? (
                <View style={[styles.reactionRow, mine && styles.reactionRowMine]}>
                  {[...msgReactions.entries()].map(([emoji, names]) => (
                    <Pressable
                      key={emoji}
                      style={[styles.reactionChip, names.has(myName) && styles.reactionChipMine]}
                      onPress={() => toggleReaction(item.id, emoji)}
                    >
                      <Text style={styles.reactionText}>
                        {emoji} {names.size}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {reactingId === item.id ? (
                <View style={[styles.emojiBar, mine && styles.reactionRowMine]}>
                  {QUICK_EMOJIS.map((e) => (
                    <Pressable key={e} onPress={() => toggleReaction(item.id, e)} hitSlop={4}>
                      <Text style={styles.emojiBarItem}>{e}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => {
                      setReactingId(null)
                      setEmojiTarget({ messageId: item.id })
                    }}
                    hitSlop={4}
                  >
                    <Text style={styles.emojiBarReply}>＋ React</Text>
                  </Pressable>
                  <Pressable onPress={() => setReplyTo(item)} hitSlop={4}>
                    <Text style={styles.emojiBarReply}>↩ Reply</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )
        }}
        ListEmptyComponent={<Text style={styles.empty}>No messages yet — say hi!</Text>}
      />

      {canPost ? (
        <View style={styles.composerWrap}>
          {replyTo ? (
            <View style={styles.replyBanner}>
              <Text style={styles.replyBannerText} numberOfLines={1}>
                Replying to {replyTo.player_name ?? 'message'}
                {replyTo.text ? `: ${replyTo.text}` : replyTo.message_type === 'gif' ? ': [GIF]' : ''}
              </Text>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                <Text style={styles.replyBannerClose}>✕</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.composer}>
            <Pressable style={styles.gifBtn} onPress={() => setEmojiTarget('composer')} disabled={sending}>
              <Text style={styles.emojiBtnText}>😀</Text>
            </Pressable>
            <Pressable style={styles.gifBtn} onPress={() => setGifOpen(true)} disabled={sending}>
              <Text style={styles.gifBtnText}>GIF</Text>
            </Pressable>
            <TextInput
              style={styles.input}
              value={messageInput}
              onChangeText={setMessageInput}
              placeholder="Message…"
              placeholderTextColor={theme.textFaint}
              editable={!sending}
            />
            <Pressable
              style={[styles.sendBtn, (!messageInput.trim() || sending) && styles.btnDisabled]}
              disabled={!messageInput.trim() || sending}
              onPress={() => void sendMessage()}
            >
              <Text style={styles.sendBtnText}>Send</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {myPlayerId ? (
        <Pressable
          style={[styles.leaveBtnQuiet, leaving && styles.btnDisabled]}
          disabled={leaving}
          onPress={confirmLeave}
        >
          <Text style={styles.leaveBtnText}>{leaving ? 'Leaving…' : 'Leave room'}</Text>
        </Pressable>
      ) : null}

      <GifPickerSheet visible={gifOpen} onPick={(url) => void sendGif(url)} onClose={() => setGifOpen(false)} />
      <EmojiPickerSheet
        visible={emojiTarget !== null}
        onPick={handleEmojiPick}
        onClose={() => setEmojiTarget(null)}
      />
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  joinBox: { gap: 16, paddingVertical: 24 },
  joinHint: { color: theme.textMuted, fontSize: 15, lineHeight: 22 },
  joinBtn: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  // white on the solid rose join button — intentional
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  viewOnly: { color: '#fbbf24', fontSize: 13, marginBottom: 8 },
  feed: { flex: 1, maxHeight: 420 },
  feedContent: { gap: 8, paddingBottom: 12 },
  messageRow: { alignItems: 'flex-start', maxWidth: '85%', alignSelf: 'flex-start', gap: 4 },
  messageRowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  message: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 10,
  },
  messageMine: { backgroundColor: theme.primarySoft },
  messageAuthor: { color: theme.textMuted, fontSize: 11, marginBottom: 4 },
  messageText: { color: theme.text, fontSize: 15 },
  gif: { width: 180, height: 140, borderRadius: 8, backgroundColor: theme.bg },
  replyQuote: {
    borderLeftWidth: 2,
    borderLeftColor: theme.primaryMuted,
    paddingLeft: 8,
    marginBottom: 6,
  },
  replyQuoteText: { color: theme.textMuted, fontSize: 12, fontStyle: 'italic' },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  reactionRowMine: { justifyContent: 'flex-end' },
  reactionChip: {
    flexDirection: 'row',
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  reactionChipMine: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
  reactionText: { color: theme.textSecondary, fontSize: 12, fontWeight: '700' },
  emojiBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.bgElevated,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  emojiBarItem: { fontSize: 20 },
  emojiBarReply: { color: theme.primaryMuted, fontSize: 13, fontWeight: '700' },
  empty: { color: theme.textFaint, textAlign: 'center', paddingVertical: 24 },
  composerWrap: { marginTop: 8, gap: 6 },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  replyBannerText: { color: theme.textMuted, fontSize: 13, flex: 1 },
  replyBannerClose: { color: theme.textMuted, fontSize: 14, fontWeight: '700' },
  gifBtn: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  gifBtnText: { color: theme.primaryMuted, fontSize: 13, fontWeight: '800' },
  emojiBtnText: { fontSize: 18 },
  lobbyScroll: { gap: 12, paddingVertical: 8 },
  shareBtn: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  shareBtnText: { color: theme.primaryMuted, fontSize: 15, fontWeight: '700' },
  leaveBtn: {
    borderWidth: 1,
    borderColor: theme.error,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  leaveBtnQuiet: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  leaveBtnText: { color: theme.error, fontSize: 15, fontWeight: '700' },
  composer: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sendBtn: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  // white on the solid rose send button — intentional
  sendBtnText: { color: '#fff', fontWeight: '700' },
  error: { color: theme.error, fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
})
