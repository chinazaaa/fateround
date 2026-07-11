import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { uniqueTopic } from '@/lib/realtime'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { batch9GameLabel } from '@fateround/shared/batch-9-games'
import { GameLoading, GameShell } from '@/components/game/GameChrome'
import { gameTypeMeta } from '@/lib/game-type-meta'
import { autoJoinGame } from '@/lib/api'
import { postAnonymousMessage } from '@/lib/game-api'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/secure-session'
import { getSupabase, GAME_SELECT } from '@/lib/supabase'
import type { Game } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

const GAME_EMOJI = gameTypeMeta('secret_message').emoji
const GAME_LABEL = batch9GameLabel('secret_message')

/** Small game-type pill mirroring the web GameTypeBadge. */
function GameBadge({ styles }: { styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeEmoji}>{GAME_EMOJI}</Text>
      <Text style={styles.badgeLabel}>{GAME_LABEL}</Text>
    </View>
  )
}

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
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const router = useRouter()

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
  if (screen === 'not_found') {
    return (
      <View style={styles.stateWrap}>
        <Text style={styles.stateEmoji}>🔍</Text>
        <Text style={styles.stateTitle}>Link not found</Text>
        <Text style={styles.stateBody}>Double-check the link you were sent.</Text>
        <Pressable style={styles.secondaryBtn} onPress={() => router.replace('/')}>
          <Text style={styles.secondaryBtnText}>Go Home</Text>
        </Pressable>
      </View>
    )
  }
  if (screen === 'closed') {
    return (
      <View style={styles.stateWrap}>
        <Text style={styles.stateEmoji}>💌</Text>
        <Text style={styles.stateTitle}>{game?.title || GAME_LABEL}</Text>
        <GameBadge styles={styles} />
        <Text style={styles.stateBody}>This board is closed and not accepting new messages.</Text>
        <Pressable style={styles.secondaryBtn} onPress={() => router.replace('/')}>
          <Text style={styles.secondaryBtnText}>Go Home</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <GameShell title={game?.title || GAME_LABEL} subtitle="Send anonymously">
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>{GAME_EMOJI}</Text>
          {game?.title ? <Text style={styles.headerTitle}>{game.title}</Text> : null}
          <GameBadge styles={styles} />
        </View>
        <Text style={styles.hint}>
          Send a message anonymously. Only the link owner will see it — senders never see each other&apos;s
          messages.
        </Text>
        {joining ? (
          <ActivityIndicator color={theme.primary} style={styles.loader} />
        ) : null}
        <TextInput
          style={styles.input}
          value={messageInput}
          onChangeText={setMessageInput}
          placeholder="Write your secret message…"
          placeholderTextColor={theme.textFaint}
          multiline
          maxLength={MAX_CHARS}
          editable={!sending && !joining}
          blurOnSubmit
          returnKeyType="send"
          onSubmitEditing={() => void sendMessage()}
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
            // white spinner on the solid rose button — intentional
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Send message</Text>
          )}
        </Pressable>
        <Text style={styles.footnote}>
          Your identity is never shown to the link owner. You can send multiple messages.
        </Text>
      </View>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  content: { gap: 12, paddingBottom: 24 },
  header: { alignItems: 'center', gap: 8, paddingBottom: 4 },
  headerEmoji: { fontSize: 40 },
  headerTitle: { color: theme.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  badgeEmoji: { fontSize: 13 },
  badgeLabel: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
  hint: { color: theme.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  footnote: { color: theme.textFaint, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 4 },
  loader: { marginVertical: 8 },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  stateEmoji: { fontSize: 52 },
  stateTitle: { color: theme.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  stateBody: { color: theme.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  secondaryBtn: {
    marginTop: 8,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  secondaryBtnText: { color: theme.text, fontSize: 15, fontWeight: '700' },
  input: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    color: theme.text,
    fontSize: 16,
    minHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  counter: { color: theme.textFaint, fontSize: 12, textAlign: 'right' },
  error: { color: theme.error, fontSize: 14 },
  sent: { color: '#86efac', fontSize: 14 },
  button: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  // white on the solid rose button — intentional
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
