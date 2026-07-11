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
import { isImportClaimMode } from '@fateround/shared/participant-mode'
import {
  finalResultsAutoRevealSeconds,
  ROUND_RESULTS_AUTO_ADVANCE_SECONDS,
  roundResultsWaitMessage,
} from '@fateround/shared/round-timing'
import { playerIsViewer } from '@fateround/shared/viewers'
import { JoinScreen } from '@/components/JoinScreen'
import { ParticipantClaimJoinScreen } from '@/components/join/ParticipantClaimJoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { PlayerQuestionSubmit, lobbyAllowsPlayerQuestions } from '@/components/games/lobby/PlayerQuestionSubmit'
import { PlayerNameSubmit, lobbyAllowsPlayerNames } from '@/components/games/lobby/PlayerNameSubmit'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { ParticipantPhotoCard } from '@/components/games/poll/ParticipantPhotoCard'
import { PollRoundResults } from '@/components/games/poll/PollRoundResults'
import { ParticipantAvatar } from '@/components/ui/ParticipantAvatar'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import { useRoundTimer } from '@/hooks/useRoundTimer'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postVote } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { PARTICIPANT_SELECT, ROUND_SELECT, VOTE_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { mltVoteLeaderboard } from '@/lib/finish-leaderboards'
import { tallyWstScores, wstLeaderboard } from '@/lib/wst-standings'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

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
  const styles = useThemedStyles(makeStyles)

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
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

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

  const me = bootstrap.myPlayerId
    ? bootstrap.players.find((p) => p.id === bootstrap.myPlayerId)
    : undefined
  const isViewer = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))

  const showingRoundResults =
    bootstrap.screen === 'playing' &&
    bootstrap.game?.status === 'active' &&
    currentRound?.status === 'finished'

  const isLastRound =
    !!currentRound &&
    !!bootstrap.game &&
    (currentRound.round_number ?? 0) >= (bootstrap.game.rounds_count ?? 0)

  const nextRoundCountdown = useDeadlineCountdown(
    currentRound?.ended_at,
    isLastRound
      ? finalResultsAutoRevealSeconds(bootstrap.game?.game_type)
      : ROUND_RESULTS_AUTO_ADVANCE_SECONDS,
    showingRoundResults
  )

  const voteTimerActive =
    bootstrap.screen === 'playing' &&
    !isViewer &&
    currentRound?.status === 'active' &&
    !myVote

  const timeLeft = useRoundTimer({
    game: bootstrap.game,
    currentRound: voteTimerActive ? currentRound : null,
    active: voteTimerActive,
    onExpire: () => {},
  })

  const updateParticipantPhoto = useCallback((participantId: string, photoUrl: string | null) => {
    setPollState((prev) => ({
      ...prev,
      participants: prev.participants.map((p) =>
        p.id === participantId ? { ...p, photo_url: photoUrl } : p
      ),
    }))
  }, [])

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
    if (isImportClaimMode(bootstrap.game)) {
      return (
        <ParticipantClaimJoinScreen
          gameCode={bootstrap.code}
          game={bootstrap.game}
          participants={pollState.participants}
          players={bootstrap.players}
          joining={bootstrap.joining}
          error={bootstrap.error}
          hint="Select your name from the list"
          onJoin={(participantId, name) => void bootstrap.join(name, { participantId })}
        />
      )
    }
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
    const myParticipant =
      me?.participant_id != null
        ? pollState.participants.find((p) => p.id === me.participant_id)
        : null
    const hasSession = !!bootstrap.game && !!bootstrap.myPlayerId && !!bootstrap.myResumeToken
    const canSubmitQuestions = hasSession && lobbyAllowsPlayerQuestions(bootstrap.game!)
    const canSubmitNames = hasSession && lobbyAllowsPlayerNames(bootstrap.game!)
    return (
      <LobbyView
        {...lobbyProps!}
        onLeft={onLeft}
        activity={
          <>
            {me?.participant_id ? (
              <ParticipantPhotoCard
                gameCode={bootstrap.code}
                participantId={me.participant_id}
                participant={myParticipant}
                onPhotoUpdated={updateParticipantPhoto}
              />
            ) : null}
            {canSubmitQuestions && gameType ? (
              <PlayerQuestionSubmit
                gameCode={bootstrap.code}
                gameType={gameType}
                playerId={bootstrap.myPlayerId!}
                resumeToken={bootstrap.myResumeToken!}
              />
            ) : null}
            {canSubmitNames ? (
              <PlayerNameSubmit
                gameCode={bootstrap.code}
                playerId={bootstrap.myPlayerId!}
                resumeToken={bootstrap.myResumeToken!}
                genderBased={bootstrap.game?.gender_based === true}
              />
            ) : null}
          </>
        }
      />
    )
  }
  if (!bootstrap.game || !gameType) return <GameLoading />

  const title = pollGameLabel(gameType)

  if (bootstrap.screen === 'finished') {
    if (isWhoSaidThis(gameType)) {
      const scores = tallyWstScores(pollState.rounds, pollState.votes, bootstrap.players)
      const top = scores[0]
      const winnerId = top && top.correctGuesses > 0 ? top.playerId : null
      return (
        <GameShell bootstrap={bootstrap} title={title} subtitle={bootstrap.code}>
          <GameFinishPanel
            bootstrap={bootstrap}
            title={winnerId ? `${top!.name} wins!` : 'Game over'}
            subtitle="Best guessers"
            leaderboard={wstLeaderboard(scores, bootstrap.myPlayerId)}
            winnerPlayerId={winnerId}
          />
        </GameShell>
      )
    }
    const leaderboard = isMostLikelyTo(gameType)
      ? mltVoteLeaderboard(pollState.votes, pollState.participants)
      : undefined
    const top = leaderboard?.[0]
    return (
      <GameShell bootstrap={bootstrap} title={title} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title="Game over"
          subtitle="Final results"
          detail={
            top && top.score !== 0 && top.score !== '0'
              ? `${top.name} — ${top.score} votes`
              : 'Thanks for playing!'
          }
          leaderboard={leaderboard && leaderboard.length > 0 ? leaderboard : undefined}
        />
      </GameShell>
    )
  }

  const panPool = isPickANumber(gameType) ? parsePickANumberPool(bootstrap.game.custom_questions) : []
  const panUsed = panUsedNumbersFromVotes(pollState.votes, currentRound?.id)
  const panAvailable = panAvailableNumbers(panPool.length, panUsed)

  if (showingRoundResults && currentRound && gameType) {
    const waitMessage = roundResultsWaitMessage({
      isLastRound,
      autoReveal: true,
      nextRoundSecondsLeft: isLastRound ? 0 : nextRoundCountdown,
      finalRevealSecondsLeft: isLastRound ? nextRoundCountdown : undefined,
    })
    return (
      <GameShell bootstrap={bootstrap} title={title} subtitle={`Round ${currentRound.round_number} results`}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <PollRoundResults
            game={bootstrap.game}
            gameType={gameType}
            round={currentRound}
            participants={pollState.participants}
            votes={pollState.votes}
            players={bootstrap.players}
          />
          <Text style={styles.waiting}>{waitMessage}</Text>
        </ScrollView>
      </GameShell>
    )
  }

  return (
    <GameShell
      title={title}
      subtitle={`Round ${currentRound?.round_number ?? '—'}`}
      gameCode={bootstrap.code}
      game={bootstrap.game}
      players={bootstrap.players}
      myPlayerId={bootstrap.myPlayerId}
      onPromoted={() => bootstrap.load()}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {voteTimerActive && timeLeft > 0 ? (
          <View style={styles.timerRow}>
            <TimerBadge seconds={timeLeft} />
          </View>
        ) : null}
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
                  {mltVoteTargets(bootstrap.game, bootstrap.players, pollState.participants).map((target) => {
                    const photoUrl =
                      target.kind === 'participant'
                        ? pollState.participants.find((p) => p.id === target.id)?.photo_url
                        : null
                    return (
                      <Pressable
                        key={target.id}
                        style={[styles.mltRow, targetId === target.id && styles.mltRowSelected]}
                        disabled={submitting}
                        onPress={() => setTargetId(target.id)}
                      >
                        <ParticipantAvatar name={target.name} photoUrl={photoUrl} size={36} />
                        <Text style={styles.choiceText}>{target.name}</Text>
                      </Pressable>
                    )
                  })}
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
  const styles = useThemedStyles(makeStyles)
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

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  scroll: { paddingBottom: 32, gap: 12 },
  timerRow: { alignItems: 'center', marginBottom: 4 },
  waiting: { color: theme.textMuted, fontSize: 16, textAlign: 'center', marginTop: 24 },
  locked: { color: '#86efac', fontSize: 16, textAlign: 'center', marginTop: 24 },
  prompt: { color: theme.text, fontSize: 18, fontWeight: '700', lineHeight: 26 },
  quote: { color: '#e5e7eb', fontSize: 18, fontStyle: 'italic', lineHeight: 26 },
  revealed: { color: '#fcd34d', fontSize: 16, lineHeight: 24, marginTop: 8 },
  choices: { gap: 10 },
  choice: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  choiceSelected: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
  choiceText: { color: theme.text, fontSize: 16 },
  mltRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  mltRowSelected: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
  personRow: { gap: 8, marginTop: 4 },
  personName: { color: theme.text, fontSize: 16, fontWeight: '600' },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  slotBtnSelected: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
  slotBtnText: { color: theme.text, fontSize: 13 },
  pairBtn: {
    flex: 1,
    minWidth: 100,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
  },
  pairBtnPositive: { borderColor: '#22c55e', backgroundColor: '#14532d' },
  pairBtnNegative: { borderColor: '#ef4444', backgroundColor: '#450a0a' },
  pairBtnText: { color: theme.text, fontWeight: '600' },
  numberGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  numberCell: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberCellSelected: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
  numberText: { color: theme.text, fontWeight: '700' },
  error: { color: '#fca5a5', textAlign: 'center' },
  submit: {
    marginTop: 8,
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.45 },
  // white on the solid rose submit button — intentional
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
})
