import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { normalizeGameCode, type Game, type Player } from '@fateround/shared'
import {
  type MafiaStateResponse,
  mafiaPhaseLabel,
  mafiaRoleEmoji,
  secondsUntilMafiaDeadline,
} from '@fateround/shared/mafia'
import { batch7GameLabel } from '@fateround/shared/batch-7-games'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import {
  FinishedPanel,
  GameLoading,
  GameNotFound,
  GameShell,
  TurnBanner,
} from '@/components/game/GameChrome'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { getPlayerSession } from '@/lib/secure-session'
import {
  postMafiaAdvance,
  postMafiaChat,
  postMafiaNightAction,
  postMafiaState,
  postMafiaVote,
} from '@/lib/game-api'

type Screen = 'loading' | 'join' | 'waiting' | 'active' | 'finished' | 'not_found'

const ROLE_DESC: Record<string, string> = {
  mafia: 'Eliminate villagers at night. Blend in during the day.',
  doctor: 'Protect one player each night from the Mafia.',
  detective: 'Investigate one player each night to learn their alignment.',
  villager: 'Debate during the day to find and vote out the Mafia.',
}

export function MafiaPlayerView({ gameCode }: { gameCode: string }) {
  const [mafiaState, setMafiaState] = useState<MafiaStateResponse | null>(null)
  const [acting, setActing] = useState(false)
  const [chatDraft, setChatDraft] = useState('')
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

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'mafia_sessions', 'mafia_player_states'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const state = mafiaState ?? bootstrap.gameState
  const myState = state?.myState ?? null
  const amIAlive = state?.players.find((p) => p.id === bootstrap.myPlayerId)?.isAlive ?? false
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

  const chatScope = useMemo((): 'night' | 'day' | 'ghost' | null => {
    if (!myState || !state) return null
    if (!amIAlive && state.phase !== 'game_over') return 'ghost'
    if (myState.role === 'mafia' && amIAlive) return 'night'
    if (amIAlive && (state.phase === 'day_report' || state.phase === 'day' || state.phase === 'elimination')) {
      return 'day'
    }
    return null
  }, [myState, state, amIAlive])

  const chatMessages = useMemo(() => {
    if (!state) return []
    if (chatScope === 'ghost') return state.ghostChatMessages ?? []
    if (chatScope === 'day') return state.dayChatMessages ?? []
    if (chatScope === 'night') return myState?.mafiaChatMessages ?? []
    return []
  }, [state, chatScope, myState])

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
  if (bootstrap.screen === 'waiting' && bootstrap.game) {
    return <LobbyView game={bootstrap.game} players={bootstrap.players} myPlayerId={bootstrap.myPlayerId} />
  }
  if (!bootstrap.game || !state) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const winner =
      state.winningTeam === 'mafia'
        ? 'Mafia wins!'
        : state.winningTeam === 'village'
          ? 'Village wins!'
          : 'Game over'
    const roles = state.players
      .map((p) => `${p.name}: ${p.role ?? '?'}`)
      .join('\n')
    return (
      <GameShell title={batch7GameLabel('mafia')} subtitle={bootstrap.code}>
        <FinishedPanel title={winner} detail={roles} />
      </GameShell>
    )
  }

  const secondsLeft = secondsUntilMafiaDeadline(state.phaseDeadline)
  const phase = state.phase

  return (
    <GameShell title="Mafia" subtitle={`Day ${state.dayNumber} · ${bootstrap.code}`}>
      <TurnBanner
        text={`${mafiaPhaseLabel(phase)}${secondsLeft > 0 ? ` · ${secondsLeft}s` : ''}`}
        isMyTurn={phase === 'night' && amIAlive && !!myState && myState.role !== 'villager' && !myState.nightActionSubmitted}
      />

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
        </View>
      ) : null}

      <View style={styles.phaseCard}>
        {phase === 'role_reveal' ? (
          <Text style={styles.phaseText}>Check your role above. Do not show your screen!</Text>
        ) : null}

        {phase === 'night' ? (
          <>
            {!amIAlive ? (
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
            {!amIAlive ? (
              <Text style={styles.phaseText}>You are eliminated — watch the vote.</Text>
            ) : (
              <>
                {myState?.dayVoteSubmitted ? (
                  <Text style={styles.phaseOk}>Vote cast — tap Skip to change.</Text>
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
                          <Text style={styles.targetText}>
                            {p.name}
                            {votes > 0 ? ` (${votes})` : ''}
                          </Text>
                        </Pressable>
                      )
                    })}
                  <Pressable
                    style={[styles.targetBtn, styles.skipBtn]}
                    disabled={acting}
                    onPress={() => act(() => postMafiaVote(bootstrap.code, bootstrap.myResumeToken!, null))}
                  >
                    <Text style={styles.targetText}>Skip / clear</Text>
                  </Pressable>
                </View>
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
        {state.players.map((p) => (
          <Text key={p.id} style={[styles.playerChip, !p.isAlive && styles.playerDead]}>
            {p.name}
            {!p.isAlive && p.role ? ` · ${p.role}` : ''}
            {!p.isAlive ? ' 💀' : ''}
          </Text>
        ))}
      </View>

      {chatScope ? (
        <>
          <Text style={styles.sectionTitle}>
            {chatScope === 'ghost' ? 'Ghost chat' : chatScope === 'day' ? 'Day chat' : 'Mafia chat'}
          </Text>
          <ScrollView style={styles.chatLog} nestedScrollEnabled>
            {chatMessages.map((m) => (
              <Text key={m.id} style={styles.chatLine}>
                <Text style={styles.chatName}>{m.sender_name}: </Text>
                {m.message}
              </Text>
            ))}
          </ScrollView>
          <View style={styles.chatRow}>
            <TextInput
              style={styles.chatInput}
              value={chatDraft}
              onChangeText={setChatDraft}
              placeholder="Message…"
              placeholderTextColor="#71717a"
            />
            <Pressable
              style={styles.chatSend}
              disabled={acting || !chatDraft.trim()}
              onPress={() => {
                const msg = chatDraft.trim()
                if (!msg || !bootstrap.myResumeToken || !chatScope) return
                void act(async () => {
                  await postMafiaChat(bootstrap.code, bootstrap.myResumeToken!, msg, chatScope)
                  setChatDraft('')
                })
              }}
            >
              <Text style={styles.chatSendText}>Send</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </GameShell>
  )
}

const styles = StyleSheet.create({
  identityCard: {
    backgroundColor: '#1e1e28',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    gap: 4,
  },
  identityEmoji: { fontSize: 36 },
  identityRole: { color: '#fafafa', fontSize: 20, fontWeight: '900' },
  identityTeam: { color: '#a1a1aa', fontWeight: '600' },
  identityDesc: { color: '#a1a1aa', fontSize: 13, textAlign: 'center', marginTop: 4 },
  allies: { color: '#fca5a5', fontSize: 13, marginTop: 8 },
  investigation: { color: '#86efac', fontSize: 13, marginTop: 8 },
  phaseCard: {
    backgroundColor: '#1e1e28',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  phaseTitle: { color: '#fafafa', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  phaseText: { color: '#d4d4d8', fontSize: 14, textAlign: 'center', marginBottom: 8 },
  phaseOk: { color: '#86efac', fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  centerBlock: { alignItems: 'center', gap: 8 },
  targetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  targetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2a2a35',
    minWidth: '45%',
  },
  skipBtn: { borderWidth: 1, borderColor: '#52525b' },
  targetText: { color: '#fafafa', fontWeight: '700', textAlign: 'center' },
  sectionTitle: { color: '#a1a1aa', fontWeight: '700', marginBottom: 6, marginTop: 4 },
  playerList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  playerChip: { color: '#fafafa', backgroundColor: '#2a2a35', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  playerDead: { opacity: 0.55 },
  chatLog: { maxHeight: 120, backgroundColor: '#1e1e28', borderRadius: 8, padding: 8, marginBottom: 8 },
  chatLine: { color: '#d4d4d8', fontSize: 13, marginBottom: 4 },
  chatName: { color: '#fafafa', fontWeight: '700' },
  chatRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chatInput: {
    flex: 1,
    backgroundColor: '#2a2a35',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fafafa',
  },
  chatSend: {
    backgroundColor: '#f43f5e',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  chatSendText: { color: '#fff', fontWeight: '800' },
})
