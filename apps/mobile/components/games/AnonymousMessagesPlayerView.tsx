import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { type AnonymousMessage, type Game, type Player } from '@fateround/shared'
import { batch9GameLabel } from '@fateround/shared/batch-9-games'
import {
  anonymousPlayerCanPost,
  anonymousSessionSecondsLeft,
  formatSessionCountdown,
  isPlayerBanned,
} from '@fateround/shared/anonymous-messages'
import { GameLoading, GameNotFound, GameShell, WaitingPanel } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { autoJoinGame } from '@/lib/api'
import { postAnonymousMessage } from '@/lib/game-api'
import { getPlayerSession, setPlayerSession } from '@/lib/secure-session'
import { getSupabase, GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase'
import { ANONYMOUS_MESSAGE_SELECT, ANONYMOUS_ROOM_BAN_SELECT } from '@/lib/supabase-selects'

type Screen = 'loading' | 'join' | 'waiting' | 'active' | 'finished' | 'not_found'

export function AnonymousMessagesPlayerView({ gameCode }: { gameCode: string }) {
  const code = gameCode.toUpperCase()
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
      .channel(`anon-mobile-${code}`)
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

  void timerTick
  const sessionSeconds = anonymousSessionSecondsLeft(game?.session_started_at)
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

  const sendMessage = async () => {
    const text = messageInput.trim()
    if (!text || !myPlayerId || sending || !canPost) return
    setSending(true)
    try {
      await postAnonymousMessage(code, myPlayerId, text)
      setMessageInput('')
      await loadMessages()
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
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
            {joining ? <ActivityIndicator color="#fff" /> : <Text style={styles.joinBtnText}>Join room</Text>}
          </Pressable>
        </View>
      </GameShell>
    )
  }

  if (screen === 'waiting' && game) {
    return (
      <GameShell title={game.title || batch9GameLabel('anonymous_messages')} subtitle="Lobby">
        <WaitingPanel message={`Waiting for host to start… ${playerCount} in room`} />
      </GameShell>
    )
  }

  if (screen === 'finished' && game) {
    return (
      <GameFinishPanel
        bootstrap={{ code, game, players, myPlayerId, load }}
        title="Session ended"
        detail="This anonymous room has closed."
        showPlayAgain={false}
      />
    )
  }

  return (
    <GameShell
      title={game?.title || batch9GameLabel('anonymous_messages')}
      subtitle={
        game?.session_started_at
          ? `Time left ${formatSessionCountdown(sessionSeconds)}`
          : `${playerCount} in room`
      }
    >
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
        renderItem={({ item }) => (
          <View style={[styles.message, item.player_id === myPlayerId && styles.messageMine]}>
            <Text style={styles.messageAuthor}>{item.player_name ?? 'Unknown'}</Text>
            <Text style={styles.messageText}>{item.text}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No messages yet — say hi!</Text>}
      />

      {canPost ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={messageInput}
            onChangeText={setMessageInput}
            placeholder="Message…"
            placeholderTextColor="#6b7280"
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
      ) : null}
    </GameShell>
  )
}

const styles = StyleSheet.create({
  joinBox: { gap: 16, paddingVertical: 24 },
  joinHint: { color: '#9ca3af', fontSize: 15, lineHeight: 22 },
  joinBtn: {
    backgroundColor: '#f43f5e',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  viewOnly: { color: '#fbbf24', fontSize: 13, marginBottom: 8 },
  feed: { flex: 1, maxHeight: 420 },
  feedContent: { gap: 8, paddingBottom: 12 },
  message: {
    backgroundColor: '#17171d',
    borderRadius: 12,
    padding: 10,
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  messageMine: { alignSelf: 'flex-end', backgroundColor: '#3f1d2b' },
  messageAuthor: { color: '#9ca3af', fontSize: 11, marginBottom: 4 },
  messageText: { color: '#fff', fontSize: 15 },
  empty: { color: '#6b7280', textAlign: 'center', paddingVertical: 24 },
  composer: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  input: {
    flex: 1,
    backgroundColor: '#17171d',
    borderColor: '#2a2a35',
    borderWidth: 1,
    borderRadius: 12,
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sendBtn: {
    backgroundColor: '#f43f5e',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendBtnText: { color: '#fff', fontWeight: '700' },
  error: { color: '#fb7185', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
})
