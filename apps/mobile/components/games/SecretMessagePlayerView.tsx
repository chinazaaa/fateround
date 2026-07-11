import { useCallback, useEffect, useState } from 'react'
import { uniqueTopic } from '@/lib/realtime'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { batch9GameLabel } from '@fateround/shared/batch-9-games'
import { GameLoading, GameNotFound, GameShell, WaitingPanel } from '@/components/game/GameChrome'
import { autoJoinGame } from '@/lib/api'
import { postAnonymousMessage } from '@/lib/game-api'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/secure-session'
import { getSupabase, GAME_SELECT } from '@/lib/supabase'
import type { Game } from '@fateround/shared'

type Screen = 'loading' | 'ready' | 'closed' | 'not_found'

const MAX_CHARS = 500

export function SecretMessagePlayerView({ gameCode }: { gameCode: string }) {
  const code = gameCode.toUpperCase()
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [messageInput, setMessageInput] = useState('')
  const [sending, setSending] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentCount, setSentCount] = useState(0)

  const ensureSender = useCallback(async () => {
    const session = await getPlayerSession(code)
    if (session?.playerId) {
      setMyPlayerId(session.playerId)
      return session.playerId
    }
    setJoining(true)
    try {
      const existing = await getPlayerSession(code)
      const data = await autoJoinGame(code, existing?.resumeToken)
      await setPlayerSession(code, data.playerId, data.playerName, data.playerGender ?? 'both', data.resumeToken ?? null)
      setMyPlayerId(data.playerId)
      return data.playerId
    } finally {
      setJoining(false)
    }
  }, [code])

  const load = useCallback(async () => {
    const { data: gameData, error: gameError } = await getSupabase()
      .from('games')
      .select(GAME_SELECT)
      .eq('id', code)
      .maybeSingle()
    if (gameError || !gameData) {
      setScreen('not_found')
      return
    }
    setGame(gameData as Game)
    if (gameData.status !== 'active') {
      setScreen('closed')
      return
    }
    setScreen('ready')
    const session = await getPlayerSession(code)
    if (session?.playerId) setMyPlayerId(session.playerId)
  }, [code])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (screen !== 'ready' || myPlayerId) return
    ensureSender().catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not connect')
    })
  }, [screen, myPlayerId, ensureSender])

  useEffect(() => {
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`secret-sender-${code}`))
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${code}` },
        (payload) => {
          const next = payload.new as Game
          setGame(next)
          if (next.status !== 'active') {
            setScreen('closed')
            void clearPlayerSession(code)
            setMyPlayerId(null)
          }
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [code])

  const sendMessage = async () => {
    const text = messageInput.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    try {
      let playerId = myPlayerId
      if (!playerId) playerId = await ensureSender()
      if (!playerId) throw new Error('Could not connect')
      await postAnonymousMessage(code, playerId, text)
      setMessageInput('')
      setSentCount((c) => c + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  if (screen === 'loading') return <GameLoading />
  if (screen === 'not_found') return <GameNotFound gameCode={code} />
  if (screen === 'closed') {
    return (
      <GameShell title={batch9GameLabel('secret_message')} subtitle="Board closed">
        <WaitingPanel message="This secret message board is closed. Thanks for playing!" />
      </GameShell>
    )
  }

  return (
    <GameShell title={game?.title || batch9GameLabel('secret_message')} subtitle="Send anonymously">
      <View style={styles.content}>
        <Text style={styles.hint}>
          Your message goes to the host only. No one else in the room can read it.
        </Text>
        {joining ? (
          <ActivityIndicator color="#f43f5e" style={styles.loader} />
        ) : null}
        <TextInput
          style={styles.input}
          value={messageInput}
          onChangeText={setMessageInput}
          placeholder="Write your secret message…"
          placeholderTextColor="#6b7280"
          multiline
          maxLength={MAX_CHARS}
          editable={!sending && !joining}
        />
        <Text style={styles.counter}>
          {messageInput.length}/{MAX_CHARS}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {sentCount > 0 ? <Text style={styles.sent}>Sent {sentCount} message{sentCount === 1 ? '' : 's'}</Text> : null}
        <Pressable
          style={[styles.button, (sending || joining || !messageInput.trim()) && styles.buttonDisabled]}
          disabled={sending || joining || !messageInput.trim()}
          onPress={() => void sendMessage()}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Send message</Text>
          )}
        </Pressable>
      </View>
    </GameShell>
  )
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 24 },
  hint: { color: '#9ca3af', fontSize: 15, lineHeight: 22 },
  loader: { marginVertical: 8 },
  input: {
    backgroundColor: '#17171d',
    borderColor: '#2a2a35',
    borderWidth: 1,
    borderRadius: 12,
    color: '#fff',
    fontSize: 16,
    minHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  counter: { color: '#6b7280', fontSize: 12, textAlign: 'right' },
  error: { color: '#fb7185', fontSize: 14 },
  sent: { color: '#86efac', fontSize: 14 },
  button: {
    backgroundColor: '#f43f5e',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
