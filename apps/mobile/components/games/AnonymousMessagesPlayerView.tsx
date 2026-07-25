import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
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
  ANONYMOUS_ROOM_SESSION_SECONDS,
  anonymousPlayerCanPost,
  isPlayerBanned,
} from '@fateround/shared/anonymous-messages'
import { allowLateJoin } from '@fateround/shared/viewers'
import { GameLoading, GameNotFound, GameShell, WaitingPanel } from '@/components/game/GameChrome'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GifPickerSheet } from '@/components/games/anonymous/GifPickerSheet'
import { EmojiPickerSheet } from '@/components/games/anonymous/EmojiPickerSheet'
import { AnonymousSessionTimerBar } from '@/components/games/anonymous/AnonymousSessionTimerBar'
import { AnonymousRoomSessionSummary } from '@/components/games/anonymous/AnonymousRoomSessionSummary'
import { AnonymousLobbyDetail } from '@/components/games/anonymous/AnonymousLobbyDetail'
import { AnonymousRoomHeadcount } from '@/components/games/anonymous/AnonymousRoomHeadcount'
import { GameInfoChips } from '@/components/GameInfoChips'
import { AnonymousBanCountdownBar } from '@/components/games/anonymous/AnonymousBanCountdownBar'
import { anonymousRoomMaxPlayers } from '@/components/games/anonymous/anonymous-room-helpers'
import { ShareGameSheet } from '@/components/session/ShareGameSheet'
import { useStickyTimer } from '@/components/session/StickyTimerContext'
import { autoJoinGame } from '@/lib/api'
import { leaveGame, postAnonymousGif, postAnonymousMessage, postExpireSession, postPlayerReady } from '@/lib/game-api'
import { useTurnExpiryTimer } from '@/hooks/useTurnExpiryTimer'
import { useAnonymousReactions } from '@/hooks/useAnonymousReactions'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/secure-session'
import { getSupabase, GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase'
import { ANONYMOUS_MESSAGE_SELECT, ANONYMOUS_ROOM_BAN_SELECT } from '@/lib/supabase-selects'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

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
  const [readyingUp, setReadyingUp] = useState(false)
  const [ready, setReady] = useState(false)
  const flatListRef = useRef<FlatList<AnonymousMessage>>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const prevMessageCount = useRef(0)

  const { reactions, broadcastReaction } = useAnonymousReactions(code, screen === 'active')

  const syncScreen = useCallback((gameData: Game, playerId: string | null) => {
    if (gameData.status === 'waiting') {
      setScreen(playerId ? 'waiting' : 'join')
      return
    }
    if (gameData.status === 'active') {
      if (!playerId) {
        setScreen(allowLateJoin(gameData) ? 'join' : 'game_started_waiting')
        return
      }
      setScreen('active')
      return
    }
    setScreen(playerId ? 'finished' : 'game_ended')
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
    !!game && !!myPlayer && anonymousPlayerCanPost(myPlayer, game, banUntil) && canChat && screen === 'active'

  const join = async () => {
    setJoining(true)
    setJoinError(null)
    try {
      const existing = await getPlayerSession(code)
      const data = await autoJoinGame(code, existing?.resumeToken)
      await setPlayerSession(
        code,
        data.playerId,
        data.playerName,
        data.playerGender ?? 'both',
        data.resumeToken ?? null
      )
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

  const readyUp = async () => {
    if (readyingUp || ready) return
    const session = await getPlayerSession(code)
    if (!session?.resumeToken) {
      setJoinError('Your session expired — rejoin to continue')
      return
    }
    setReadyingUp(true)
    try {
      await postPlayerReady(code, session.resumeToken, true)
      setReady(true)
      await load()
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to ready up')
    } finally {
      setReadyingUp(false)
    }
  }

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true })
    setUnreadCount(0)
    setShowScrollBtn(false)
  }, [])

  const handleFeedScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
    const distFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height
    const scrolledUp = distFromBottom > 120
    setShowScrollBtn(scrolledUp)
    if (!scrolledUp) setUnreadCount(0)
  }, [])

  // Track unread messages while scrolled up; auto-stick to bottom otherwise.
  useEffect(() => {
    const delta = messages.length - prevMessageCount.current
    prevMessageCount.current = messages.length
    if (delta <= 0) return
    if (showScrollBtn) {
      setUnreadCount((c) => c + delta)
    } else {
      requestAnimationFrame(() => flatListRef.current?.scrollToEnd({ animated: messages.length > 1 }))
    }
  }, [messages.length, showScrollBtn])

  const playerCount = useMemo(() => players.filter((p) => !p.spectator).length, [players])

  // End the room when its 15-minute session window elapses — any active client
  // pokes the idempotent expire-session route. The timer bar was display-only, so
  // an all-mobile room never actually finished. Matches web.
  const anonSessionDeadlineAt = game?.session_started_at
    ? new Date(new Date(game.session_started_at).getTime() + ANONYMOUS_ROOM_SESSION_SECONDS * 1000).toISOString()
    : null
  useTurnExpiryTimer({
    deadlineAt: anonSessionDeadlineAt,
    enabled: game?.status === 'active',
    onExpire: () => postExpireSession(code).then(() => load()),
  })

  // Pinned countdowns — session bar (+ ban bar when banned) stay visible under
  // the header while the message feed scrolls.
  const anonTimers = (
    <>
      <AnonymousSessionTimerBar game={game} tick={timerTick} />
      {isPlayerBanned(banUntil) && banUntil ? (
        <AnonymousBanCountdownBar bannedUntil={banUntil} tick={timerTick} />
      ) : null}
    </>
  )
  const anonTimersPinned = useStickyTimer(anonTimers, [game, timerTick, banUntil])

  if (screen === 'loading') return <GameLoading />
  if (screen === 'not_found') return <GameNotFound gameCode={code} />

  if (screen === 'game_started_waiting') {
    return (
      <GameStartedWaitingScreen
        gameCode={code}
        game={game}
        onLobbyOpen={() => {
          setScreen('join')
          void load()
        }}
      />
    )
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'join') {
    const sessionInProgress = game?.status === 'active'
    const roomCapacity = game ? anonymousRoomMaxPlayers(game) : null
    const lobbyFull = game?.status === 'waiting' && roomCapacity != null && players.length >= roomCapacity
    const joinLabel = joining
      ? 'Joining…'
      : lobbyFull
        ? 'Lobby full — check back when live'
        : sessionInProgress
          ? 'Join as viewer'
          : 'Join room'
    return (
      <GameShell title={game?.title || batch9GameLabel('anonymous_messages')} subtitle="Anonymous room">
        <ScrollView contentContainerStyle={styles.joinScroll}>
          {game ? <AnonymousRoomHeadcount game={game} players={players} /> : null}
          <GameInfoChips game={game} />
          <Text style={styles.joinHint}>
            {lobbyFull
              ? `This room is full (${roomCapacity} players max). Stick around — once the host starts you can join as a viewer and watch live (read-only).`
              : sessionInProgress
                ? 'This session is already in progress. You can join to watch live — late joiners cannot send messages.'
                : "Join the anonymous room — you'll get a random lobby name shown on your messages. No account needed."}
          </Text>
          {joinError ? <Text style={styles.error}>{joinError}</Text> : null}
          <Pressable
            style={[styles.joinBtn, (joining || lobbyFull) && styles.btnDisabled]}
            disabled={joining || lobbyFull}
            onPress={() => void join()}
          >
            {joining ? (
              // white on the solid rose join button — intentional
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.joinBtnText}>{joinLabel}</Text>
            )}
          </Pressable>
        </ScrollView>
      </GameShell>
    )
  }

  if (screen === 'waiting' && game) {
    return (
      <GameShell title={game.title || batch9GameLabel('anonymous_messages')} subtitle="Lobby">
        <ScrollView contentContainerStyle={styles.lobbyScroll}>
          <WaitingPanel message="Waiting for the host to start the session…" />
          <AnonymousRoomHeadcount game={game} players={players} />
          <GameInfoChips game={game} />
          <AnonymousLobbyDetail game={game} players={players} myName={myName} />
          {myPlayer?.spectator === true ? (
            <View style={styles.readyBox}>
              <Text style={styles.readyHint}>Tap below to join the next session</Text>
              <Pressable
                style={[styles.joinBtn, (readyingUp || ready) && styles.btnDisabled]}
                disabled={readyingUp || ready}
                onPress={() => void readyUp()}
              >
                <Text style={styles.joinBtnText}>
                  {ready ? "You're in — waiting for host" : readyingUp ? 'Getting ready…' : "I'm in — ready to play"}
                </Text>
              </Pressable>
            </View>
          ) : null}
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
    <GameShell title={game?.title || batch9GameLabel('anonymous_messages')} subtitle={`${playerCount} in room`}>
      {game ? <AnonymousRoomHeadcount game={game} players={players} /> : null}
      {anonTimersPinned ? null : anonTimers}
      {!canChat && !isPlayerBanned(banUntil) ? (
        <Text style={styles.viewOnly}>View only — you joined after the session started.</Text>
      ) : null}

      <View style={styles.feedWrap}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          style={styles.feed}
          contentContainerStyle={styles.feedContent}
          onScroll={handleFeedScroll}
          scrollEventThrottle={16}
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
                  {item.created_at ? (
                    <Text style={styles.messageTime}>
                      {new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                  ) : null}
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
        {showScrollBtn ? (
          <Pressable style={styles.scrollBtn} onPress={scrollToBottom}>
            <Text style={styles.scrollBtnIcon}>↓</Text>
            {unreadCount > 0 ? (
              <View style={styles.scrollBadge}>
                <Text style={styles.scrollBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>

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
              placeholder={replyTo ? 'Write your anonymous reply…' : 'Message…'}
              placeholderTextColor={theme.textFaint}
              editable={!sending}
              multiline
              maxLength={500}
              blurOnSubmit
              returnKeyType="send"
              onSubmitEditing={() => void sendMessage()}
            />
            <Pressable
              style={[styles.sendBtn, (!messageInput.trim() || sending) && styles.btnDisabled]}
              disabled={!messageInput.trim() || sending}
              onPress={() => void sendMessage()}
            >
              <Text style={styles.sendBtnText}>Send</Text>
            </Pressable>
          </View>
          {messageInput.length >= 400 ? <Text style={styles.charCount}>{messageInput.length}/500</Text> : null}
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
      <EmojiPickerSheet visible={emojiTarget !== null} onPick={handleEmojiPick} onClose={() => setEmojiTarget(null)} />
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
    joinScroll: { gap: 14, paddingVertical: 8 },
    feedWrap: { flex: 1, position: 'relative' },
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
    messageTime: { color: theme.textFaint, fontSize: 10, marginTop: 4 },
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
    scrollBtn: {
      position: 'absolute',
      bottom: 12,
      right: 12,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    // white on the solid rose scroll button — intentional
    scrollBtnIcon: { color: '#fff', fontSize: 20, fontWeight: '800', lineHeight: 22 },
    scrollBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: theme.error,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // white on the solid badge — intentional
    scrollBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    charCount: { color: theme.textFaint, fontSize: 11, textAlign: 'right' },
    readyBox: { gap: 8 },
    readyHint: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
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
    composer: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
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
      maxHeight: 120,
      textAlignVertical: 'top',
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
