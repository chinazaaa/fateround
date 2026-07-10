import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  type Game,
  type Participant,
  type Player,
  type Round,
  type Vote,
  type WyrChoice,
  type PairAssignmentMap,
  type VoteAssignment,
} from '@fateround/shared'
import {
  assignPairSlot,
  emptyAssignment,
  isAssignmentComplete,
  isBinaryChoiceGame,
  isBinaryPeoplePollGame,
  isMostLikelyTo,
  isNeverHaveIEver,
  isPairAssignmentValid,
  isPickANumber,
  isThreeChoiceGame,
  isWhoSaidThis,
  mltVoteTargets,
  panAvailableNumbers,
  panUsedNumbersFromVotes,
  parseGameType,
  parsePairVoteMode,
  parsePickANumberPool,
  pairLabels,
  pollGameLabel,
  roundParticipants,
  smkSlotLabels,
} from '@fateround/shared/poll-games'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { FinishedPanel, GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postVote } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { PARTICIPANT_SELECT, ROUND_SELECT, VOTE_SELECT } from '@/lib/supabase-selects'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

type PollState = {
  rounds: Round[]
  participants: Participant[]
  votes: Vote[]
}

export function PollPlayerView({ gameCode }: { gameCode: string }) {
  const [pollState, setPollState] = useState<PollState>({ rounds: [], participants: [], votes: [] })
  const [wyrChoice, setWyrChoice] = useState<WyrChoice | null>(null)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [animeChoice, setAnimeChoice] = useState<string | null>(null)
  const [pickedNumber, setPickedNumber] = useState<number | null>(null)
  const [assignment, setAssignment] = useState<VoteAssignment>(emptyAssignment())
  const [pairAssignment, setPairAssignment] = useState<PairAssignmentMap>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [revealedQuestion, setRevealedQuestion] = useState<string | null>(null)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: PollState; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      const [roundsRes, participantsRes, votesRes] = await Promise.all([
        getSupabase().from('rounds').select(ROUND_SELECT).eq('game_id', code).order('round_number'),
        getSupabase().from('participants').select(PARTICIPANT_SELECT).eq('game_id', code).order('display_order'),
        getSupabase().from('votes').select(VOTE_SELECT).eq('game_id', code),
      ])
      if (roundsRes.error || participantsRes.error || votesRes.error) {
        return { state: { rounds: [], participants: [], votes: [] }, ok: false }
      }
      const state: PollState = {
        rounds: (roundsRes.data as Round[]) ?? [],
        participants: (participantsRes.data as Participant[]) ?? [],
        votes: (votesRes.data as Vote[]) ?? [],
      }
      setPollState(state)
      return { state, ok: true }
    },
    [gameCode]
  )

  const computeScreen = useCallback((game: Game, playerId: string | null): Screen => {
    if (!playerId) return 'join'
    if (game.status === 'waiting') return 'waiting'
    if (game.status === 'finished') return 'finished'
    return 'playing'
  }, [])

  const bootstrap = useGameViewBootstrap<Screen, PollState>({
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
    [{ table: 'games', column: 'id' }, 'rounds', 'participants', 'votes'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const gameType = bootstrap.game ? parseGameType(bootstrap.game.game_type) : null

  const currentRound = useMemo(() => {
    if (!bootstrap.game) return null
    const byPointer =
      pollState.rounds.find((r) => r.round_number === bootstrap.game!.current_round_number) ?? null
    const active = pollState.rounds.find((r) => r.status === 'active') ?? null
    if (active && byPointer && active.id !== byPointer.id && byPointer.status === 'finished') return active
    return byPointer ?? active
  }, [bootstrap.game, pollState.rounds])

  const myVote = useMemo(() => {
    if (!bootstrap.myPlayerId || !currentRound) return undefined
    return pollState.votes.find(
      (v) => v.player_id === bootstrap.myPlayerId && v.round_id === currentRound.id
    )
  }, [bootstrap.myPlayerId, currentRound, pollState.votes])

  const roundIds = currentRound?.participant_ids ?? []
  const roundPeople = useMemo(
    () => roundParticipants(roundIds, pollState.participants),
    [roundIds, pollState.participants]
  )

  const pairMode = parsePairVoteMode(bootstrap.game?.pair_vote_mode)
  const pairLabel = pairLabels(gameType ?? 'would_you_rather')

  const canSubmit = useMemo(() => {
    if (!gameType || myVote) return false
    if (isBinaryChoiceGame(gameType) || isNeverHaveIEver(gameType)) return wyrChoice !== null
    if (isPickANumber(gameType)) return pickedNumber !== null
    if (isMostLikelyTo(gameType)) return targetId !== null
    if (isWhoSaidThis(gameType)) {
      if (currentRound?.anime_metadata) return !!animeChoice
      return targetId !== null && !!currentRound?.quote_text
    }
    if (isBinaryPeoplePollGame(gameType)) {
      return isPairAssignmentValid(pairAssignment, roundIds, pairMode)
    }
    if (isThreeChoiceGame(gameType)) {
      return isAssignmentComplete(assignment, gameType)
    }
    return false
  }, [
    animeChoice,
    assignment,
    currentRound,
    gameType,
    myVote,
    pairAssignment,
    pairMode,
    pickedNumber,
    roundIds,
    targetId,
    wyrChoice,
  ])

  const submitVote = async () => {
    if (!bootstrap.myResumeToken || !bootstrap.game || !currentRound || !gameType || !canSubmit) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      let body: Record<string, unknown>
      if (isBinaryChoiceGame(gameType) || isNeverHaveIEver(gameType)) {
        body = { wyrChoice }
      } else if (isPickANumber(gameType)) {
        body = { pickedNumber }
      } else if (isMostLikelyTo(gameType)) {
        const targets = mltVoteTargets(bootstrap.game, bootstrap.players, pollState.participants)
        const target = targets.find((t) => t.id === targetId)
        body =
          target?.kind === 'participant'
            ? { targetParticipantId: targetId }
            : { targetPlayerId: targetId }
      } else if (isWhoSaidThis(gameType)) {
        body = currentRound.anime_metadata
          ? { animeChoice }
          : { targetParticipantId: targetId }
      } else if (isBinaryPeoplePollGame(gameType)) {
        body = {
          pairAssignments: Object.fromEntries(
            roundIds
              .map((id) => [id, pairAssignment[id]] as const)
              .filter((entry): entry is [string, 'kiss' | 'kill'] => entry[1] === 'kiss' || entry[1] === 'kill')
          ),
        }
      } else {
        body = {
          kiss: assignment.kiss,
          marry: isThreeChoiceGame(gameType) ? assignment.marry : null,
          kill: assignment.kill,
        }
      }

      const result = await postVote(bootstrap.code, bootstrap.myResumeToken, currentRound.id, body)
      if (result.revealedQuestion) setRevealedQuestion(result.revealedQuestion)
      await bootstrap.load()
      resetDraft()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit vote')
    } finally {
      setSubmitting(false)
    }
  }

  const resetDraft = () => {
    setWyrChoice(null)
    setTargetId(null)
    setAnimeChoice(null)
    setPickedNumber(null)
    setAssignment(emptyAssignment())
    setPairAssignment({})
    setRevealedQuestion(null)
    setSubmitError(null)
  }

  const assignSmkSlot = (slot: keyof VoteAssignment, participantId: string) => {
    setAssignment((prev) => {
      const next = { ...prev }
      for (const key of ['kiss', 'marry', 'kill'] as const) {
        if (next[key] === participantId) next[key] = null
      }
      next[slot] = prev[slot] === participantId ? null : participantId
      return next
    })
  }

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
  if (!bootstrap.game || !gameType) return <GameLoading />

  const title = pollGameLabel(gameType)
  const me = bootstrap.players.find((p) => p.id === bootstrap.myPlayerId)
  const isViewer = !!me?.spectator

  if (bootstrap.screen === 'finished') {
    return (
      <GameShell title={title} subtitle={bootstrap.code}>
        <FinishedPanel title="Game over" detail="Thanks for playing!" />
      </GameShell>
    )
  }

  const panPool = isPickANumber(gameType) ? parsePickANumberPool(bootstrap.game.custom_questions) : []
  const panUsed = panUsedNumbersFromVotes(pollState.votes, currentRound?.id)
  const panAvailable = panAvailableNumbers(panPool.length, panUsed)

  return (
    <GameShell title={title} subtitle={`Round ${currentRound?.round_number ?? '—'}`}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {isViewer ? (
          <Text style={styles.waiting}>You are watching — voting is disabled.</Text>
        ) : !currentRound || currentRound.status !== 'active' ? (
          <Text style={styles.waiting}>Waiting for the next round…</Text>
        ) : myVote ? (
          <Text style={styles.locked}>Vote locked — waiting for results.</Text>
        ) : (
          <>
            {isBinaryChoiceGame(gameType) || isNeverHaveIEver(gameType) ? (
              <>
                <Text style={styles.prompt}>
                  {isNeverHaveIEver(gameType)
                    ? currentRound.mlt_question ?? 'Never have I ever…'
                    : 'Pick an option'}
                </Text>
                <View style={styles.choices}>
                  <ChoiceButton
                    label={currentRound.wyr_option_a ?? 'Option A'}
                    selected={wyrChoice === 'a'}
                    disabled={submitting}
                    onPress={() => setWyrChoice('a')}
                  />
                  <ChoiceButton
                    label={currentRound.wyr_option_b ?? 'Option B'}
                    selected={wyrChoice === 'b'}
                    disabled={submitting}
                    onPress={() => setWyrChoice('b')}
                  />
                </View>
              </>
            ) : null}

            {isMostLikelyTo(gameType) ? (
              <>
                <Text style={styles.prompt}>{currentRound.mlt_question ?? 'Who is most likely to…?'}</Text>
                <View style={styles.choices}>
                  {mltVoteTargets(bootstrap.game, bootstrap.players, pollState.participants).map((target) => (
                    <ChoiceButton
                      key={target.id}
                      label={target.name}
                      selected={targetId === target.id}
                      disabled={submitting}
                      onPress={() => setTargetId(target.id)}
                    />
                  ))}
                </View>
              </>
            ) : null}

            {isWhoSaidThis(gameType) ? (
              <>
                {currentRound.quote_text ? (
                  <Text style={styles.quote}>"{currentRound.quote_text}"</Text>
                ) : (
                  <Text style={styles.waiting}>Waiting for the quote…</Text>
                )}
                {currentRound.anime_metadata ? (
                  <View style={styles.choices}>
                    {currentRound.anime_metadata.choices.map((choice) => (
                      <ChoiceButton
                        key={choice}
                        label={choice}
                        selected={animeChoice === choice}
                        disabled={submitting || !currentRound.quote_text}
                        onPress={() => setAnimeChoice(choice)}
                      />
                    ))}
                  </View>
                ) : (
                  <View style={styles.choices}>
                    {roundPeople.map((person) => (
                      <ChoiceButton
                        key={person.id}
                        label={person.name}
                        selected={targetId === person.id}
                        disabled={submitting || !currentRound.quote_text}
                        onPress={() => setTargetId(person.id)}
                      />
                    ))}
                  </View>
                )}
              </>
            ) : null}

            {isPickANumber(gameType) ? (
              <>
                <Text style={styles.prompt}>Pick an available number</Text>
                <View style={styles.numberGrid}>
                  {panAvailable.map((n) => (
                    <Pressable
                      key={n}
                      style={[styles.numberCell, pickedNumber === n && styles.numberCellSelected]}
                      disabled={submitting}
                      onPress={() => setPickedNumber(n)}
                    >
                      <Text style={styles.numberText}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
                {revealedQuestion || currentRound.mlt_question ? (
                  <Text style={styles.revealed}>{revealedQuestion ?? currentRound.mlt_question}</Text>
                ) : null}
              </>
            ) : null}

            {isThreeChoiceGame(gameType) ? (
              <>
                <Text style={styles.prompt}>Assign kiss, marry, and kill</Text>
                {roundPeople.map((person) => (
                  <View key={person.id} style={styles.personRow}>
                    <Text style={styles.personName}>{person.name}</Text>
                    <View style={styles.slotRow}>
                      {(['kiss', 'marry', 'kill'] as const).map((slot) => {
                        const labels = smkSlotLabels()
                        const selected = assignment[slot] === person.id
                        return (
                          <Pressable
                            key={slot}
                            style={[styles.slotBtn, selected && styles.slotBtnSelected]}
                            disabled={submitting}
                            onPress={() => assignSmkSlot(slot, person.id)}
                          >
                            <Text style={styles.slotBtnText}>{labels[slot]}</Text>
                          </Pressable>
                        )
                      })}
                    </View>
                  </View>
                ))}
              </>
            ) : null}

            {isBinaryPeoplePollGame(gameType) ? (
              <>
                <Text style={styles.prompt}>Vote on each person</Text>
                {roundPeople.map((person) => (
                  <View key={person.id} style={styles.personRow}>
                    <Text style={styles.personName}>{person.name}</Text>
                    <View style={styles.slotRow}>
                      <Pressable
                        style={[
                          styles.pairBtn,
                          pairAssignment[person.id] === 'kiss' && styles.pairBtnPositive,
                        ]}
                        disabled={submitting}
                        onPress={() =>
                          setPairAssignment((prev) =>
                            assignPairSlot(prev, person.id, 'kiss', roundIds, pairMode)
                          )
                        }
                      >
                        <Text style={styles.pairBtnText}>{pairLabel.positive}</Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.pairBtn,
                          pairAssignment[person.id] === 'kill' && styles.pairBtnNegative,
                        ]}
                        disabled={submitting}
                        onPress={() =>
                          setPairAssignment((prev) =>
                            assignPairSlot(prev, person.id, 'kill', roundIds, pairMode)
                          )
                        }
                      >
                        <Text style={styles.pairBtnText}>{pairLabel.negative}</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </>
            ) : null}

            {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

            <Pressable
              style={[styles.submit, !canSubmit && styles.submitDisabled]}
              disabled={!canSubmit || submitting}
              onPress={() => void submitVote()}
            >
              <Text style={styles.submitText}>{submitting ? 'Submitting…' : 'Submit vote'}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </GameShell>
  )
}

function ChoiceButton({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string
  selected: boolean
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      style={[styles.choice, selected && styles.choiceSelected]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={styles.choiceText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32, gap: 12 },
  waiting: { color: '#9ca3af', fontSize: 16, textAlign: 'center', marginTop: 24 },
  locked: { color: '#86efac', fontSize: 16, textAlign: 'center', marginTop: 24 },
  prompt: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 26 },
  quote: { color: '#e5e7eb', fontSize: 18, fontStyle: 'italic', lineHeight: 26 },
  revealed: { color: '#fcd34d', fontSize: 16, lineHeight: 24, marginTop: 8 },
  choices: { gap: 10 },
  choice: {
    backgroundColor: '#17171d',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2a35',
  },
  choiceSelected: { borderColor: '#f43f5e', backgroundColor: '#3f1d2b' },
  choiceText: { color: '#fff', fontSize: 16 },
  personRow: { gap: 8, marginTop: 4 },
  personName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#17171d',
    borderWidth: 1,
    borderColor: '#2a2a35',
  },
  slotBtnSelected: { borderColor: '#f43f5e', backgroundColor: '#3f1d2b' },
  slotBtnText: { color: '#fff', fontSize: 13 },
  pairBtn: {
    flex: 1,
    minWidth: 100,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#17171d',
    borderWidth: 1,
    borderColor: '#2a2a35',
    alignItems: 'center',
  },
  pairBtnPositive: { borderColor: '#22c55e', backgroundColor: '#14532d' },
  pairBtnNegative: { borderColor: '#ef4444', backgroundColor: '#450a0a' },
  pairBtnText: { color: '#fff', fontWeight: '600' },
  numberGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  numberCell: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#17171d',
    borderWidth: 1,
    borderColor: '#2a2a35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberCellSelected: { borderColor: '#f43f5e', backgroundColor: '#3f1d2b' },
  numberText: { color: '#fff', fontWeight: '700' },
  error: { color: '#fca5a5', textAlign: 'center' },
  submit: {
    marginTop: 8,
    backgroundColor: '#f43f5e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
})
