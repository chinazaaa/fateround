import { useCallback, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  type Game,
  type Participant,
  type Player,
  type Round,
  type Vote,
  type VoteSlot,
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
  isThisOrThat,
  isThreeChoiceGame,
  isWhoSaidThis,
  mltVoteTargets,
  panAvailableNumbers,
  panUsedNumbersFromVotes,
  parseGameType,
  parsePairVoteMode,
  parsePickANumberPool,
  pollGameLabel,
  roundParticipants,
  voteSlots,
} from '@fateround/shared/poll-games'
import { isImportClaimMode } from '@fateround/shared/participant-mode'
import { hotSeatPlayerDisplayName } from '@fateround/shared/hot-seat'
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import { LateJoinChoiceScreen } from '@/components/lifecycle/LateJoinChoiceScreen'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { JoinScreen } from '@/components/JoinScreen'
import { ParticipantClaimJoinScreen } from '@/components/join/ParticipantClaimJoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { PlayerQuestionSubmit, lobbyAllowsPlayerQuestions } from '@/components/games/lobby/PlayerQuestionSubmit'
import { PlayerNameSubmit, lobbyAllowsPlayerNames } from '@/components/games/lobby/PlayerNameSubmit'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { ParticipantPhotoCard } from '@/components/games/poll/ParticipantPhotoCard'
import { ParticipantVoteCard } from '@/components/games/poll/ParticipantVoteCard'
import { NameSearchPicker } from '@/components/games/poll/NameSearchPicker'
import { PollParticipantGallery } from '@/components/games/poll/PollParticipantGallery'
import { PollSpectatorReady } from '@/components/games/poll/PollSpectatorReady'
import { PollRoundResults } from '@/components/games/poll/PollRoundResults'
import { PollMyVoteRecap } from '@/components/games/poll/PollMyVoteRecap'
import { PollReactionBar } from '@/components/games/poll/PollReactionBar'
import { PollAchievements } from '@/components/games/poll/PollAchievements'
import { computePollAchievements } from '@/components/games/poll/poll-achievements'
import { PollGenderJoinScreen } from '@/components/games/poll/PollGenderJoinScreen'
import { WstQuotePool } from '@/components/games/poll/WstQuotePool'
import { ConfessionInput } from '@/components/games/poll/ConfessionInput'
import { ConfessionsTicker } from '@/components/games/poll/ConfessionsTicker'
import { PollFinalRounds } from '@/components/games/poll/PollFinalRounds'
import {
  FinalGenderBreakdown,
  FinalGenderLeaderboards,
  FinalOverallBreakdown,
  FinalOverallLeaderboards,
} from '@/components/games/poll/PollFinalLeaderboards'
import type { Confession } from '@/components/games/poll/poll-types'
import {
  activeVoteBanner,
  canPlayerVoteInRound,
  effectivePlayerGender,
  getRoundParticipantGender,
  isGameGenderBased,
  isGenderFreeVoting,
  roundVoterLabel,
  spectatorMessage,
} from '@/components/games/poll/gender'
import { ParticipantAvatar } from '@/components/ui/ParticipantAvatar'
import { RoundTimerBadge } from '@/components/party/RoundTimerBadge'
import { RoundResultsWaitText } from '@/components/party/RoundResultsWaitText'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postVote } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { PARTICIPANT_SELECT, ROUND_SELECT, VOTE_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { mltVoteLeaderboard } from '@/lib/finish-leaderboards'
import { tallyWstScores, wstLeaderboard } from '@/lib/wst-standings'
import { LeaderboardPanel } from '@/components/ui/LeaderboardPanel'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Screen =
  | 'loading'
  | 'join'
  | 'late_join_choice'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'playing'
  | 'finished'
  | 'not_found'

type PollState = {
  rounds: Round[]
  participants: Participant[]
  votes: Vote[]
  confessions: Confession[]
}

export function PollPlayerView({ gameCode }: { gameCode: string }) {
  const [pollState, setPollState] = useState<PollState>({ rounds: [], participants: [], votes: [], confessions: [] })
  const [wyrChoice, setWyrChoice] = useState<WyrChoice | null>(null)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [animeChoice, setAnimeChoice] = useState<string | null>(null)
  const [pickedNumber, setPickedNumber] = useState<number | null>(null)
  const [assignment, setAssignment] = useState<VoteAssignment>(emptyAssignment())
  const [pairAssignment, setPairAssignment] = useState<PairAssignmentMap>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Latest picker auto-submit handler, invoked by the round timer's onExpire.
  const autoSubmitPickerRef = useRef<() => void>(() => {})
  const styles = useThemedStyles(makeStyles)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: PollState; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      const [roundsRes, participantsRes, votesRes, confessionsRes] = await Promise.all([
        getSupabase().from('rounds').select(ROUND_SELECT).eq('game_id', code).order('round_number'),
        getSupabase().from('participants').select(PARTICIPANT_SELECT).eq('game_id', code).order('display_order'),
        getSupabase().from('votes').select(VOTE_SELECT).eq('game_id', code),
        getSupabase().from('confessions').select('*').eq('game_id', code).order('created_at'),
      ])
      if (roundsRes.error || participantsRes.error || votesRes.error) {
        return { state: { rounds: [], participants: [], votes: [], confessions: [] }, ok: false }
      }
      const state: PollState = {
        rounds: (roundsRes.data as Round[]) ?? [],
        participants: (participantsRes.data as Participant[]) ?? [],
        votes: (votesRes.data as Vote[]) ?? [],
        confessions: (confessionsRes.data as Confession[]) ?? [],
      }
      setPollState(state)
      return { state, ok: true }
    },
    [gameCode]
  )

  const computeScreen = useCallback((game: Game, playerId: string | null): Screen => {
    if (!playerId) {
      const pre = preJoinScreen(game, false)
      if (pre === 'game_ended') return 'game_ended'
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'late_join_choice') return 'late_join_choice'
      return 'join'
    }
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
  const lateJoin = useLateJoinContext(gameCode, bootstrap.game, bootstrap.screen === 'late_join_choice')

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'rounds', 'participants', 'votes', 'confessions'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const gameType = bootstrap.game ? parseGameType(bootstrap.game.game_type) : null

  const currentRound = useMemo(() => {
    if (!bootstrap.game) return null
    const byPointer = pollState.rounds.find((r) => r.round_number === bootstrap.game!.current_round_number) ?? null
    const active = pollState.rounds.find((r) => r.status === 'active') ?? null
    if (active && byPointer && active.id !== byPointer.id && byPointer.status === 'finished') return active
    return byPointer ?? active
  }, [bootstrap.game, pollState.rounds])

  const myVote = useMemo(() => {
    if (!bootstrap.myPlayerId || !currentRound) return undefined
    return pollState.votes.find((v) => v.player_id === bootstrap.myPlayerId && v.round_id === currentRound.id)
  }, [bootstrap.myPlayerId, currentRound, pollState.votes])

  const roundIds = currentRound?.participant_ids ?? []
  const roundPeople = useMemo(
    () => roundParticipants(roundIds, pollState.participants),
    [roundIds, pollState.participants]
  )

  const me = bootstrap.myPlayerId ? bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) : undefined
  const isViewer = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))

  const showingRoundResults =
    bootstrap.screen === 'playing' && bootstrap.game?.status === 'active' && currentRound?.status === 'finished'

  const isLastRound =
    !!currentRound && !!bootstrap.game && (currentRound.round_number ?? 0) >= (bootstrap.game.rounds_count ?? 0)

  const voteTimerActive = bootstrap.screen === 'playing' && !isViewer && currentRound?.status === 'active' && !myVote

  const updateParticipantPhoto = useCallback((participantId: string, photoUrl: string | null) => {
    setPollState((prev) => ({
      ...prev,
      participants: prev.participants.map((p) => (p.id === participantId ? { ...p, photo_url: photoUrl } : p)),
    }))
  }, [])

  const pairMode = parsePairVoteMode(bootstrap.game?.pair_vote_mode)

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
        body = target?.kind === 'participant' ? { targetParticipantId: targetId } : { targetPlayerId: targetId }
      } else if (isWhoSaidThis(gameType)) {
        body = currentRound.anime_metadata ? { animeChoice } : { targetParticipantId: targetId }
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

      await postVote(bootstrap.code, bootstrap.myResumeToken, currentRound.id, body)
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
  if (bootstrap.screen === 'game_ended') return <GameEndedScreen game={bootstrap.game} />
  if (bootstrap.screen === 'game_started_waiting' && bootstrap.game) {
    return (
      <GameStartedWaitingScreen
        gameCode={bootstrap.code}
        game={bootstrap.game}
        onLobbyOpen={() => void bootstrap.load()}
      />
    )
  }
  if (bootstrap.screen === 'late_join_choice' && bootstrap.game) {
    return (
      <LateJoinChoiceScreen
        gameCode={bootstrap.code}
        game={bootstrap.game}
        context={lateJoin.context}
        contextLoading={lateJoin.loading}
        nameInput={bootstrap.joinName}
        onNameChange={bootstrap.setJoinName}
        joining={bootstrap.joining}
        error={bootstrap.error}
        onJoinAsViewer={() => void bootstrap.join(undefined, { joinAsViewer: true })}
        onJoinAsPlayer={() => void bootstrap.join(undefined, { joinAsViewer: false })}
      />
    )
  }
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
    if (isGameGenderBased(bootstrap.game)) {
      return (
        <PollGenderJoinScreen
          gameCode={bootstrap.code}
          joinName={bootstrap.joinName}
          joining={bootstrap.joining}
          error={bootstrap.error}
          onChangeName={bootstrap.setJoinName}
          onJoin={(gender, identityGender, pollGender) =>
            void bootstrap.join(bootstrap.joinName, { gender, identityGender, pollGender })
          }
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
        hint={
          isWhoSaidThis(bootstrap.game.game_type)
            ? 'Enter your name to join — answer the quotes, fastest correct wins.'
            : undefined
        }
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    const myParticipant =
      me?.participant_id != null ? pollState.participants.find((p) => p.id === me.participant_id) : null
    const hasSession = !!bootstrap.game && !!bootstrap.myPlayerId && !!bootstrap.myResumeToken
    const canSubmitQuestions = hasSession && lobbyAllowsPlayerQuestions(bootstrap.game!)
    const canSubmitNames = hasSession && lobbyAllowsPlayerNames(bootstrap.game!)
    return (
      <LobbyView
        {...lobbyProps!}
        onLeft={onLeft}
        activity={
          <>
            {me?.spectator === true && bootstrap.myResumeToken ? (
              <PollSpectatorReady
                gameCode={bootstrap.code}
                resumeToken={bootstrap.myResumeToken}
                onReady={() => bootstrap.load()}
              />
            ) : null}
            {me?.participant_id ? (
              <ParticipantPhotoCard
                gameCode={bootstrap.code}
                participantId={me.participant_id}
                participant={myParticipant}
                onPhotoUpdated={updateParticipantPhoto}
              />
            ) : null}
            {gameType && (isThreeChoiceGame(gameType) || isBinaryPeoplePollGame(gameType)) ? (
              <PollParticipantGallery participants={pollState.participants} />
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
            {hasSession && gameType && isWhoSaidThis(gameType) ? (
              <WstQuotePool
                gameCode={bootstrap.code}
                resumeToken={bootstrap.myResumeToken!}
                myPlayerId={bootstrap.myPlayerId!}
                deckMode={bootstrap.game?.wst_quote_source === 'deck'}
                canSubmit={!!me && me.spectator !== true}
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
    const isPeoplePoll = isThreeChoiceGame(gameType) || isBinaryPeoplePollGame(gameType)
    const genderBoards = isPeoplePoll && isGameGenderBased(bootstrap.game)
    const overallBoards = isPeoplePoll && isGenderFreeVoting(bootstrap.game)

    let panel: React.ReactNode
    if (isWhoSaidThis(gameType)) {
      const scores = tallyWstScores(pollState.rounds, pollState.votes, bootstrap.players)
      const top = scores[0]
      const winnerId = top && top.points > 0 ? top.playerId : null
      panel = (
        <GameFinishPanel
          bootstrap={bootstrap}
          title={winnerId ? `${top!.name} wins!` : 'Game over'}
          subtitle="Leaderboard"
          leaderboard={wstLeaderboard(scores, bootstrap.myPlayerId)}
          winnerPlayerId={winnerId}
        />
      )
    } else {
      const leaderboard = isMostLikelyTo(gameType)
        ? mltVoteLeaderboard(pollState.votes, pollState.participants)
        : undefined
      const top = leaderboard?.[0]
      panel = (
        <GameFinishPanel
          bootstrap={bootstrap}
          title="Game over"
          subtitle="Final results"
          detail={
            top && top.score !== 0 && top.score !== '0' ? `${top.name} — ${top.score} votes` : 'Thanks for playing!'
          }
          leaderboard={leaderboard && leaderboard.length > 0 ? leaderboard : undefined}
        />
      )
    }

    const achievements = computePollAchievements(
      bootstrap.game,
      pollState.participants,
      pollState.rounds,
      pollState.votes,
      bootstrap.players
    )

    return (
      <GameShell bootstrap={bootstrap} title={title} subtitle={bootstrap.code}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {panel}
          <PollAchievements achievements={achievements} />
          {genderBoards ? (
            <FinalGenderLeaderboards
              gameType={gameType}
              participants={pollState.participants}
              rounds={pollState.rounds}
              votes={pollState.votes}
            />
          ) : null}
          {overallBoards ? (
            <FinalOverallLeaderboards
              gameType={gameType}
              participants={pollState.participants}
              rounds={pollState.rounds}
              votes={pollState.votes}
            />
          ) : null}
          {genderBoards ? (
            <FinalGenderBreakdown
              gameType={gameType}
              participants={pollState.participants}
              rounds={pollState.rounds}
              votes={pollState.votes}
            />
          ) : null}
          {overallBoards ? (
            <FinalOverallBreakdown
              gameType={gameType}
              participants={pollState.participants}
              rounds={pollState.rounds}
              votes={pollState.votes}
            />
          ) : null}
          <PollFinalRounds
            game={bootstrap.game}
            gameType={gameType}
            rounds={pollState.rounds}
            participants={pollState.participants}
            votes={pollState.votes}
            players={bootstrap.players}
            myPlayerId={bootstrap.myPlayerId}
          />
          {pollState.confessions.length > 0 ? (
            <ConfessionsTicker confessions={pollState.confessions} title="🔥 All Hot Takes" />
          ) : null}
        </ScrollView>
      </GameShell>
    )
  }

  const panPool = isPickANumber(gameType) ? parsePickANumberPool(bootstrap.game.custom_questions) : []
  const panUsed = panUsedNumbersFromVotes(pollState.votes, currentRound?.id)
  const panAvailable = panAvailableNumbers(panPool.length, panUsed)

  // Pick a Number — only the round's designated picker chooses; the list stays hidden.
  const isPan = isPickANumber(gameType)
  const pickerId = currentRound?.submitter_player_id ?? null
  const isPicker = !!bootstrap.myPlayerId && bootstrap.myPlayerId === pickerId
  const pickerName = hotSeatPlayerDisplayName(pickerId, bootstrap.players, pollState.participants)
  const pickerVote = currentRound
    ? pollState.votes.find((v) => v.round_id === currentRound.id && v.player_id === pickerId)
    : undefined
  const panRevealed = isPan && !!currentRound?.mlt_question?.trim()
  const panPickedNumber = pickerVote?.picked_number ?? null

  // Pick a Number — when the picker's timer runs out, auto-lock a still-available
  // number (their current selection if any, else a random one) so the round can
  // advance. Mirrors the web picker auto-submit. Read only from the timer callback.
  autoSubmitPickerRef.current = () => {
    if (!isPan || !isPicker || myVote || panRevealed || submitting) return
    if (!bootstrap.myResumeToken || !currentRound) return
    const chosen =
      pickedNumber ?? (panAvailable.length > 0 ? panAvailable[Math.floor(Math.random() * panAvailable.length)] : null)
    if (chosen == null) return
    setSubmitting(true)
    setSubmitError(null)
    postVote(bootstrap.code, bootstrap.myResumeToken, currentRound.id, { pickedNumber: chosen })
      .then(() => bootstrap.load())
      .then(() => resetDraft())
      .catch((err) => setSubmitError(err instanceof Error ? err.message : 'Failed to submit vote'))
      .finally(() => setSubmitting(false))
  }

  // Gender-based voting — opposite-gender rounds; `both` votes every round.
  const genderFree = isGenderFreeVoting(bootstrap.game)
  const myPlayerGender = effectivePlayerGender(me, pollState.participants)
  const roundGender = genderFree ? null : getRoundParticipantGender(roundIds, pollState.participants)
  const canVoteThisRound = genderFree || (roundGender !== null && canPlayerVoteInRound(myPlayerGender, roundGender))

  // Who Said This — the quote author sits out; they already know the answer, so
  // they never vote (mirrors web `isSubmitter`).
  const wstSubmitterId = currentRound?.submitter_player_id ?? null
  const isWstSubmitter = isWhoSaidThis(gameType) && !!bootstrap.myPlayerId && bootstrap.myPlayerId === wstSubmitterId
  const wstSubmitterName = hotSeatPlayerDisplayName(wstSubmitterId, bootstrap.players, pollState.participants)

  const roundsCount = bootstrap.game.rounds_count ?? 0
  const roundLabel = currentRound?.round_number
    ? roundsCount > 0
      ? `Round ${currentRound.round_number} / ${roundsCount}`
      : `Round ${currentRound.round_number}`
    : 'Round —'

  // Pair (one-each vs any) hint + submit progress for people-poll voting.
  const pairAssignedCount = roundIds.filter((id) => !!pairAssignment[id]).length
  const smkSlots = voteSlots(gameType)
  const smkAssignedCount = smkSlots.filter((slot) => !!assignment[slot]).length
  const smkTarget = Math.min(smkSlots.length, roundPeople.length)

  // Contextual live-progress label for the shared submit button.
  const submitLabel = (() => {
    if (submitting) return 'Submitting…'
    if (canSubmit) return 'Submit vote ✓'
    if (isThreeChoiceGame(gameType)) return `Assign all ${smkTarget} (${smkAssignedCount}/${smkTarget})`
    if (isBinaryPeoplePollGame(gameType)) {
      const total = roundIds.length
      if (gameType === 'smash_or_pass') return `Pick for both (${pairAssignedCount}/${total})`
      if (gameType === 'red_flag_green_flag') return `Rate both (${pairAssignedCount}/${total})`
      return `Choose for all (${pairAssignedCount}/${total})`
    }
    return 'Submit vote'
  })()

  // Mode hint under the people-poll header (mirrors web one-each / any copy).
  const pairHint = (() => {
    if (!isBinaryPeoplePollGame(gameType) || gameType === 'parent_approval') return null
    const positive = gameType === 'smash_or_pass' ? 'Smash' : 'Green'
    const negative = gameType === 'smash_or_pass' ? 'Pass' : 'Red'
    if (pairMode === 'one_each' && roundIds.length === 2) {
      return `One ${positive} and one ${negative} — tap the other person's choice to swap`
    }
    if (pairMode === 'any' && roundIds.length === 2) {
      return `Any combo — both ${positive}, both ${negative}, or one of each`
    }
    return null
  })()

  // In one-each mode the slot matching the other person's flag is disabled
  // (choosing it would break the one-each rule). Visual feedback only —
  // assignPairSlot still auto-swaps if tapped.
  const pairDisabledSlots = (personId: string): VoteSlot[] => {
    if (pairMode !== 'one_each' || roundIds.length !== 2) return []
    const otherId = roundIds.find((id) => id !== personId)
    if (!otherId) return []
    const otherFlag = pairAssignment[otherId]
    if (otherFlag === 'kiss') return ['kiss']
    if (otherFlag === 'kill') return ['kill']
    return []
  }

  if (showingRoundResults && currentRound && gameType) {
    const autoReveal = (bootstrap.game as { auto_reveal?: boolean | null }).auto_reveal !== false
    const resultsSubtitle =
      roundsCount > 0
        ? `Round ${currentRound.round_number} / ${roundsCount} results`
        : `Round ${currentRound.round_number} results`
    return (
      <GameShell bootstrap={bootstrap} title={title} subtitle={resultsSubtitle}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <PollMyVoteRecap
            game={bootstrap.game}
            gameType={gameType}
            round={currentRound}
            myVote={myVote}
            participants={pollState.participants}
            players={bootstrap.players}
          />
          <PollRoundResults
            game={bootstrap.game}
            gameType={gameType}
            round={currentRound}
            participants={pollState.participants}
            votes={pollState.votes}
            players={bootstrap.players}
            myPlayerId={bootstrap.myPlayerId}
          />
          {/* WST running leaderboard after every question — mirrors trivia's between-round standings. */}
          {isWhoSaidThis(gameType)
            ? (() => {
                const scores = tallyWstScores(pollState.rounds, pollState.votes, bootstrap.players)
                if (scores.length === 0) return null
                return (
                  <LeaderboardPanel
                    title="Leaderboard"
                    rows={scores.map((s, i) => ({
                      id: s.playerId,
                      name: s.name,
                      score: s.points,
                      highlight: i === 0 && s.points > 0 ? true : undefined,
                    }))}
                    highlightId={bootstrap.myPlayerId}
                    scoreSuffix=""
                    embedded
                  />
                )
              })()
            : null}
          {bootstrap.myPlayerId ? <PollReactionBar gameCode={bootstrap.code} playerId={bootstrap.myPlayerId} /> : null}
          {!isViewer && bootstrap.myResumeToken ? (
            <ConfessionInput
              gameCode={bootstrap.code}
              resumeToken={bootstrap.myResumeToken}
              roundId={currentRound.id}
            />
          ) : null}
          <ConfessionsTicker confessions={pollState.confessions.filter((c) => c.round_id === currentRound.id)} />
          <RoundResultsWaitText
            anchorTime={currentRound.ended_at}
            isLastRound={isLastRound}
            autoReveal={autoReveal}
            gameType={bootstrap.game?.game_type}
            active={showingRoundResults}
            style={styles.waiting}
          />
        </ScrollView>
      </GameShell>
    )
  }

  return (
    <GameShell
      title={title}
      subtitle={roundLabel}
      gameCode={bootstrap.code}
      game={bootstrap.game}
      players={bootstrap.players}
      myPlayerId={bootstrap.myPlayerId}
      onPromoted={() => bootstrap.load()}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <RoundTimerBadge
          game={bootstrap.game}
          currentRound={voteTimerActive ? currentRound : null}
          active={voteTimerActive}
          onExpire={() => autoSubmitPickerRef.current()}
          show={!isPan || (isPicker && !panRevealed)}
          containerStyle={styles.timerRow}
        />
        {isViewer ? (
          <Text style={styles.waiting}>You are watching — voting is disabled.</Text>
        ) : isPan ? (
          !currentRound || currentRound.status !== 'active' ? (
            <Text style={styles.waiting}>Waiting for the next round…</Text>
          ) : (
            <View style={styles.panCard}>
              <Text style={styles.panEmoji}>🔢❓</Text>
              <Text style={styles.panKicker}>Picker this round</Text>
              <Text style={styles.panName}>{isPicker ? 'YOU' : pickerName}</Text>
              {panRevealed ? (
                <>
                  <View style={styles.panRevealBox}>
                    {panPickedNumber ? <Text style={styles.panPickedNumber}>#{panPickedNumber}</Text> : null}
                    <Text style={styles.panRevealLabel}>Revealed question</Text>
                    <Text style={styles.panRevealQuestion}>{currentRound.mlt_question}</Text>
                  </View>
                  <View style={styles.answerBanner}>
                    <Text style={styles.answerBannerText}>
                      {isPicker ? 'Your turn — answer out loud!' : `${pickerName} — answer out loud!`}
                    </Text>
                    <Text style={styles.answerBannerSub}>The host will advance when they&apos;re done</Text>
                  </View>
                </>
              ) : isPicker && panPool.length === 0 ? (
                <Text style={styles.waiting}>Could not load the question list — ask the host to advance.</Text>
              ) : isPicker ? (
                <>
                  <Text style={styles.prompt}>Pick a number between 1 and {panPool.length}</Text>
                  <Text style={styles.panHint}>
                    {panUsed.size > 0
                      ? `${panAvailable.length} left — taken picks are greyed out`
                      : 'Questions stay hidden until you choose'}
                  </Text>
                  <View style={styles.numberGrid}>
                    {Array.from({ length: panPool.length }, (_, i) => i + 1).map((n) => {
                      const taken = panUsed.has(n)
                      return (
                        <Pressable
                          key={n}
                          style={[
                            styles.numberCell,
                            pickedNumber === n && styles.numberCellSelected,
                            taken && styles.numberCellTaken,
                          ]}
                          disabled={submitting || taken}
                          onPress={() => setPickedNumber(n)}
                        >
                          <Text style={[styles.numberText, taken && styles.numberTextTaken]}>{n}</Text>
                        </Pressable>
                      )
                    })}
                  </View>
                  {submitError ? <Text style={styles.error}>{submitError}</Text> : null}
                  <Pressable
                    style={[styles.submit, !canSubmit && styles.submitDisabled]}
                    disabled={!canSubmit || submitting}
                    onPress={() => void submitVote()}
                  >
                    <Text style={styles.submitText}>
                      {submitting ? 'Locking in…' : pickedNumber ? `Lock in #${pickedNumber}` : 'Pick a number first'}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.waiting}>Waiting for {pickerName} to pick a number…</Text>
                  <Text style={styles.panHint}>The question list is hidden from everyone</Text>
                </>
              )}
            </View>
          )
        ) : !currentRound || currentRound.status !== 'active' ? (
          <Text style={styles.waiting}>Waiting for the next round…</Text>
        ) : !canVoteThisRound ? (
          <View style={styles.spectatorCard}>
            {roundGender ? <Text style={styles.roundGenderLabel}>{roundVoterLabel(roundGender)}</Text> : null}
            <Text style={styles.waiting}>{spectatorMessage(roundGender, myPlayerGender)}</Text>
          </View>
        ) : myVote ? (
          <Text style={styles.locked}>Vote locked — waiting for results.</Text>
        ) : isWstSubmitter ? (
          <View style={styles.spectatorCard}>
            <Text style={styles.roundGenderLabel}>Your quote this round</Text>
            {currentRound.quote_text ? <Text style={styles.quote}>&quot;{currentRound.quote_text}&quot;</Text> : null}
            <Text style={styles.waiting}>Everyone else is guessing who said it…</Text>
          </View>
        ) : (
          <>
            {!genderFree && activeVoteBanner(myPlayerGender) ? (
              <View style={styles.voteBanner}>
                <Text style={styles.voteBannerText}>{activeVoteBanner(myPlayerGender)}</Text>
              </View>
            ) : null}
            {isNeverHaveIEver(gameType) ? (
              <>
                <Text style={styles.kicker}>Never have I ever…</Text>
                <Text style={styles.prompt}>{currentRound.mlt_question ?? 'this…'}</Text>
                <View style={styles.choices}>
                  <ChoiceButton
                    label="✋ I have"
                    selected={wyrChoice === 'a'}
                    disabled={submitting}
                    onPress={() => setWyrChoice('a')}
                  />
                  <ChoiceButton
                    label="🙅 I haven't"
                    selected={wyrChoice === 'b'}
                    disabled={submitting}
                    onPress={() => setWyrChoice('b')}
                  />
                </View>
              </>
            ) : isBinaryChoiceGame(gameType) ? (
              <>
                <Text style={styles.kicker}>{isThisOrThat(gameType) ? 'This or that…' : 'Would you rather…'}</Text>
                <Text style={styles.prompt}>
                  {currentRound.wyr_option_a && currentRound.wyr_option_b
                    ? `${currentRound.wyr_option_a} or ${currentRound.wyr_option_b}?`
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

            {isMostLikelyTo(gameType)
              ? (() => {
                  const mltTargets = mltVoteTargets(bootstrap.game, bootstrap.players, pollState.participants)
                  const mltSelfId = me?.participant_id ?? bootstrap.myPlayerId ?? null
                  return (
                    <>
                      <Text style={styles.prompt}>{currentRound.mlt_question ?? 'Who is most likely to…?'}</Text>
                      {mltTargets.length > 6 ? (
                        <NameSearchPicker
                          options={mltTargets.map((t) => ({
                            id: t.id,
                            name: t.name,
                            photoUrl:
                              t.kind === 'participant'
                                ? pollState.participants.find((p) => p.id === t.id)?.photo_url
                                : null,
                          }))}
                          valueId={targetId}
                          onChange={setTargetId}
                          disabled={submitting}
                          selfId={mltSelfId}
                        />
                      ) : (
                        <View style={styles.choices}>
                          {mltTargets.map((target) => {
                            const photoUrl =
                              target.kind === 'participant'
                                ? pollState.participants.find((p) => p.id === target.id)?.photo_url
                                : null
                            const isSelf = mltSelfId != null && target.id === mltSelfId
                            return (
                              <Pressable
                                key={target.id}
                                style={[styles.mltRow, targetId === target.id && styles.mltRowSelected]}
                                disabled={submitting}
                                onPress={() => setTargetId(target.id)}
                              >
                                <ParticipantAvatar name={target.name} photoUrl={photoUrl} size={36} />
                                <Text style={styles.choiceText}>
                                  {target.name}
                                  {isSelf ? ' (you)' : ''}
                                </Text>
                              </Pressable>
                            )
                          })}
                        </View>
                      )}
                    </>
                  )
                })()
              : null}

            {isWhoSaidThis(gameType) ? (
              <>
                {(currentRound.anime_metadata as { anime_name?: string } | null)?.anime_name ? (
                  <Text style={styles.animeName}>
                    {(currentRound.anime_metadata as { anime_name?: string }).anime_name}
                  </Text>
                ) : null}
                {currentRound.quote_text ? (
                  <Text style={styles.quote}>&quot;{currentRound.quote_text}&quot;</Text>
                ) : (
                  <Text style={styles.waiting}>Waiting for {wstSubmitterName ?? 'the writer'} to submit a quote…</Text>
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
                ) : currentRound.quote_text ? (
                  roundPeople.length > 6 ? (
                    <NameSearchPicker
                      options={roundPeople.map((p) => ({ id: p.id, name: p.name, photoUrl: p.photo_url }))}
                      valueId={targetId}
                      onChange={setTargetId}
                      disabled={submitting}
                    />
                  ) : (
                    <View style={styles.choices}>
                      {roundPeople.map((person) => (
                        <ChoiceButton
                          key={person.id}
                          label={person.name}
                          selected={targetId === person.id}
                          disabled={submitting}
                          onPress={() => setTargetId(person.id)}
                        />
                      ))}
                    </View>
                  )
                ) : null}
              </>
            ) : null}

            {isThreeChoiceGame(gameType) ? (
              <>
                <Text style={styles.prompt}>Assign Smash, Marry, and Kill</Text>
                <View style={styles.cardGrid}>
                  {roundPeople.map((person) => {
                    const action = (['kiss', 'marry', 'kill'] as const).find((s) => assignment[s] === person.id) ?? null
                    return (
                      <ParticipantVoteCard
                        key={person.id}
                        gameType={gameType}
                        participant={person}
                        slots={voteSlots(gameType)}
                        action={action}
                        onAssign={(slot) => assignSmkSlot(slot, person.id)}
                        disabled={submitting}
                      />
                    )
                  })}
                </View>
              </>
            ) : null}

            {isBinaryPeoplePollGame(gameType) ? (
              <>
                <Text style={styles.prompt}>
                  {gameType === 'parent_approval'
                    ? 'Would you let your son or daughter date or marry this person?'
                    : 'Vote on each person'}
                </Text>
                {pairHint ? <Text style={styles.panHint}>{pairHint}</Text> : null}
                <View style={styles.cardGrid}>
                  {roundPeople.map((person) => {
                    const flag = pairAssignment[person.id]
                    const action: VoteSlot | null = flag === 'kiss' ? 'kiss' : flag === 'kill' ? 'kill' : null
                    return (
                      <ParticipantVoteCard
                        key={person.id}
                        gameType={gameType}
                        participant={person}
                        slots={voteSlots(gameType)}
                        action={action}
                        onAssign={(slot) =>
                          setPairAssignment((prev) =>
                            assignPairSlot(prev, person.id, slot === 'kiss' ? 'kiss' : 'kill', roundIds, pairMode)
                          )
                        }
                        disabled={submitting}
                        disabledSlots={pairDisabledSlots(person.id)}
                      />
                    )
                  })}
                </View>
              </>
            ) : null}

            {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

            <Pressable
              style={[styles.submit, !canSubmit && styles.submitDisabled]}
              disabled={!canSubmit || submitting}
              onPress={() => void submitVote()}
            >
              <Text style={styles.submitText}>{submitLabel}</Text>
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
    <Pressable style={[styles.choice, selected && styles.choiceSelected]} disabled={disabled} onPress={onPress}>
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
    kicker: {
      color: theme.primaryMuted,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    animeName: { color: theme.primaryMuted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
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
    numberCellTaken: { opacity: 0.4 },
    numberText: { color: theme.text, fontWeight: '700' },
    numberTextTaken: { textDecorationLine: 'line-through', color: theme.textFaint },
    panCard: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 18,
      gap: 12,
    },
    panEmoji: { fontSize: 34, textAlign: 'center' },
    panKicker: {
      color: theme.primaryMuted,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      textAlign: 'center',
    },
    panName: { color: theme.text, fontSize: 26, fontWeight: '900', textAlign: 'center' },
    panHint: { color: theme.textFaint, fontSize: 13, textAlign: 'center' },
    panRevealBox: {
      backgroundColor: theme.bg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      gap: 8,
      alignItems: 'center',
    },
    panPickedNumber: { color: theme.primaryMuted, fontSize: 28, fontWeight: '900' },
    panRevealLabel: {
      color: theme.textMuted,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    panRevealQuestion: { color: theme.text, fontSize: 17, fontWeight: '600', textAlign: 'center', lineHeight: 24 },
    answerBanner: {
      backgroundColor: theme.primarySoft,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.primary,
      padding: 14,
      alignItems: 'center',
      gap: 4,
    },
    answerBannerText: { color: theme.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
    answerBannerSub: { color: theme.textMuted, fontSize: 12, textAlign: 'center' },
    spectatorCard: { gap: 8, marginTop: 16, alignItems: 'center' },
    roundGenderLabel: {
      color: theme.primaryMuted,
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'center',
    },
    voteBanner: {
      backgroundColor: theme.primarySoft,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
      alignItems: 'center',
    },
    voteBannerText: { color: theme.primaryMuted, fontSize: 13, fontWeight: '700' },
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
