import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { normalizeGameCode, type Game, type Player } from '@fateround/shared'
import { playerIsViewer } from '@fateround/shared/viewers'
import {
  type MafiaChatMessage,
  type MafiaStateResponse,
  mafiaPhaseLabel,
  mafiaRoleEmoji,
  secondsUntilMafiaDeadline,
} from '@fateround/shared/mafia'
import { batch7GameLabel } from '@fateround/shared/batch-7-games'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { ViewerModeBanner } from '@/components/lifecycle/ViewerModeBanner'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { getPlayerSession } from '@/lib/secure-session'
import {
  postMafiaAdvance,
  postMafiaChat,
  postMafiaNightAction,
  postMafiaState,
  postMafiaVote,
} from '@/lib/game-api'
import { usePlayerSessionActions } from '@/lib/player-session'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Screen = 'loading' | 'join' | 'waiting' | 'active' | 'finished' | 'not_found'

const ROLE_DESC: Record<string, string> = {
  mafia: 'Eliminate villagers at night. Blend in during the day.',
  doctor: 'Protect one player each night from the Mafia.',
  detective: 'Investigate one player each night to learn their alignment.',
  villager: 'Debate during the day to find and vote out the Mafia.',
}

export function MafiaPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [mafiaState, setMafiaState] = useState<MafiaStateResponse | null>(null)
  const [acting, setActing] = useState(false)
  const [timerTick, setTimerTick] = useState(0)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: MafiaStateResponse | null; ok: boolean }> => {
      try {
        const session = await getPlayerSession(normalizeGameCode(gameCode))
        const data = await postMafiaState(gameCode.toUpperCase(), session?.resumeToken)
        setMafiaState(data)
        return { state: data, ok: true }
      } catch {
        return { state: null, ok: false }
      }
    },
    [gameCode]
  )

  const computeScreen = useCallback(
    (game: Game, playerId: string | null, stateData: MafiaStateResponse | null): Screen => {
      if (!playerId) return 'join'
      if (game.status === 'waiting') return 'waiting'
      if (game.status === 'active' && stateData != null && stateData.phase !== 'game_over') return 'active'
      if (game.status === 'finished' || stateData?.phase === 'game_over') return 'finished'
      return 'waiting'
    },
    []
  )

  const bootstrap = useGameViewBootstrap<Screen, MafiaStateResponse | null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen,
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'mafia_sessions', 'mafia_player_states'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const state = mafiaState ?? bootstrap.gameState
  const myState = state?.myState ?? null
  const amIAlive = state?.players.find((p) => p.id === bootstrap.myPlayerId)?.isAlive ?? false
  const amISpectator =
    !!bootstrap.myPlayerId && !!state && !state.players.some((p) => p.id === bootstrap.myPlayerId)
  const myPlayerRow = bootstrap.myPlayerId
    ? bootstrap.players.find((p) => p.id === bootstrap.myPlayerId)
    : undefined
  const isViewer = !!(bootstrap.game && myPlayerRow && playerIsViewer(myPlayerRow, bootstrap.game))
  const killedPlayer = state?.lastNightKillPlayerId
    ? state.players.find((p) => p.id === state.lastNightKillPlayerId)
    : undefined
  const votedPlayer = state?.lastVoteResultPlayerId
    ? state.players.find((p) => p.id === state.lastVoteResultPlayerId)
    : undefined

  useEffect(() => {
    if (!state?.phaseDeadline || state.phase === 'game_over') return
    const id = setInterval(() => setTimerTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [state?.phaseDeadline, state?.phase])

  useEffect(() => {
    if (!state?.phaseDeadline || state.phase === 'game_over') return
    if (secondsUntilMafiaDeadline(state.phaseDeadline) > 0) return
    void postMafiaAdvance(gameCode.toUpperCase()).then(() => bootstrap.load()).catch(() => {})
  }, [state?.phaseDeadline, state?.phase, timerTick, gameCode, bootstrap.load])

  const act = async (fn: () => Promise<unknown>) => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      await fn()
      await bootstrap.load()
    } finally {
      setActing(false)
    }
  }

  const showDayVotes =
    state?.phase === 'day' && !(state.anonymousVotes && !myState?.dayVoteSubmitted)

  const sendChat = useCallback(
    async (msg: string, scope: 'night' | 'day' | 'ghost') => {
      const token = bootstrap.myResumeToken
      if (!token) return
      await postMafiaChat(bootstrap.code, token, msg, scope)
      await bootstrap.load()
    },
    [bootstrap.myResumeToken, bootstrap.code, bootstrap.load]
  )

  void timerTick

  if (bootstrap.screen === 'loading') return <GameLoading />
  if (bootstrap.screen === 'not_found') return <GameNotFound gameCode={bootstrap.code} />
  if (bootstrap.screen === 'join' && bootstrap.game) {
    return (
      <JoinScreen
        gameCode={bootstrap.code}
        joinName={bootstrap.joinName}
        joining={bootstrap.joining}
        error={bootstrap.error}
        onChangeName={bootstrap.setJoinName}
        onJoin={() => void bootstrap.join()}
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game || !state) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const winner =
      state.winningTeam === 'mafia'
        ? 'Mafia wins!'
        : state.winningTeam === 'village'
          ? 'Village wins!'
          : 'Game over'
    const teamOf = (role?: string) => (role === 'mafia' ? 'mafia' : 'village')
    const leaderboard = [...state.players]
      .sort((a, b) => {
        const aWon = teamOf(a.role) === state.winningTeam ? 0 : 1
        const bWon = teamOf(b.role) === state.winningTeam ? 0 : 1
        if (aWon !== bWon) return aWon - bWon
        if (a.isAlive !== b.isAlive) return a.isAlive ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .map((p) => ({
        name: p.name,
        score: p.role ? `${mafiaRoleEmoji(p.role)} ${p.role.charAt(0).toUpperCase()}${p.role.slice(1)}` : '—',
        detail: p.isAlive ? 'Survived' : 'Eliminated',
        you: !!bootstrap.myPlayerId && p.id === bootstrap.myPlayerId,
        highlight: !!state.winningTeam && teamOf(p.role) === state.winningTeam,
      }))
    return (
      <GameShell bootstrap={bootstrap} title={batch7GameLabel('mafia')} subtitle={bootstrap.code}>
        <GameFinishPanel bootstrap={bootstrap} title={winner} subtitle="Roles revealed" leaderboard={leaderboard} />
      </GameShell>
    )
  }

  const secondsLeft = secondsUntilMafiaDeadline(state.phaseDeadline)
  const phase = state.phase

  return (
    <GameShell bootstrap={bootstrap} title="Mafia" subtitle={`Day ${state.dayNumber} · ${bootstrap.code}`}>
      <TurnBanner
        text={`${mafiaPhaseLabel(phase)}${secondsLeft > 0 ? ` · ${secondsLeft}s` : ''}`}
        isMyTurn={phase === 'night' && amIAlive && !!myState && myState.role !== 'villager' && !myState.nightActionSubmitted}
      />

      {isViewer && bootstrap.game && bootstrap.myPlayerId && myPlayerRow ? (
        <View style={styles.bannerWrap}>
          <ViewerModeBanner
            gameCode={bootstrap.code}
            playerId={bootstrap.myPlayerId}
            game={bootstrap.game}
            player={myPlayerRow}
            players={bootstrap.players}
            onPromoted={() => bootstrap.load()}
          />
        </View>
      ) : null}

      <View style={styles.rulesRow}>
        <GameRulesLink gameType="mafia" />
      </View>

      {myState ? (
        <View style={styles.identityCard}>
          <Text style={styles.identityEmoji}>{mafiaRoleEmoji(myState.role)}</Text>
          <Text style={styles.identityRole}>{myState.role.toUpperCase()}</Text>
          <Text style={styles.identityTeam}>Team {myState.team === 'mafia' ? 'Mafia' : 'Village'}</Text>
          <Text style={styles.identityDesc}>{ROLE_DESC[myState.role]}</Text>
          {myState.mafiaTeammates.length > 0 ? (
            <Text style={styles.allies}>Allies: {myState.mafiaTeammates.join(', ')}</Text>
          ) : null}
          {myState.detectiveResult ? (
            <Text style={styles.investigation}>
              {myState.detectiveResult.targetName} is{' '}
              {myState.detectiveResult.alignment === 'mafia' ? 'Mafia' : 'Village'}
            </Text>
          ) : null}
          <View style={[styles.statusPill, amIAlive ? styles.statusAlive : styles.statusDead]}>
            <Text style={[styles.statusPillText, amIAlive ? styles.statusAliveText : styles.statusDeadText]}>
              {amIAlive ? '💚 ALIVE' : '💀 ELIMINATED'}
            </Text>
          </View>
        </View>
      ) : amISpectator ? (
        <View style={styles.identityCard}>
          <Text style={styles.identityEmoji}>👁️</Text>
          <Text style={styles.identityRole}>SPECTATING</Text>
          <Text style={styles.identityDesc}>You are watching this game.</Text>
        </View>
      ) : null}

      <View style={styles.phaseCard}>
        {phase === 'role_reveal' ? (
          <Text style={styles.phaseText}>Check your role above. Do not show your screen!</Text>
        ) : null}

        {phase === 'night' ? (
          <>
            {amISpectator ? (
              <Text style={styles.phaseText}>Watching — night actions in progress…</Text>
            ) : !amIAlive ? (
              <Text style={styles.phaseText}>You are eliminated. Watch the night unfold…</Text>
            ) : myState?.role === 'villager' ? (
              <Text style={styles.phaseText}>The village sleeps…</Text>
            ) : myState?.nightActionSubmitted ? (
              <Text style={styles.phaseOk}>Night action submitted.</Text>
            ) : (
              <>
                <Text style={styles.phaseText}>
                  {myState?.role === 'mafia' && 'Choose a villager to eliminate.'}
                  {myState?.role === 'doctor' && 'Choose a player to protect.'}
                  {myState?.role === 'detective' && 'Choose a player to investigate.'}
                </Text>
                <View style={styles.targetGrid}>
                  {state.players
                    .filter((p) => p.isAlive && p.id !== bootstrap.myPlayerId)
                    .map((p) => (
                      <Pressable
                        key={p.id}
                        style={styles.targetBtn}
                        disabled={acting}
                        onPress={() => act(() => postMafiaNightAction(bootstrap.code, bootstrap.myResumeToken!, p.id))}
                      >
                        <Text style={styles.targetText}>{p.name}</Text>
                      </Pressable>
                    ))}
                </View>
              </>
            )}
          </>
        ) : null}

        {phase === 'day_report' ? (
          <View style={styles.centerBlock}>
            <Text style={styles.phaseTitle}>Sunrise</Text>
            {killedPlayer ? (
              <Text style={styles.phaseText}>
                {killedPlayer.name} was eliminated
                {killedPlayer.role ? ` (${killedPlayer.role})` : ''}.
              </Text>
            ) : (
              <Text style={styles.phaseText}>
                {state.lastNightMafiaHadTarget ? 'The Doctor saved someone!' : 'Nobody died last night.'}
              </Text>
            )}
          </View>
        ) : null}

        {phase === 'day' ? (
          <>
            {amISpectator ? (
              <Text style={styles.phaseText}>Watching — voting in progress…</Text>
            ) : !amIAlive ? (
              <Text style={styles.phaseText}>You are eliminated — watch the vote.</Text>
            ) : (
              <>
                {myState?.dayVoteSubmitted ? (
                  <View style={styles.voteCastRow}>
                    <Text style={styles.phaseOk}>✓ Vote cast</Text>
                    <Pressable
                      disabled={acting}
                      onPress={() => act(() => postMafiaVote(bootstrap.code, bootstrap.myResumeToken!, null))}
                    >
                      <Text style={styles.changeVoteLink}>Change vote</Text>
                    </Pressable>
                  </View>
                ) : null}
                <View style={styles.targetGrid}>
                  {state.players
                    .filter((p) => p.isAlive && p.id !== bootstrap.myPlayerId)
                    .map((p) => {
                      const votes = showDayVotes ? (state.voteTallies[p.id] ?? 0) : 0
                      return (
                        <Pressable
                          key={p.id}
                          style={styles.targetBtn}
                          disabled={acting}
                          onPress={() => act(() => postMafiaVote(bootstrap.code, bootstrap.myResumeToken!, p.id))}
                        >
                          <View style={styles.targetHeaderRow}>
                            <Text style={styles.targetText}>{p.name}</Text>
                            {votes > 0 ? (
                              <View style={styles.voteBadge}>
                                <Text style={styles.voteBadgeText}>{votes}</Text>
                              </View>
                            ) : null}
                          </View>
                          {votes > 0 ? (
                            <View style={styles.pipRow}>
                              {Array.from({ length: Math.min(votes, 8) }).map((_, i) => (
                                <Text key={i} style={styles.pip}>
                                  ●
                                </Text>
                              ))}
                            </View>
                          ) : null}
                        </Pressable>
                      )
                    })}
                </View>
                <Pressable
                  style={styles.skipFullBtn}
                  disabled={acting}
                  onPress={() => act(() => postMafiaVote(bootstrap.code, bootstrap.myResumeToken!, null))}
                >
                  <Text style={styles.skipFullText}>⏭ Skip / No Lynch</Text>
                </Pressable>
              </>
            )}
          </>
        ) : null}

        {phase === 'elimination' ? (
          <View style={styles.centerBlock}>
            <Text style={styles.phaseTitle}>Vote result</Text>
            {votedPlayer ? (
              <Text style={styles.phaseText}>
                {votedPlayer.name} was voted out
                {votedPlayer.role ? ` (${votedPlayer.role})` : ''}.
              </Text>
            ) : (
              <Text style={styles.phaseText}>No one was eliminated.</Text>
            )}
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Players</Text>
      <View style={styles.playerList}>
        {state.players.map((p) => {
          const rosterVotes = phase === 'day' && showDayVotes && p.isAlive ? (state.voteTallies[p.id] ?? 0) : 0
          return (
            <Text key={p.id} style={[styles.playerChip, !p.isAlive && styles.playerDead]}>
              {p.isAlive ? '👤 ' : '💀 '}
              {p.name}
              {!p.isAlive && p.role ? ` · ${p.role}` : ''}
              {rosterVotes > 0 ? ` · ${rosterVotes} vote${rosterVotes !== 1 ? 's' : ''}` : ''}
            </Text>
          )
        })}
      </View>

      {/* Alive Mafia see their secret chat AND the town chat simultaneously (matches web) */}
      {myState?.role === 'mafia' && amIAlive ? (
        <MafiaChatSection
          styles={styles}
          title="Mafia secret chat"
          accent="mafia"
          placeholder="Whisper to allies…"
          messages={myState.mafiaChatMessages ?? []}
          onSend={(msg) => sendChat(msg, 'night')}
        />
      ) : null}

      {phase !== 'night' && phase !== 'role_reveal' ? (
        <MafiaChatSection
          styles={styles}
          title="Town discussion"
          placeholder="Share your thoughts…"
          messages={state.dayChatMessages ?? []}
          disabled={!amIAlive || amISpectator}
          onSend={(msg) => sendChat(msg, 'day')}
        />
      ) : null}

      {!amIAlive && bootstrap.myPlayerId ? (
        <MafiaChatSection
          styles={styles}
          title="Ghost chat (only the dead can see this)"
          placeholder="Chat with fellow ghosts…"
          messages={state.ghostChatMessages ?? []}
          onSend={(msg) => sendChat(msg, 'ghost')}
        />
      ) : null}
    </GameShell>
  )
}

function MafiaChatSection({
  styles,
  title,
  messages,
  placeholder,
  onSend,
  disabled = false,
  accent,
}: {
  styles: ReturnType<typeof makeStyles>
  title: string
  messages: MafiaChatMessage[]
  placeholder: string
  onSend: (msg: string) => Promise<void> | void
  disabled?: boolean
  accent?: 'mafia'
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    const msg = draft.trim()
    if (!msg || sending || disabled) return
    setSending(true)
    try {
      await onSend(msg)
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Text style={[styles.sectionTitle, accent === 'mafia' && styles.mafiaChatTitle]}>{title}</Text>
      <ScrollView style={styles.chatLog} nestedScrollEnabled>
        {messages.length === 0 ? (
          <Text style={styles.chatEmpty}>No messages yet.</Text>
        ) : (
          messages.map((m) => (
            <Text key={m.id} style={styles.chatLine}>
              <Text style={styles.chatName}>{m.sender_name}: </Text>
              {m.message}
            </Text>
          ))
        )}
      </ScrollView>
      <View style={styles.chatRow}>
        <TextInput
          style={styles.chatInput}
          value={draft}
          onChangeText={setDraft}
          editable={!disabled}
          placeholder={disabled ? 'You cannot chat right now' : placeholder}
          placeholderTextColor="#71717a"
        />
        <Pressable
          style={styles.chatSend}
          disabled={disabled || sending || !draft.trim()}
          onPress={() => void submit()}
        >
          <Text style={styles.chatSendText}>Send</Text>
        </Pressable>
      </View>
    </>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  identityCard: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    gap: 4,
  },
  identityEmoji: { fontSize: 36 },
  identityRole: { color: theme.text, fontSize: 20, fontWeight: '900' },
  identityTeam: { color: theme.textMuted, fontWeight: '600' },
  identityDesc: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 },
  allies: { color: '#fca5a5', fontSize: 13, marginTop: 8 },
  investigation: { color: '#86efac', fontSize: 13, marginTop: 8 },
  statusPill: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  statusAlive: { backgroundColor: '#10b98118', borderColor: '#10b98155' },
  statusDead: { backgroundColor: '#f43f5e18', borderColor: '#f43f5e55' },
  statusAliveText: { color: '#34d399' },
  statusDeadText: { color: '#fb7185' },
  bannerWrap: { marginBottom: 12 },
  rulesRow: { alignItems: 'flex-end', marginBottom: 8 },
  phaseCard: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  phaseTitle: { color: theme.text, fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  phaseText: { color: theme.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 8 },
  phaseOk: { color: '#86efac', fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  centerBlock: { alignItems: 'center', gap: 8 },
  targetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  targetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: theme.border,
    minWidth: '45%',
  },
  skipBtn: { borderWidth: 1, borderColor: theme.border },
  targetText: { color: theme.text, fontWeight: '700' },
  targetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  voteBadge: {
    backgroundColor: '#f43f5e22',
    borderColor: '#f43f5e55',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  voteBadgeText: { color: '#fb7185', fontSize: 12, fontWeight: '800' },
  pipRow: { flexDirection: 'row', gap: 2, marginTop: 4, flexWrap: 'wrap' },
  pip: { color: '#fb7185', fontSize: 10 },
  voteCastRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  changeVoteLink: { color: theme.textMuted, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  skipFullBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.border,
    alignItems: 'center',
  },
  skipFullText: { color: theme.textSecondary, fontWeight: '700' },
  sectionTitle: { color: theme.textMuted, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  mafiaChatTitle: { color: '#f87171' },
  playerList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  playerChip: { color: theme.text, backgroundColor: theme.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  playerDead: { opacity: 0.55 },
  chatLog: { maxHeight: 120, backgroundColor: theme.surface, borderRadius: 8, padding: 8, marginBottom: 8 },
  chatLine: { color: theme.textSecondary, fontSize: 13, marginBottom: 4 },
  chatEmpty: { color: theme.textMuted, fontSize: 12, fontStyle: 'italic', textAlign: 'center', paddingVertical: 16 },
  chatName: { color: theme.text, fontWeight: '700' },
  chatRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chatInput: {
    flex: 1,
    backgroundColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.text,
  },
  chatSend: {
    backgroundColor: theme.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  // white on the solid rose send button — intentional
  chatSendText: { color: '#fff', fontWeight: '800' },
})
