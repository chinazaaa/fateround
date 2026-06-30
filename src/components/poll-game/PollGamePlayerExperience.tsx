'use client'
import { useRoundResults } from '@/hooks/useRoundResults'
import { useJoinFlow } from '@/hooks/useJoinFlow'
import { useWstQuotePool } from '@/hooks/useWstQuotePool'
import { usePlayerQuestions } from '@/hooks/usePlayerQuestions'
import { usePlayerNameSubmissions } from '@/hooks/usePlayerNameSubmissions'
import { useHotSeat } from '@/hooks/useHotSeat'
import { usePhotoUpload } from '@/hooks/usePhotoUpload'
import { useVoteState } from '@/hooks/useVoteState'
import { useGameSession } from '@/hooks/useGameSession'
import { useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getPlayerSession, filterParticipantsInRounds } from '@/lib/utils'
import { playVoteSubmittedSound } from '@/lib/sounds'
import { hexToRgba } from '@/lib/color'
import { Avatar } from '@/components/Avatar'
import { ParticipantPhotoCard } from '@/components/ParticipantPhotoCard'
import { ParticipantGallery } from '@/components/ParticipantGallery'
import {
  roundGenderLabel,
  playerIdentityLabel,
  genderLabel,
  getRoundParticipantGender,
  canPlayerVoteInRound,
  roundVoterLabel,
  spectatorMessage,
  activeVoteBanner,
  joinGenderHint,
} from '@/lib/participants'
import type { ParticipantGender, PlayerGender } from '@/types'
import {
  tallyRoundVotes,
  tallyWyrVotes,
  tallyMltVotes,
  getCategoryMeta,
  getVoteCategories,
  assignmentEmojiFor,
  myActionBorderClass,
  flagForParticipant,
} from '@/lib/vote-stats'
import {
  gameTypeConfig,
  slotMeta,
  voteSlots,
  isAssignmentComplete,
  assignedCount,
  parseGameType,
  assignmentTargetCount,
  isThreeChoiceGame,
  isPairGame,
  isBinaryPeoplePollGame,
  isUnaryPollGame,
  isWouldYouRather,
  isNeverHaveIEver,
  isPickANumber,
  isThisOrThat,
  isBinaryChoiceGame,
  isMostLikelyTo,
  isWhoSaidThis,
  isNameOnlyPlayerJoin,
  pairAssignedCount,
  pairAssignmentFromVote,
  parsePairVoteMode,
  isPairOneEachMode,
  isPairAssignmentValid,
  pairDisabledSlots,
  isHotSeat,
  isCustomGame,
} from '@/lib/game-types'
import { PLAYER_VIEW_REGISTRY } from '@/components/game-player-views'
import {
  ParticipantRoundResults,
  VoteCountStat,
  WyrRoundResults,
  MltRoundResults,
  WstRoundResults,
  AnimeWstRoundResults,
  HotSeatRoundResults,
} from '@/components/VoteResults'
import {
  FinalGenderLeaderboards,
  FinalGenderBreakdown,
  FinalOverallLeaderboards,
  FinalOverallBreakdown,
} from '@/components/FinalLeaderboard'
import { NameSearchPicker } from '@/components/NameSearchPicker'
import { MltPlayerPicker } from '@/components/MltPlayerPicker'
import { isMltImportGame, mltTargetIdFromVote, mltVoteTargets } from '@/lib/mlt'
import {
  wstVoteTargets,
  wstCorrectNameFromRound,
  wstCorrectParticipantIdFromRound,
  wstSubmitterName,
  tallyWstVotes,
  tallyWstPlayerScores,
  mergeActiveRound,
  dedupeWstPool,
  mergeWstPoolEntry,
  isAnimeRound,
  tallyAnimeWstVotes,
} from '@/lib/who-said-this'
import {
  getCustomSlots,
  getCustomSlotKeys,
  tallyCustomVotes,
  buildCustomLeaderboard,
  isCustomAssignmentValid,
  customAssignmentMode,
  customDisabledSlots,
  assignCustomSlot,
  isCustomOneEachMode,
  isCustomTwoSlotGame,
  customVoteRecapItems,
} from '@/lib/custom-game'
import { isGameGenderBased, isGenderFreeVoting } from '@/lib/gender-based'
import { isImportClaimMode, isVoterOnlyMode } from '@/lib/participant-mode'
import { parseOrSplitQuestion } from '@/lib/custom-questions'
import { lobbyAllowsPlayerQuestions } from '@/lib/player-question-pool'
import {
  isPeoplePollGame,
  lobbyAllowsPlayerNameSubmissions,
  playerNameSubmissionHint,
  playerNameSubmissionPlaceholder,
  playerNameSubmissionPanelTitle,
} from '@/lib/player-participant-pool'
import { CustomVoteCard } from '@/components/CustomVoteCard'
import { CustomRoundResults } from '@/components/CustomRoundResults'
import { ShareResults } from '@/components/ShareResults'
import { FinalResultsShareBlock } from '@/components/FinalResultsShareBlock'
import { AchievementsShareBlock } from '@/components/AchievementsShareBlock'
import { RematchHistory } from '@/components/RematchHistory'
import { computeAchievements } from '@/lib/achievements'
import { RoundResultsShareBlock } from '@/components/RoundResultsShareBlock'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { ConfessionsTicker } from '@/components/ConfessionsTicker'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import { GameLobbySummary } from '@/components/GameLobbySummary'
import ReactionBar from '@/components/ReactionBar'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { PlayerSessionBar } from '@/components/ui/PlayerSessionBar'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { playerIsViewer, allowLatePlayers } from '@/lib/viewers'
import { useAutoSubmit } from '@/hooks/useAutoSubmit'
import { HOT_SEAT_SUBMISSION_TYPES, hotSeatPlayerDisplayName } from '@/lib/hot-seat'
import { pickANumberPoolSize, panRoundRevealed } from '@/lib/pick-a-number'
import { PanRoundResults } from '@/components/game/PanRoundResults'
import { SegmentedControl } from '@/components/ui/CreateWizard'
import {
  finalResultsAutoRevealSeconds,
  roundResultsWaitMessage,
  ROUND_RESULTS_AUTO_ADVANCE_SECONDS,
} from '@/lib/round-timing'
import type {
  Game,
  Participant,
  Player,
  Round,
  Vote,
  VoteAssignment,
  Confession,
  PairAssignmentMap,
  WyrChoice,
  WstQuotePoolEntry,
} from '@/types'
import type { View } from '@/hooks/useGameSession'

export function PollGamePlayerExperience({
  gameCode: gameCodeProp,
  embedded: _embedded = false,
  initialName,
  autoJoinAsViewer,
}: {
  gameCode: string
  embedded?: boolean
  initialName?: string
  autoJoinAsViewer?: boolean
}) {
  const params = useParams<{ code: string }>()
  const router = useRouter()
  const toast = useToast()
  const { confirm } = useConfirm()
  const gameCode = (gameCodeProp ?? (Array.isArray(params.code) ? params.code[0] : params.code)).toUpperCase()

  // ── 1. State containers (no deps on session) ──────────────────────────────
  const {
    lastFinishedRound,
    lastRoundVotes,
    allVotes,
    allRounds,
    allConfessions,
    allHotSeatSubmissions,
    setLastFinishedRound,
    setLastRoundVotes,
    setAllVotes,
    setAllRounds,
    setAllConfessions,
    setAllHotSeatSubmissions,
    resetRoundResultsState,
  } = useRoundResults()

  // Player question submission (WYR/MLT lobby)
  const {
    pqWyrA,
    pqWyrB,
    pqTotText,
    pqMltText,
    pqSubmitting,
    pqList,
    pqOpen,
    setPqWyrA,
    setPqWyrB,
    setPqTotText,
    setPqMltText,
    setPqOpen,
    setPqList,
    setPqSubmitting,
    resetPlayerQuestionsState,
  } = usePlayerQuestions()

  // Player name submission (people poll games — RFGF, SMK, etc.)
  const {
    pnNameInput,
    pnGender,
    pnSubmitting,
    pnList,
    pnOpen,
    setPnNameInput,
    setPnGender,
    setPnSubmitting,
    setPnOpen,
    setPnList,
    resetPlayerNameSubmissionsState,
  } = usePlayerNameSubmissions()

  // ── 2. Auto submit (provides refs) ───────────────────────────────────────
  const customAssignmentsCallbackRef = useRef<((ca: Record<string, string>) => void) | undefined>(undefined)
  const { refs: autoSubmitRefs, triggerAutoSubmit } = useAutoSubmit(gameCode, {
    onCustomAssignmentsChange: (...args) => customAssignmentsCallbackRef.current?.(...args),
  })

  // ── Refs for forward-referenced setters (break circular deps) ───────────
  const resetVoteStateRef = useRef(() => {})
  const resetHotSeatStateRef = useRef(() => {})
  const resetWstQuoteStateRef = useRef(() => {})
  const resetJoinStateRef = useRef(() => {})
  const setWstPoolRef = useRef<React.Dispatch<React.SetStateAction<WstQuotePoolEntry[]>>>(() => {})
  const fetchWstPoolRef = useRef<() => Promise<WstQuotePoolEntry[]>>(() => Promise.resolve([]))
  const setQuoteInputRef = useRef<React.Dispatch<React.SetStateAction<string>>>(() => {})
  const setQuoteAuthorParticipantIdRef = useRef<React.Dispatch<React.SetStateAction<string | null>>>(() => {})
  const setWyrChoiceRef = useRef<React.Dispatch<React.SetStateAction<WyrChoice | null>>>(() => {})
  const setPickedNumberRef = useRef<React.Dispatch<React.SetStateAction<number | null>>>(() => {})
  const setMltTargetPlayerIdRef = useRef<React.Dispatch<React.SetStateAction<string | null>>>(() => {})
  const setPairAssignmentRef = useRef<React.Dispatch<React.SetStateAction<PairAssignmentMap>>>(() => {})
  const setAssignmentRef = useRef<React.Dispatch<React.SetStateAction<VoteAssignment>>>(() => {})
  const setSubmittedRef = useRef<React.Dispatch<React.SetStateAction<boolean>>>(() => {})

  // ── 3. Core session (the new hook) ───────────────────────────────────────
  const session = useGameSession({
    gameCode,
    resetVoteStateRef,
    resetHotSeatStateRef,
    resetRoundResultsState,
    resetWstQuoteStateRef,
    resetJoinStateRef,
    setLastFinishedRound,
    setLastRoundVotes,
    setAllVotes,
    setAllRounds,
    setAllConfessions,
    setAllHotSeatSubmissions,
    setWstPool: (action) => setWstPoolRef.current(action),
    fetchWstPool: () => fetchWstPoolRef.current(),
    setPqList,
    setPnList,
    setWyrChoice: (action) => setWyrChoiceRef.current(action),
    setPickedNumber: (action) => setPickedNumberRef.current(action),
    setMltTargetPlayerId: (action) => setMltTargetPlayerIdRef.current(action),
    setPairAssignment: (action) => setPairAssignmentRef.current(action),
    setAssignment: (action) => setAssignmentRef.current(action),
    setSubmitted: (action) => setSubmittedRef.current(action),
    setQuoteInput: (action) => setQuoteInputRef.current(action),
    setQuoteAuthorParticipantId: (action) => setQuoteAuthorParticipantIdRef.current(action),
    autoSubmitRefs,
    triggerAutoSubmit,
  })

  const {
    view,
    setView,
    game,
    players,
    participants,
    setParticipants,
    currentRound,
    myPlayerId,
    setMyPlayerId,
    myPlayerName,
    setMyPlayerName,
    myPlayerGender,
    setMyPlayerGender,
    applyActiveRound,
    reloadPlayers,
    patchCurrentRound,
    timeLeft,
  } = session

  // ── 4. Hooks that depend on session state ────────────────────────────────
  const {
    hotSeatText,
    hotSeatType,
    hotSeatSubmitted,
    hotSeatSubmissions,
    setHotSeatText,
    setHotSeatType,
    setHotSeatSubmitted,
    setHotSeatSubmissions,
    resetHotSeatState,
  } = useHotSeat({ gameCode, game, view, lastFinishedRound })

  const {
    wstPool,
    quoteInput,
    quoteAuthorParticipantId,
    quoteSubmitting,
    editingQuoteId,
    setWstPool,
    setQuoteInput,
    setQuoteAuthorParticipantId,
    setEditingQuoteId,
    handleSubmitPoolQuote,
    handleDeletePoolQuote,
    fetchWstPool,
    resetWstQuoteState,
  } = useWstQuotePool({ gameCode, myPlayerId })

  const myPlayer = useMemo(() => players.find((p) => p.id === myPlayerId) ?? null, [players, myPlayerId])
  const isViewer = !!(game && myPlayer && playerIsViewer(myPlayer, game))

  const {
    assignment,
    pairAssignment,
    wyrChoice,
    pickedNumber,
    panUsedNumbers,
    mltTargetPlayerId,
    animeChoice,
    customAssignments,
    submitted,
    confessionText,
    confessionSent,
    setAssignment,
    setPairAssignment,
    setWyrChoice,
    setPickedNumber,
    setMltTargetPlayerId,
    setAnimeChoice,
    setCustomAssignments,
    setSubmitted,
    setConfessionText,
    setPanUsedNumbers,
    assign,
    handleSubmit,
    sendConfession,
    resetVoteState,
  } = useVoteState({
    gameCode,
    game,
    currentRound,
    myPlayerId,
    myPlayerGender,
    isViewer,
    view,
    players,
    participants,
    autoSubmitRefs,
    patchCurrentRound,
  })
  customAssignmentsCallbackRef.current = setCustomAssignments

  const {
    nameInput,
    selectedParticipantId,
    joinIdentityGender,
    voteBothGenders,
    joining,
    editingJoin,
    canSubmitJoin,
    useFreeNameJoin,
    joinPlayerGender,
    namePickerOptions,
    joinNeedsGender,
    setNameInput,
    setJoinIdentityGender,
    setVoteBothGenders,
    joinGame,
    openEditJoin,
    cancelEditJoin,
    handlePlayerLeft,
    handlePlayerRenamed,
    handleSelectParticipant,
    resetJoinState,
  } = useJoinFlow({
    gameCode,
    game,
    players,
    participants,
    myPlayerId,
    myPlayerName,
    view,
    setView,
    setMyPlayerId,
    setMyPlayerName,
    setMyPlayerGender,
    setPlayers: session.setPlayers,
    setParticipants,
    applyActiveRound,
    initialName,
    autoJoinAsViewer,
  })

  // ── Sync refs after hooks are called ────────────────────────────────────
  resetVoteStateRef.current = resetVoteState
  resetHotSeatStateRef.current = resetHotSeatState
  resetWstQuoteStateRef.current = resetWstQuoteState
  resetJoinStateRef.current = resetJoinState
  setWstPoolRef.current = setWstPool
  fetchWstPoolRef.current = fetchWstPool
  setQuoteInputRef.current = setQuoteInput
  setQuoteAuthorParticipantIdRef.current = setQuoteAuthorParticipantId
  setWyrChoiceRef.current = setWyrChoice
  setPickedNumberRef.current = setPickedNumber
  setMltTargetPlayerIdRef.current = setMltTargetPlayerId
  setPairAssignmentRef.current = setPairAssignment
  setAssignmentRef.current = setAssignment
  setSubmittedRef.current = setSubmitted

  // ── Derived computed values ──────────────────────────────────────────────
  const roundResultsActive = view === 'round_results' && !!lastFinishedRound
  const roundResultsIsLast = roundResultsActive && (lastFinishedRound?.round_number ?? 0) >= (game?.rounds_count ?? 0)
  const nextRoundCountdown = useDeadlineCountdown(
    lastFinishedRound?.ended_at,
    ROUND_RESULTS_AUTO_ADVANCE_SECONDS,
    roundResultsActive && !roundResultsIsLast
  )
  const finalRevealCountdown = useDeadlineCountdown(
    lastFinishedRound?.ended_at,
    finalResultsAutoRevealSeconds(game?.game_type),
    roundResultsActive && roundResultsIsLast && !!game?.auto_reveal
  )

  const isJoinersMode = game?.participant_mode === 'joiners'
  const isVoterOnly = game ? isVoterOnlyMode(game) : false
  const isImportClaim = game ? isImportClaimMode(game) : false
  const isNameOnlyJoin = isNameOnlyPlayerJoin(game?.game_type)
  const isWstGame = isWhoSaidThis(game?.game_type)
  const isWyrGame = isWouldYouRather(game?.game_type)
  const isTotGame = isThisOrThat(game?.game_type)
  const isNhieGame = isNeverHaveIEver(game?.game_type)
  const isPanGame = isPickANumber(game?.game_type)
  const isBinaryGame = isBinaryChoiceGame(game?.game_type)
  const { context: lateJoinContext, loading: lateJoinContextLoading } = useLateJoinContext(
    gameCode,
    game,
    view === 'late_join_choice'
  )
  const isMltImport = game ? isMltImportGame(game) : false

  // Photo upload (people-based modes)
  const { photoUploading, photoInputRef, handlePhotoUpload, handlePhotoDelete } = usePhotoUpload({
    gameCode,
    participantId: myPlayer?.participant_id ?? null,
    playerId: myPlayerId,
    setParticipants,
  })

  const { context: viewerPromoteContext } = useLateJoinContext(
    gameCode,
    game,
    isViewer && (view === 'round' || view === 'round_results' || view === 'waiting')
  )

  const viewerBanner =
    isViewer && game && myPlayer && myPlayerId ? (
      <ViewerModeBanner
        className="mb-2"
        gameCode={gameCode}
        playerId={myPlayerId}
        game={game}
        player={myPlayer}
        playerDetail={viewerPromoteContext?.playerDetail}
        onPromoted={reloadPlayers}
      />
    ) : null

  const sessionBar =
    myPlayerId && myPlayerName ? (
      <PlayerSessionBar
        gameCode={gameCode}
        playerId={myPlayerId}
        name={myPlayerName}
        viewerBanner={viewerBanner}
        onRenamed={handlePlayerRenamed}
        onLeft={handlePlayerLeft}
        onChangeName={useFreeNameJoin ? undefined : openEditJoin}
        changeNameLabel={isNameOnlyJoin || !joinNeedsGender ? 'Change name' : 'Change name or gender'}
        inLobby={view === 'waiting'}
      />
    ) : viewerBanner ? (
      <div className="mb-4">{viewerBanner}</div>
    ) : null

  // ── Render ────────────────────────────────────────────────────────────────
  if (view === 'loading') return <FullLoader />
  if (view === 'not_found') return <NotFound onHome={() => router.push('/')} />
  if (game) {
    const DedicatedView = PLAYER_VIEW_REGISTRY[parseGameType(game.game_type)]
    // Dedicated views only need `gameCode`: the `initialName` / `autoJoinAsViewer`
    // auto-join (used by tournament "Watch live" links) is owned by useJoinFlow above,
    // which — being a hook — always runs before this early return. So a watcher is
    // already joined as a spectator by the time the dedicated view mounts; it just
    // resolves that session. Don't re-thread those props into dedicated views.
    if (DedicatedView) return <DedicatedView gameCode={gameCode} />
  }

  if (view === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => setView('join')} />
  }

  if (view === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (view === 'late_join_choice' && game) {
    return (
      <LateJoinChoice
        gameCode={gameCode}
        game={game}
        context={lateJoinContext}
        contextLoading={lateJoinContextLoading}
        playersAllowed={allowLatePlayers(game)}
        showNameField={useFreeNameJoin}
        nameInput={nameInput}
        onNameChange={setNameInput}
        joining={joining}
        onJoinAsViewer={() => void joinGame(true)}
        onJoinAsPlayer={() => void joinGame(false)}
      />
    )
  }

  // JOIN
  if (view === 'join') {
    return (
      <CenteredCard>
        <div className="text-center space-y-1">
          <div className="text-4xl">{gameTypeConfig(game?.game_type).headerEmoji}</div>
          <h1 className="text-2xl font-black tracking-tight gradient-title">{game?.title}</h1>
          <GameTypeBadge gameType={game?.game_type} />
          <p className="text-muted text-sm">
            {game?.rounds_count} rounds · {game?.timer_seconds}s each
          </p>
          {game && <GameLobbySummary game={game} className="pt-1" />}
        </div>
        <div className="space-y-4">
          <p className="text-muted font-medium text-center">
            {editingJoin
              ? isNameOnlyJoin || !joinNeedsGender
                ? 'Update your name'
                : 'Update your name or vote preference'
              : isNameOnlyJoin
                ? 'Enter your name to join'
                : isJoinersMode
                  ? 'Join the game — your name goes in the poll'
                  : isVoterOnly
                    ? 'Enter your name to vote — names on the list appear in rounds'
                    : 'Select your name from the list'}
          </p>
          {useFreeNameJoin ? (
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canSubmitJoin && joinGame()}
              placeholder={isVoterOnly ? 'Your name (any name is fine)' : 'Your name'}
              autoFocus
              className={inputCls}
            />
          ) : (
            <NameSearchPicker
              options={namePickerOptions}
              valueId={selectedParticipantId}
              onChange={handleSelectParticipant}
              searchPlaceholder="Search your name…"
              emptyMessage={
                namePickerOptions.length === 0 ? 'All names have been claimed' : 'No names match your search'
              }
            />
          )}
          {!isBinaryChoiceGame(game?.game_type) &&
            !isNeverHaveIEver(game?.game_type) &&
            !isMostLikelyTo(game?.game_type) &&
            !isWhoSaidThis(game?.game_type) && (
              <p className="text-faint text-xs text-center leading-snug">
                You can add a profile picture in the lobby after joining — it shows on voting cards.
              </p>
            )}
          {!joinNeedsGender && isNameOnlyJoin && (
            <p className="text-faint text-xs text-center">
              {isHotSeat(game?.game_type)
                ? 'Claim your name from the list — everyone takes a turn in the hot seat'
                : isMostLikelyTo(game?.game_type)
                  ? 'Vote for who fits each prompt — your choice stays anonymous'
                  : 'Pick between two options each round — your choice stays anonymous'}
            </p>
          )}
          {!joinNeedsGender ? null : (
            <>
              <div>
                <p className="text-faint text-xs mb-2 text-center">I am</p>
                <SegmentedControl
                  value={joinIdentityGender}
                  onChange={setJoinIdentityGender}
                  options={[
                    { value: 'female', label: 'Female' },
                    { value: 'male', label: 'Male' },
                  ]}
                />
              </div>
              <label className="flex items-start gap-3 surface-inset border border-theme rounded-xl px-4 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={voteBothGenders}
                  onChange={(e) => setVoteBothGenders(e.target.checked)}
                  className="mt-0.5 accent-[var(--primary)]"
                />
                <span className="text-sm text-body leading-snug">
                  Vote on both genders
                  <span className="block text-faint text-xs mt-0.5">You'll vote on men's and women's rounds</span>
                </span>
              </label>
              <p className="text-faint text-xs text-center">
                {isNameOnlyJoin
                  ? isVoterOnly
                    ? "Enter any name to join — you'll vote on people from the imported list"
                    : isMostLikelyTo(game?.game_type)
                      ? 'Vote for who fits each prompt — your choice stays anonymous'
                      : 'Pick between two options each round — your choice stays anonymous'
                  : isWstGame
                    ? 'Claim your name, then add quotes to the pool while you wait'
                    : isVoterOnly
                      ? "Enter any name to join — you'll vote on names from the host's list"
                      : joinGenderHint(joinIdentityGender, voteBothGenders, !!isJoinersMode)}
              </p>
            </>
          )}
          <button onClick={() => void joinGame()} disabled={!canSubmitJoin || joining} className={primaryBtnCls}>
            {joining ? (editingJoin ? 'Saving...' : 'Joining...') : editingJoin ? 'Save changes' : 'Join Game'}
          </button>
          {editingJoin ? (
            <button
              type="button"
              onClick={cancelEditJoin}
              className="w-full text-faint text-sm hover:text-body transition-colors"
            >
              Cancel
            </button>
          ) : null}
          {game ? (
            <p className="text-center pt-1">
              <GameRulesLink gameType={game.game_type} variant="subtle" />
            </p>
          ) : null}
        </div>
      </CenteredCard>
    )
  }

  // WAITING
  if (view === 'waiting') {
    const isWst = isWhoSaidThis(game?.game_type)
    const wstTargets = isWst ? wstVoteTargets(participants) : []
    const me = myPlayerId ? players.find((p) => p.id === myPlayerId) : null
    const isSpectatorInLobby = me?.spectator === true
    const myQuotes =
      isWst && myPlayerId
        ? wstPool.filter((e) => e.player_id === myPlayerId).sort((a, b) => a.created_at.localeCompare(b.created_at))
        : []
    const canSubmitPoolQuote = !!me?.participant_id
    const isPeopleMode =
      !isBinaryChoiceGame(game?.game_type) &&
      !isNeverHaveIEver(game?.game_type) &&
      !isMostLikelyTo(game?.game_type) &&
      !isWst &&
      !isVoterOnly
    const myParticipant = me?.participant_id ? participants.find((p) => p.id === me.participant_id) : null
    const canUploadPhoto = isPeopleMode && !!me?.participant_id

    return (
      <CenteredCard>
        <div className="text-center space-y-1">
          <div className="text-4xl">{isSpectatorInLobby ? '🎮' : '⏳'}</div>
          <h1 className="text-2xl font-black tracking-tight gradient-title">{game?.title}</h1>
          <GameTypeBadge gameType={game?.game_type} />
          {game && <GameLobbySummary game={game} />}
          <p className="text-muted text-sm">
            {game?.rounds_count} rounds · {game?.timer_seconds}s each
          </p>
          {isSpectatorInLobby ? (
            <div className="pt-2 space-y-2">
              <p className="text-muted text-sm">Tap below to join the next round</p>
              <button
                type="button"
                className="btn-primary w-full py-3 text-base font-bold"
                onClick={async () => {
                  const resumeToken = getPlayerSession(gameCode)?.resumeToken
                  if (!resumeToken) {
                    toast.error('Your player session expired — rejoin to continue')
                    return
                  }
                  await fetch('/api/players/ready', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gameId: gameCode, resumeToken }),
                  })
                  await reloadPlayers()
                }}
              >
                I&apos;m in — ready to play
              </button>
            </div>
          ) : (
            <p className="text-muted">Waiting for the host to start...</p>
          )}
          {game ? (
            <p>
              <GameRulesLink gameType={game.game_type} variant="subtle" />
            </p>
          ) : null}
        </div>

        {isWst &&
          (game?.wst_quote_source === 'anime' ? (
            <div className="glass-card px-4 py-8 text-center space-y-2">
              <p className="text-body text-lg font-semibold">Anime Quote Mode</p>
              <p className="text-muted text-sm">The host is loading anime quotes — sit tight!</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="surface-inset border border-theme rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-muted text-xs uppercase tracking-wider">Quote pool</p>
                  <span className="text-sm font-bold text-body">{wstPool.length} submitted</span>
                </div>
                <p className="text-faint text-xs">
                  Add as many quotes as you like — each one becomes a round. Pick who said each quote before the host
                  starts.
                </p>
              </div>

              {canSubmitPoolQuote ? (
                <div className="glass-card p-5 space-y-4">
                  {myQuotes.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-faint text-[10px] uppercase tracking-wider">Your quotes ({myQuotes.length})</p>
                      {myQuotes.map((entry) => {
                        const authorName =
                          participants.find((p) => p.id === entry.author_participant_id)?.name ?? 'Unknown'
                        return (
                          <div
                            key={entry.id}
                            className="flex items-start gap-2 rounded-xl border border-theme px-3 py-2"
                          >
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <p className="text-sm text-body-muted line-clamp-2">&ldquo;{entry.quote_text}&rdquo;</p>
                              <p className="text-faint text-[10px]">— {authorName}</p>
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <button
                                type="button"
                                className="text-faint hover:text-body text-xs px-1"
                                disabled={quoteSubmitting}
                                onClick={() => {
                                  setEditingQuoteId(entry.id)
                                  setQuoteInput(entry.quote_text)
                                  setQuoteAuthorParticipantId(entry.author_participant_id)
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="text-faint hover:text-red-400 text-xs px-1"
                                disabled={quoteSubmitting}
                                onClick={() => void handleDeletePoolQuote(entry.id)}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <p className="font-semibold text-body text-center">
                    {editingQuoteId
                      ? 'Edit quote'
                      : myQuotes.length > 0
                        ? 'Add another quote'
                        : 'Add your quote to the pool'}
                  </p>
                  <textarea
                    value={quoteInput}
                    onChange={(e) => setQuoteInput(e.target.value)}
                    placeholder="e.g. Roses are red"
                    maxLength={500}
                    rows={3}
                    className="input-field resize-none"
                    disabled={quoteSubmitting}
                  />
                  <div className="space-y-2">
                    <p className="text-faint text-xs uppercase tracking-wider text-center">Who said this?</p>
                    <NameSearchPicker
                      options={wstTargets.map((p) => ({ id: p.id, name: p.name }))}
                      valueId={quoteAuthorParticipantId}
                      onChange={setQuoteAuthorParticipantId}
                      searchPlaceholder="Search names…"
                      emptyMessage="No names match"
                      disabled={quoteSubmitting}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleSubmitPoolQuote}
                      disabled={!quoteInput.trim() || !quoteAuthorParticipantId || quoteSubmitting}
                      className={
                        quoteInput.trim() && quoteAuthorParticipantId
                          ? 'btn-primary w-full'
                          : 'btn-secondary w-full opacity-60 cursor-not-allowed'
                      }
                    >
                      {quoteSubmitting ? 'Saving…' : editingQuoteId ? 'Save changes' : 'Add to Pool →'}
                    </button>
                    {editingQuoteId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingQuoteId(null)
                          setQuoteInput('')
                          setQuoteAuthorParticipantId(null)
                        }}
                        className="btn-secondary text-sm w-full"
                        disabled={quoteSubmitting}
                      >
                        Cancel edit
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-faint text-xs text-center">Claim your name when joining to submit a quote.</p>
              )}
            </div>
          ))}

        {canUploadPhoto && (
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handlePhotoUpload}
          />
        )}

        <div className="surface-inset border border-theme rounded-2xl p-4 space-y-2">
          <p className="text-muted text-xs uppercase tracking-wider">
            {isVoterOnly ? `Voters joined (${players.length})` : `Players joined (${players.length})`}
          </p>
          {canUploadPhoto && (
            <p className="text-faint text-xs leading-snug">
              Your name is marked <span className="text-[var(--primary)] font-medium">(you)</span> in the list — tap the
              camera icon next to it to add or change your photo.
            </p>
          )}
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {players.map((p) => {
              const isMe = p.name === myPlayerName
              const myPart = isMe ? myParticipant : null
              const hasPhoto = isMe && !!myPart?.photo_url

              return (
                <div key={p.id} className="flex items-center gap-2">
                  {isMe && canUploadPhoto ? (
                    photoUploading ? (
                      <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : hasPhoto ? (
                      <div className="relative shrink-0">
                        <button type="button" onClick={() => photoInputRef.current?.click()} className="block">
                          <Avatar name={p.name} photoUrl={myPart!.photo_url} size="sm" />
                        </button>
                        <button
                          type="button"
                          onClick={handlePhotoDelete}
                          className="absolute -top-1 -right-1 w-4 h-4 min-w-[24px] min-h-[24px] flex items-center justify-center rounded-full bg-red-500/90 text-white text-[10px] leading-none hover:bg-red-400 transition-colors"
                          style={{ padding: 0 }}
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-[var(--surface-inset)] border border-dashed border-[var(--border-strong)] text-faint hover:text-[var(--primary)] hover:border-[var(--primary)] transition-colors"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-3.5 h-3.5"
                        >
                          <path
                            fillRule="evenodd"
                            d="M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm13.5 3a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM10 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    )
                  ) : (
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${isMe ? 'bg-[var(--primary)]' : 'bg-[var(--border-strong)]'}`}
                    />
                  )}
                  <span
                    className={`text-sm flex-1 min-w-0 truncate ${isMe ? 'text-[var(--primary)] font-semibold' : 'text-body-muted'}`}
                  >
                    {p.name}
                    {isMe ? ' (you)' : ''}
                  </span>
                  {!joinNeedsGender ? null : (
                    <span className="text-[10px] uppercase tracking-wider text-faint shrink-0">
                      {playerIdentityLabel(p, participants, game?.game_type)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        {/* Player question submission for WYR / MLT */}
        {game &&
          (isBinaryGame || isNhieGame || isPanGame || isMostLikelyTo(game.game_type)) &&
          lobbyAllowsPlayerQuestions(game) &&
          myPlayerId && (
            <div className="surface-inset border border-theme rounded-2xl p-4 space-y-3">
              <button
                type="button"
                onClick={() => setPqOpen(!pqOpen)}
                className="w-full flex items-center justify-between"
              >
                <p className="text-muted text-xs uppercase tracking-wider">
                  Submit a Question {pqList.length > 0 ? `(${pqList.length})` : ''}
                </p>
                <span className="text-faint text-xs">{pqOpen ? '−' : '+'}</span>
              </button>
              {pqOpen && (
                <div className="space-y-3">
                  {isWyrGame ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Option A"
                        value={pqWyrA}
                        onChange={(e) => setPqWyrA(e.target.value)}
                        maxLength={200}
                        className="input-field text-sm"
                        disabled={pqSubmitting}
                      />
                      <input
                        type="text"
                        placeholder="Option B"
                        value={pqWyrB}
                        onChange={(e) => setPqWyrB(e.target.value)}
                        maxLength={200}
                        className="input-field text-sm"
                        disabled={pqSubmitting}
                      />
                      <button
                        type="button"
                        disabled={!pqWyrA.trim() || !pqWyrB.trim() || pqSubmitting}
                        onClick={async () => {
                          const resumeToken = getPlayerSession(gameCode)?.resumeToken
                          if (!resumeToken) {
                            toast.error('Your player session expired — rejoin to continue')
                            return
                          }
                          setPqSubmitting(true)
                          try {
                            const res = await fetch('/api/player-questions', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                gameId: gameCode,
                                resumeToken,
                                questionType: 'wyr',
                                optionA: pqWyrA.trim(),
                                optionB: pqWyrB.trim(),
                              }),
                            })
                            if (res.ok) {
                              const { question } = await res.json()
                              setPqList((prev) => [...prev, question])
                              setPqWyrA('')
                              setPqWyrB('')
                            } else {
                              const { error } = await res.json()
                              toast.error(error || 'Failed to submit')
                            }
                          } finally {
                            setPqSubmitting(false)
                          }
                        }}
                        className={
                          pqWyrA.trim() && pqWyrB.trim()
                            ? 'btn-primary text-sm w-full'
                            : 'btn-secondary text-sm w-full opacity-60 cursor-not-allowed'
                        }
                      >
                        {pqSubmitting ? 'Submitting...' : 'Add Question'}
                      </button>
                    </div>
                  ) : isTotGame ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Coffee or Tea?"
                        value={pqTotText}
                        onChange={(e) => setPqTotText(e.target.value)}
                        maxLength={200}
                        className="input-field text-sm"
                        disabled={pqSubmitting}
                      />
                      <button
                        type="button"
                        disabled={!pqTotText.trim() || pqSubmitting}
                        onClick={async () => {
                          const parsed = parseOrSplitQuestion(pqTotText)
                          if (!parsed) {
                            toast.error('Use “Coffee or Tea?” format with “ or ” between options')
                            return
                          }
                          const resumeToken = getPlayerSession(gameCode)?.resumeToken
                          if (!resumeToken) {
                            toast.error('Your player session expired — rejoin to continue')
                            return
                          }
                          setPqSubmitting(true)
                          try {
                            const res = await fetch('/api/player-questions', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                gameId: gameCode,
                                resumeToken,
                                questionType: 'wyr',
                                optionA: parsed.optionA,
                                optionB: parsed.optionB,
                              }),
                            })
                            if (res.ok) {
                              const { question } = await res.json()
                              setPqList((prev) => [...prev, question])
                              setPqTotText('')
                            } else {
                              const { error } = await res.json()
                              toast.error(error || 'Failed to submit')
                            }
                          } finally {
                            setPqSubmitting(false)
                          }
                        }}
                        className={
                          pqTotText.trim()
                            ? 'btn-primary text-sm w-full'
                            : 'btn-secondary text-sm w-full opacity-60 cursor-not-allowed'
                        }
                      >
                        {pqSubmitting ? 'Submitting...' : 'Add Question'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Most likely to..."
                        value={pqMltText}
                        onChange={(e) => setPqMltText(e.target.value)}
                        maxLength={200}
                        className="input-field text-sm"
                        disabled={pqSubmitting}
                      />
                      <button
                        type="button"
                        disabled={!pqMltText.trim() || pqSubmitting}
                        onClick={async () => {
                          const resumeToken = getPlayerSession(gameCode)?.resumeToken
                          if (!resumeToken) {
                            toast.error('Your player session expired — rejoin to continue')
                            return
                          }
                          setPqSubmitting(true)
                          try {
                            const res = await fetch('/api/player-questions', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                gameId: gameCode,
                                resumeToken,
                                questionType: 'mlt',
                                questionText: pqMltText.trim(),
                              }),
                            })
                            if (res.ok) {
                              const { question } = await res.json()
                              setPqList((prev) => [...prev, question])
                              setPqMltText('')
                            } else {
                              const { error } = await res.json()
                              toast.error(error || 'Failed to submit')
                            }
                          } finally {
                            setPqSubmitting(false)
                          }
                        }}
                        className={
                          pqMltText.trim()
                            ? 'btn-primary text-sm w-full'
                            : 'btn-secondary text-sm w-full opacity-60 cursor-not-allowed'
                        }
                      >
                        {pqSubmitting ? 'Submitting...' : 'Add Question'}
                      </button>
                    </div>
                  )}
                  {pqList.filter((q) => q.player_id === myPlayerId).length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-theme">
                      <p className="text-faint text-[10px] uppercase tracking-wider">Your questions</p>
                      {pqList
                        .filter((q) => q.player_id === myPlayerId)
                        .map((q) => (
                          <div key={q.id} className="flex items-start gap-2 text-sm">
                            <span className="flex-1 min-w-0 text-body-muted">
                              {q.question_type === 'wyr' ? `${q.option_a} vs ${q.option_b}` : q.question_text}
                            </span>
                            <button
                              type="button"
                              className="text-faint hover:text-red-400 text-xs shrink-0"
                              onClick={async () => {
                                const resumeToken = getPlayerSession(gameCode)?.resumeToken
                                if (!resumeToken) {
                                  toast.error('Your player session expired — rejoin to continue')
                                  return
                                }
                                await fetch('/api/player-questions', {
                                  method: 'DELETE',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ questionId: q.id, resumeToken }),
                                })
                                setPqList((prev) => prev.filter((x) => x.id !== q.id))
                              }}
                            >
                              x
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                  {pqList.length > 0 && (
                    <p className="text-faint text-[10px] text-center">
                      {pqList.length} question{pqList.length === 1 ? '' : 's'} submitted by all players
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

        {/* Player name submission for people poll games (RFGF, SMK, etc.) */}
        {game && isPeoplePollGame(game.game_type) && lobbyAllowsPlayerNameSubmissions(game) && myPlayerId && (
          <div className="surface-inset border border-theme rounded-2xl p-4 space-y-3">
            <button
              type="button"
              onClick={() => setPnOpen(!pnOpen)}
              className="w-full flex items-center justify-between"
            >
              <p className="text-muted text-xs uppercase tracking-wider">
                {playerNameSubmissionPanelTitle()} {pnList.length > 0 ? `(${pnList.length})` : ''}
              </p>
              <span className="text-faint text-xs">{pnOpen ? '−' : '+'}</span>
            </button>
            {pnOpen && (
              <div className="space-y-3">
                <p className="text-faint text-xs leading-relaxed">{playerNameSubmissionHint()}</p>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder={playerNameSubmissionPlaceholder()}
                    value={pnNameInput}
                    onChange={(e) => setPnNameInput(e.target.value)}
                    maxLength={50}
                    className="input-field text-sm"
                    disabled={pnSubmitting}
                  />
                  {joinNeedsGender && (
                    <SegmentedControl
                      value={pnGender}
                      onChange={(v) => setPnGender(v as ParticipantGender)}
                      options={[
                        { value: 'female', label: 'Female' },
                        { value: 'male', label: 'Male' },
                      ]}
                    />
                  )}
                  <button
                    type="button"
                    disabled={!pnNameInput.trim() || pnSubmitting}
                    onClick={async () => {
                      const resumeToken = getPlayerSession(gameCode)?.resumeToken
                      if (!resumeToken) {
                        toast.error('Your player session expired — rejoin to continue')
                        return
                      }
                      setPnSubmitting(true)
                      try {
                        const res = await fetch('/api/player-participants', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            gameId: gameCode,
                            resumeToken,
                            name: pnNameInput.trim(),
                            ...(joinNeedsGender ? { gender: pnGender } : {}),
                          }),
                        })
                        if (res.ok) {
                          const { participant } = await res.json()
                          setPnList((prev) => [...prev, participant])
                          setPnNameInput('')
                          const { data: parts } = await supabase
                            .from('participants')
                            .select('*')
                            .eq('game_id', gameCode)
                            .order('display_order')
                          if (parts) setParticipants(parts)
                        } else {
                          const { error } = await res.json()
                          toast.error(error || 'Failed to submit')
                        }
                      } finally {
                        setPnSubmitting(false)
                      }
                    }}
                    className={
                      pnNameInput.trim()
                        ? 'btn-primary text-sm w-full'
                        : 'btn-secondary text-sm w-full opacity-60 cursor-not-allowed'
                    }
                  >
                    {pnSubmitting ? 'Submitting...' : 'Add Name'}
                  </button>
                </div>
                {pnList.filter((p) => p.submitted_by_player_id === myPlayerId).length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-theme">
                    <p className="text-faint text-[10px] uppercase tracking-wider">Your names</p>
                    {pnList
                      .filter((p) => p.submitted_by_player_id === myPlayerId)
                      .map((p) => (
                        <div key={p.id} className="flex items-start gap-2 text-sm">
                          <span className="flex-1 min-w-0 text-body-muted truncate">{p.name}</span>
                          <button
                            type="button"
                            className="text-faint hover:text-red-400 text-xs shrink-0"
                            onClick={async () => {
                              const resumeToken = getPlayerSession(gameCode)?.resumeToken
                              if (!resumeToken) {
                                toast.error('Your player session expired — rejoin to continue')
                                return
                              }
                              await fetch('/api/player-participants', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ participantId: p.id, resumeToken }),
                              })
                              setPnList((prev) => prev.filter((x) => x.id !== p.id))
                            }}
                          >
                            x
                          </button>
                        </div>
                      ))}
                  </div>
                )}
                {pnList.length > 0 && (
                  <p className="text-faint text-[10px] text-center">
                    {pnList.length} player-submitted name{pnList.length === 1 ? '' : 's'}
                    {isVoterOnly && participants.length > pnList.length
                      ? ` · ${participants.length - pnList.length} from host list`
                      : ''}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Participant gallery for games with photo cards */}
        {participants.length > 0 &&
          !isBinaryGame &&
          !isNhieGame &&
          !isMostLikelyTo(game?.game_type) &&
          !isWst &&
          !isVoterOnly && <ParticipantGallery participants={participants} />}

        {sessionBar}

        <p className="text-faint text-xs text-center">Keep this tab open</p>
      </CenteredCard>
    )
  }

  // ROUND — Who Said This
  if (view === 'round' && currentRound && isWhoSaidThis(game?.game_type)) {
    const gameType = parseGameType(game?.game_type)
    const submitterId = currentRound.submitter_player_id
    const isSubmitter = myPlayerId === submitterId
    const submitterName = wstSubmitterName(submitterId, players)
    const quote = currentRound.quote_text ?? ''
    const targets = wstVoteTargets(participants)
    const canVote = !!myPlayerId && !isViewer && !isSubmitter && !!quote && !isViewer

    return (
      <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full">
        {sessionBar}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-muted text-xs uppercase tracking-wider">{game?.title}</p>
            <GameTypeBadge gameType={gameType} className="mt-1 mb-1" />
            <p className="font-black text-body text-2xl">
              Round {currentRound.round_number}
              <span className="text-faint font-normal text-base"> / {game?.rounds_count}</span>
            </p>
            <p className="label-teal text-sm font-medium mt-1">
              {isSubmitter ? 'Your quote this round' : 'Guess who said it'}
            </p>
          </div>
          <TimerDisplay seconds={timeLeft} total={game?.timer_seconds ?? 30} />
        </div>

        {isSubmitter ? (
          quote ? (
            <div className="glass-card border border-teal-500/30 px-4 py-5 mb-6 text-center space-y-2">
              <p className="text-faint text-xs uppercase tracking-wider">Your quote</p>
              <p className="text-body text-lg font-medium italic">&ldquo;{quote}&rdquo;</p>
              <p className="text-muted text-sm">Everyone else is guessing who said it…</p>
            </div>
          ) : null
        ) : quote ? (
          <div className="glass-card border border-teal-500/30 px-4 py-5 mb-6 text-center">
            <p className="text-faint text-xs uppercase tracking-wider mb-2">Who said this?</p>
            {currentRound.anime_metadata && (
              <p className="text-teal-400 text-xs font-semibold mb-1">
                {(currentRound.anime_metadata as { anime_name: string }).anime_name}
              </p>
            )}
            <p className="text-body text-xl font-medium italic leading-snug">&ldquo;{quote}&rdquo;</p>
          </div>
        ) : (
          <div className="glass-card px-4 py-8 mb-6 text-center space-y-2">
            <p className="text-muted text-sm">Waiting for {submitterName ?? 'the writer'} to submit a quote…</p>
            {timeLeft === 0 && <p className="text-muted text-xs">Time&apos;s up — this round will end shortly.</p>}
          </div>
        )}

        {canVote && !submitted ? (
          currentRound.anime_metadata ? (
            <>
              <div className="grid grid-cols-1 gap-2 mt-4">
                {(currentRound.anime_metadata as { choices: string[] }).choices.map((choice) => (
                  <button
                    key={choice}
                    onClick={() => setAnimeChoice(choice)}
                    className={`text-left px-4 py-3 rounded-xl border transition-all ${
                      animeChoice === choice
                        ? 'border-teal-400 bg-teal-500/15 text-body'
                        : 'border-white/10 bg-white/5 text-muted hover:border-white/20 hover:bg-white/8'
                    }`}
                  >
                    {choice}
                  </button>
                ))}
              </div>
              <button
                onClick={handleSubmit}
                disabled={!animeChoice}
                className={`mt-6 ${animeChoice ? 'btn-primary' : 'btn-secondary opacity-60 cursor-not-allowed'}`}
              >
                {animeChoice ? 'Submit Guess ✓' : 'Pick a character'}
              </button>
            </>
          ) : (
            <>
              <NameSearchPicker
                options={targets.map((p) => ({ id: p.id, name: p.name }))}
                valueId={mltTargetPlayerId}
                onChange={(id) => setMltTargetPlayerId(id)}
                searchPlaceholder="Search names…"
                emptyMessage="No names match"
              />
              <button
                onClick={handleSubmit}
                disabled={!mltTargetPlayerId}
                className={`mt-6 ${mltTargetPlayerId ? 'btn-primary' : 'btn-secondary opacity-60 cursor-not-allowed'}`}
              >
                {mltTargetPlayerId ? 'Submit Guess ✓' : 'Pick who said it'}
              </button>
            </>
          )
        ) : canVote && submitted ? (
          <div className="glass-card border border-emerald-500/30 px-4 py-4 text-center mt-4">
            <p className="text-green-400 font-semibold">✓ Guess submitted!</p>
          </div>
        ) : !isSubmitter && quote ? null : null}
      </div>
    )
  }

  // ROUND — Most Likely To
  if (view === 'round' && currentRound && isMostLikelyTo(game?.game_type)) {
    const gameType = parseGameType(game?.game_type)
    const question = currentRound.mlt_question ?? ''
    const canVote = !!myPlayerId && !isViewer
    const mltTargets = game ? mltVoteTargets(game, participants, players) : []
    const mltSelfId = isMltImport
      ? (participants.find((p) => myPlayerName && p.name.toLowerCase() === myPlayerName.toLowerCase())?.id ?? null)
      : myPlayerId
    const borderCls = mltTargetPlayerId ? 'border-amber-500/40' : 'border-theme'

    return (
      <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full">
        {sessionBar}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-muted text-xs uppercase tracking-wider">{game?.title}</p>
            <GameTypeBadge gameType={gameType} className="mt-1 mb-1" />
            <p className="font-black text-body text-2xl">
              Round {currentRound.round_number}
              <span className="text-faint font-normal text-base"> / {game?.rounds_count}</span>
            </p>
          </div>
          {canVote ? <TimerDisplay seconds={timeLeft} total={game?.timer_seconds ?? 30} /> : null}
        </div>

        <div className={`glass-card border-2 ${borderCls} rounded-2xl p-5 mb-6 flex-1`}>
          <p className="text-muted text-xs uppercase tracking-wider text-center mb-3">Most likely to…</p>
          <p className="text-body text-base text-center leading-snug font-medium mb-4">{question}</p>
          <MltPlayerPicker
            players={mltTargets.map((p) => ({ id: p.id, name: p.name }))}
            selectedId={mltTargetPlayerId}
            onSelect={setMltTargetPlayerId}
            disabled={submitted || !canVote}
            selfId={mltSelfId}
          />
        </div>

        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={!mltTargetPlayerId}
            className={mltTargetPlayerId ? 'btn-primary' : 'btn-secondary opacity-60 cursor-not-allowed'}
          >
            {mltTargetPlayerId ? 'Submit Vote ✓' : 'Pick someone'}
          </button>
        ) : (
          <div className="w-full py-4 rounded-2xl glass-card border border-emerald-500/30 text-center">
            <p className="text-green-400 font-semibold">✓ Vote submitted!</p>
            <p className="text-muted text-sm mt-0.5">Results will show when the round ends</p>
          </div>
        )}
      </div>
    )
  }

  // ROUND — Would You Rather / This or That
  if (view === 'round' && currentRound && isBinaryChoiceGame(game?.game_type)) {
    const gameType = parseGameType(game?.game_type)
    const optionA = currentRound.wyr_option_a ?? ''
    const optionB = currentRound.wyr_option_b ?? ''
    const canVote = !!myPlayerId && !isViewer
    const isTotRound = isTotGame
    const borderCls =
      wyrChoice === 'a'
        ? isTotRound
          ? 'border-pink-400/50'
          : 'border-violet-500/40'
        : wyrChoice === 'b'
          ? 'border-sky-500/40'
          : 'border-theme'
    const optionAActive = isTotRound
      ? 'border-pink-400 bg-pink-500/15 ring-2 ring-pink-400/25'
      : 'border-violet-400 bg-violet-500/15 ring-2 ring-violet-400/25'
    const optionBActive = 'border-sky-400 bg-sky-500/15 ring-2 ring-sky-400/25'

    return (
      <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full">
        {sessionBar}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-muted text-xs uppercase tracking-wider">{game?.title}</p>
            <GameTypeBadge gameType={gameType} className="mt-1 mb-1" />
            <p className="font-black text-body text-2xl">
              Round {currentRound.round_number}
              <span className="text-faint font-normal text-base"> / {game?.rounds_count}</span>
            </p>
          </div>
          {canVote ? <TimerDisplay seconds={timeLeft} total={game?.timer_seconds ?? 30} /> : null}
        </div>

        <div className={`glass-card border-2 ${borderCls} rounded-2xl p-5 mb-6 flex-1`}>
          <p className="text-muted text-xs uppercase tracking-wider text-center mb-3">
            {isTotRound ? 'This or that…' : 'Would you rather…'}
          </p>
          <div className="space-y-3">
            <button
              type="button"
              disabled={submitted || !canVote}
              onClick={() => canVote && !submitted && setWyrChoice('a')}
              className={`w-full text-left rounded-2xl border p-4 transition-all active:scale-[0.99] ${
                wyrChoice === 'a' ? optionAActive : 'border-theme surface-inset hover:border-theme-strong'
              } disabled:cursor-not-allowed`}
            >
              <p className="text-[10px] uppercase tracking-wider text-faint mb-1">Option A</p>
              <p className="text-base font-semibold text-body leading-snug">{optionA}</p>
            </button>
            <button
              type="button"
              disabled={submitted || !canVote}
              onClick={() => canVote && !submitted && setWyrChoice('b')}
              className={`w-full text-left rounded-2xl border p-4 transition-all active:scale-[0.99] ${
                wyrChoice === 'b' ? optionBActive : 'border-theme surface-inset hover:border-theme-strong'
              } disabled:cursor-not-allowed`}
            >
              <p className="text-[10px] uppercase tracking-wider text-faint mb-1">Option B</p>
              <p className="text-base font-semibold text-body leading-snug">{optionB}</p>
            </button>
          </div>
        </div>

        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={!wyrChoice}
            className={wyrChoice ? 'btn-primary' : 'btn-secondary opacity-60 cursor-not-allowed'}
          >
            {wyrChoice ? 'Submit Vote ✓' : 'Pick one option'}
          </button>
        ) : (
          <div className="w-full py-4 rounded-2xl glass-card border border-emerald-500/30 text-center">
            <p className="text-green-400 font-semibold">✓ Vote submitted!</p>
            <p className="text-muted text-sm mt-0.5">Results will show when the round ends</p>
          </div>
        )}
      </div>
    )
  }

  // ROUND — Never Have I Ever
  if (view === 'round' && currentRound && isNhieGame) {
    const gameType = parseGameType(game?.game_type)
    const statement = currentRound.mlt_question ?? ''
    const canVote = !!myPlayerId && !isViewer
    const borderCls =
      wyrChoice === 'a' ? 'border-fuchsia-500/40' : wyrChoice === 'b' ? 'border-sky-500/40' : 'border-theme'

    return (
      <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full">
        {sessionBar}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-muted text-xs uppercase tracking-wider">{game?.title}</p>
            <GameTypeBadge gameType={gameType} className="mt-1 mb-1" />
            <p className="font-black text-body text-2xl">
              Round {currentRound.round_number}
              <span className="text-faint font-normal text-base"> / {game?.rounds_count}</span>
            </p>
          </div>
          {canVote ? <TimerDisplay seconds={timeLeft} total={game?.timer_seconds ?? 30} /> : null}
        </div>

        <div className={`glass-card border-2 ${borderCls} rounded-2xl p-5 mb-6 flex-1`}>
          <p className="text-muted text-xs uppercase tracking-wider text-center mb-3">Never have I ever…</p>
          <p className="text-xl font-semibold text-body text-center leading-snug mb-5">{statement}</p>
          <div className="space-y-3">
            <button
              type="button"
              disabled={submitted || !canVote}
              onClick={() => canVote && !submitted && setWyrChoice('a')}
              className={`w-full text-left rounded-2xl border p-4 transition-all active:scale-[0.99] ${
                wyrChoice === 'a'
                  ? 'border-fuchsia-400 bg-fuchsia-500/15 ring-2 ring-fuchsia-400/25'
                  : 'border-theme surface-inset hover:border-theme-strong'
              } disabled:cursor-not-allowed`}
            >
              <p className="text-base font-semibold text-body leading-snug">✋ I have</p>
            </button>
            <button
              type="button"
              disabled={submitted || !canVote}
              onClick={() => canVote && !submitted && setWyrChoice('b')}
              className={`w-full text-left rounded-2xl border p-4 transition-all active:scale-[0.99] ${
                wyrChoice === 'b'
                  ? 'border-sky-400 bg-sky-500/15 ring-2 ring-sky-400/25'
                  : 'border-theme surface-inset hover:border-theme-strong'
              } disabled:cursor-not-allowed`}
            >
              <p className="text-base font-semibold text-body leading-snug">🙅 I haven&apos;t</p>
            </button>
          </div>
        </div>

        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={!wyrChoice}
            className={wyrChoice ? 'btn-primary' : 'btn-secondary opacity-60 cursor-not-allowed'}
          >
            {wyrChoice ? 'Submit Vote ✓' : 'Pick one option'}
          </button>
        ) : (
          <div className="w-full py-4 rounded-2xl glass-card border border-emerald-500/30 text-center">
            <p className="text-green-400 font-semibold">✓ Vote submitted!</p>
            <p className="text-muted text-sm mt-0.5">Results will show when the round ends</p>
          </div>
        )}
      </div>
    )
  }

  // ROUND — Pick a Number
  if (view === 'round' && currentRound && isPanGame && game) {
    const pickerId = currentRound.submitter_player_id
    const isPicker = myPlayerId === pickerId
    const pickerName = hotSeatPlayerDisplayName(pickerId, players, participants)
    const poolSize = pickANumberPoolSize(game)
    const revealed = panRoundRevealed(currentRound)
    const timedOut = timeLeft === 0 && !revealed && !submitted
    const canPick = isPicker && !isViewer && !submitted && !revealed && !timedOut
    const availableCount = poolSize - panUsedNumbers.size

    return (
      <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full">
        {sessionBar}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-muted text-xs uppercase tracking-wider">{game.title}</p>
            <GameTypeBadge gameType={game.game_type} className="mt-1 mb-1" />
            <p className="font-black text-body text-2xl">
              Round {currentRound.round_number}
              <span className="text-faint font-normal text-base"> / {game.rounds_count}</span>
            </p>
          </div>
          {isPicker ? <TimerDisplay seconds={timeLeft} total={game.timer_seconds ?? 30} /> : null}
        </div>

        <div className="glass-card border-2 border-violet-500/35 rounded-2xl p-5 mb-6">
          <div className="text-center mb-4">
            <div className="text-4xl mb-2">🔢❓</div>
            <p className="text-violet-600 dark:text-violet-400 text-xs uppercase tracking-wider mb-1">
              Picker this round
            </p>
            <p className="text-2xl font-black text-body">{isPicker ? 'YOU' : pickerName}</p>
          </div>

          {revealed && currentRound.mlt_question ? (
            <PanRoundResults
              pickerName={isPicker ? 'You' : pickerName}
              pickedNumber={pickedNumber}
              question={currentRound.mlt_question}
            />
          ) : timedOut ? (
            <div className="text-center py-6">
              <p className="text-amber-600 dark:text-amber-400 font-semibold text-lg">Time&apos;s up!</p>
              <p className="text-muted text-sm mt-2">
                {isPicker
                  ? poolSize > 0
                    ? 'Locking in a random number…'
                    : 'Could not load the question list — ask the host to advance'
                  : `Waiting for ${pickerName} — the host will advance the round`}
              </p>
            </div>
          ) : isPicker ? (
            <>
              <p className="text-center text-body font-medium mb-1">Pick a number between 1 and {poolSize}</p>
              <p className="text-center text-faint text-sm mb-4">
                {panUsedNumbers.size > 0
                  ? `${availableCount} number${availableCount === 1 ? '' : 's'} left — taken picks are greyed out`
                  : 'Questions stay hidden until you choose'}
              </p>
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
                {Array.from({ length: poolSize }, (_, i) => i + 1).map((n) => {
                  const isTaken = panUsedNumbers.has(n)
                  const isSelected = pickedNumber === n
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={!canPick || isTaken}
                      onClick={() => canPick && !isTaken && setPickedNumber(n)}
                      className={`aspect-square rounded-xl border text-lg font-bold transition-all active:scale-95 ${
                        isTaken
                          ? 'border-theme/40 surface-inset text-faint line-through opacity-50 cursor-not-allowed'
                          : isSelected
                            ? 'border-violet-500 bg-violet-500/15 text-violet-900 dark:text-violet-100 ring-2 ring-violet-400/30'
                            : 'border-theme surface-inset text-body hover:border-violet-400/50'
                      } disabled:cursor-not-allowed`}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-6">
              <p className="text-muted text-lg">Waiting for {pickerName} to pick a number…</p>
              <p className="text-faint text-sm mt-2">The question list is hidden from everyone</p>
            </div>
          )}
        </div>

        {revealed ? (
          <div className="glass-card border border-emerald-500/30 px-4 py-4 text-center mb-4">
            <p className="text-green-400 font-semibold">
              {isPicker ? 'Your turn — answer out loud!' : `${pickerName} — answer out loud!`}
            </p>
            <p className="text-faint text-sm mt-1">The host will advance when they&apos;re done</p>
          </div>
        ) : isPicker && submitted ? (
          <div className="w-full py-4 rounded-2xl glass-card border border-emerald-500/30 text-center">
            <p className="text-green-400 font-semibold">✓ Number locked in!</p>
          </div>
        ) : timedOut ? null : isPicker ? (
          <button
            onClick={handleSubmit}
            disabled={!pickedNumber}
            className={pickedNumber ? 'btn-primary' : 'btn-secondary opacity-60 cursor-not-allowed'}
          >
            {pickedNumber ? `Lock in #${pickedNumber} ✓` : 'Pick a number first'}
          </button>
        ) : null}
      </div>
    )
  }

  // ROUND — Hot Seat
  if (view === 'round' && currentRound && isHotSeat(game?.game_type)) {
    const hotSeatPlayerId = currentRound.submitter_player_id
    const isInHotSeat = myPlayerId === hotSeatPlayerId
    const hotSeatPlayerName = hotSeatPlayerDisplayName(hotSeatPlayerId, players, participants)

    return (
      <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full">
        {sessionBar}
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-muted text-xs uppercase tracking-wider">{game?.title}</p>
            <GameTypeBadge gameType={game?.game_type} className="mt-1 mb-1" />
            <p className="font-black text-body text-2xl">
              Round {currentRound.round_number}
              <span className="text-faint font-normal text-base"> / {game?.rounds_count}</span>
            </p>
          </div>
          <TimerDisplay seconds={timeLeft} total={game?.timer_seconds ?? 30} />
        </div>

        {/* Hot seat spotlight */}
        <div className="glass-card border-2 border-amber-500/40 rounded-2xl p-6 mb-6 text-center">
          <div className="text-5xl mb-3">🪑🔥</div>
          <p className="text-amber-400 text-xs uppercase tracking-wider mb-1">In the hot seat</p>
          <p className="text-3xl font-black text-body">{isInHotSeat ? 'YOU' : hotSeatPlayerName}</p>
        </div>

        {isInHotSeat ? (
          /* Hot seat player waits */
          <div className="glass-card px-4 py-8 text-center">
            <p className="text-muted text-lg">Everyone is writing something about you...</p>
            <p className="text-faint text-sm mt-2">Brace yourself 😬</p>
          </div>
        ) : hotSeatSubmitted ? (
          /* Already submitted */
          <div className="glass-card border border-emerald-500/30 px-4 py-4 text-center">
            <p className="text-green-400 font-semibold">✓ Submitted!</p>
            <p className="text-muted text-sm mt-1">Waiting for everyone else...</p>
          </div>
        ) : (
          /* Submission form */
          <div className="space-y-4">
            {/* Type selector */}
            <div className="flex gap-2">
              {HOT_SEAT_SUBMISSION_TYPES.map(({ type, emoji, label }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setHotSeatType(type)}
                  className={`hot-seat-type hot-seat-type-${type}${hotSeatType === type ? ' hot-seat-type-active' : ''}`}
                >
                  {emoji} {label}
                </button>
              ))}
            </div>

            <textarea
              value={hotSeatText}
              onChange={(e) => setHotSeatText(e.target.value)}
              placeholder={`Write a ${hotSeatType} about ${hotSeatPlayerName}...`}
              maxLength={300}
              rows={3}
              className="input-field resize-none"
            />

            <button
              onClick={async () => {
                if (!hotSeatText.trim() || !currentRound || !myPlayerId) return
                const resumeToken = getPlayerSession(gameCode)?.resumeToken
                if (!resumeToken) {
                  toast.error('Your player session expired — rejoin to continue')
                  return
                }
                const res = await fetch('/api/hot-seat', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    gameId: gameCode,
                    roundId: currentRound.id,
                    resumeToken,
                    text: hotSeatText.trim(),
                    submissionType: hotSeatType,
                  }),
                })
                if (res.ok) {
                  setHotSeatSubmitted(true)
                  playVoteSubmittedSound()
                }
              }}
              disabled={!hotSeatText.trim()}
              className={
                hotSeatText.trim() ? 'btn-primary w-full' : 'btn-secondary w-full opacity-60 cursor-not-allowed'
              }
            >
              Submit {hotSeatType === 'compliment' ? '💛' : hotSeatType === 'roast' ? '🔥' : '👀'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ROUND — voting
  if (view === 'round' && currentRound) {
    const gameType = parseGameType(game?.game_type)
    const roundParts = participants.filter((p) => currentRound.participant_ids.includes(p.id))
    const roundParticipantGender = getRoundParticipantGender(currentRound.participant_ids, participants)
    const genderFreeVoting = !!game && isGenderFreeVoting(game)
    const roundGender = genderFreeVoting ? null : roundGenderLabel(roundParts.map((p) => p.gender))
    const voterHint = genderFreeVoting ? null : roundVoterLabel(roundParticipantGender)
    const effectiveGender = myPlayerGender ?? getPlayerSession(gameCode)?.playerGender ?? null
    const canVote = genderFreeVoting
      ? !!myPlayerId && !isViewer
      : !!(
          effectiveGender &&
          roundParticipantGender &&
          canPlayerVoteInRound(effectiveGender, roundParticipantGender) &&
          !isViewer
        )
    const voteBanner = canVote && !genderFreeVoting ? activeVoteBanner(effectiveGender) : null
    const isBinaryPoll = isBinaryPeoplePollGame(gameType)
    const isUnary = isUnaryPollGame(gameType)
    const roundPartIds = roundParts.map((p) => p.id)
    const pairMode = parsePairVoteMode(game?.pair_vote_mode)
    const isCustom = isCustomGame(gameType)
    const customSlots = isCustom && game ? getCustomSlots(game) : []
    const customMode =
      isCustom && game
        ? customAssignmentMode(
            game,
            roundParts.length,
            customSlots.map((s) => s.key)
          )
        : 'one_each'
    const customComplete =
      isCustom && game
        ? isCustomAssignmentValid(
            customAssignments,
            roundParts.map((p) => p.id),
            customSlots.map((s) => s.key),
            customMode
          )
        : false
    const allAssigned = isCustom
      ? customComplete
      : isBinaryPoll
        ? isPairAssignmentValid(pairAssignment, roundPartIds, pairMode)
        : isAssignmentComplete(assignment, gameType)
    const assignTarget = isCustom && game ? roundParts.length : assignmentTargetCount(gameType, roundParts.length)
    const assignProgress = isCustom
      ? Object.keys(customAssignments).filter((id) => roundParts.some((p) => p.id === id)).length
      : isBinaryPoll
        ? pairAssignedCount(pairAssignment, roundPartIds)
        : assignedCount(assignment, gameType)

    return (
      <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full">
        {sessionBar}
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-muted text-xs uppercase tracking-wider">{game?.title}</p>
            <GameTypeBadge gameType={gameType} className="mt-1 mb-1" />
            <p className="font-black text-body text-2xl">
              Round {currentRound.round_number}
              <span className="text-faint font-normal text-base"> / {game?.rounds_count}</span>
            </p>
            {roundGender && <p className="text-[var(--primary)] text-sm font-medium mt-0.5">{roundGender}</p>}
            {voterHint && <p className="text-muted text-xs mt-0.5">{voterHint}</p>}
            {voteBanner && <p className="text-green-400/90 text-xs font-medium mt-1">{voteBanner}</p>}
            {isUnary && (
              <p className="text-faint text-xs mt-1">Would you let your son or daughter date or marry this person?</p>
            )}
            {isPairGame(gameType) && isPairOneEachMode(game!) && (
              <p className="text-faint text-xs mt-1">
                {gameType === 'smash_or_pass'
                  ? 'One Smash and one Pass — tap the other person&apos;s choice to swap'
                  : 'One Green and one Red — tap the other person&apos;s choice to swap'}
              </p>
            )}
            {isPairGame(gameType) && !isPairOneEachMode(game!) && roundParts.length === 2 && (
              <p className="text-faint text-xs mt-1">
                {gameType === 'smash_or_pass'
                  ? 'Any combo — both Smash, both Pass, or one of each'
                  : 'Any combo — both Green, both Red, or one of each'}
              </p>
            )}
            {isCustom && isCustomTwoSlotGame(game!) && isCustomOneEachMode(game!) && customSlots.length === 2 && (
              <p className="text-faint text-xs mt-1">
                One {customSlots[0].label || 'option'} and one {customSlots[1].label || 'option'} — tap the other
                person&apos;s choice to swap
              </p>
            )}
            {isCustom && isCustomTwoSlotGame(game!) && !isCustomOneEachMode(game!) && customSlots.length === 2 && (
              <p className="text-faint text-xs mt-1">
                Any combo — both {customSlots[0].label || 'options'}, both {customSlots[1].label || 'options'}, or one
                of each
              </p>
            )}
          </div>
          {canVote ? (
            <TimerDisplay seconds={timeLeft} total={game?.timer_seconds ?? 30} />
          ) : (
            <div className="glass-card px-3 py-2 text-center">
              <p className="text-faint text-[10px] uppercase tracking-wider">Spectating</p>
            </div>
          )}
        </div>

        {!canVote && !genderFreeVoting && (
          <div className="glass-card border border-theme-strong px-4 py-3 mb-4 text-center">
            <p className="text-body text-sm">{spectatorMessage(roundParticipantGender, effectiveGender)}</p>
          </div>
        )}

        {/* Custom game voting UI */}
        {isCustomGame(gameType) && game && currentRound
          ? (() => {
              const slots = getCustomSlots(game)
              const roundPartsCustom = participants.filter((p) => currentRound.participant_ids.includes(p.id))
              const roundIdsCustom = roundPartsCustom.map((p) => p.id)
              const customMode = customAssignmentMode(
                game,
                roundIdsCustom.length,
                slots.map((s) => s.key)
              )
              return (
                <div className="flex-1 mb-6">
                  <CustomVoteCard
                    participants={roundPartsCustom}
                    slots={slots}
                    assignments={customAssignments}
                    getDisabledSlotKeys={(participantId) =>
                      customDisabledSlots(
                        customAssignments,
                        participantId,
                        roundIdsCustom,
                        slots.map((s) => s.key),
                        customMode
                      )
                    }
                    onAssign={(pid, slotKey) => {
                      if (!canVote || submitted) return
                      setCustomAssignments((prev) => assignCustomSlot(prev, pid, slotKey, roundIdsCustom, customMode))
                    }}
                    disabled={submitted || !canVote}
                  />
                </div>
              )
            })()
          : null}

        {/* Participant photo cards — side-by-side grid */}
        {!isCustomGame(gameType) && (
          <div
            className={`flex-1 grid gap-3 mb-6 ${
              roundParts.length === 1
                ? 'grid-cols-1 max-w-xs mx-auto w-full'
                : roundParts.length === 2
                  ? 'grid-cols-2'
                  : 'grid-cols-2 sm:grid-cols-3'
            }`}
          >
            {roundParts.map((p) => {
              const action = isBinaryPoll
                ? (pairAssignment[p.id] ?? null)
                : assignment.kiss === p.id
                  ? 'kiss'
                  : assignment.marry === p.id
                    ? 'marry'
                    : assignment.kill === p.id
                      ? 'kill'
                      : null
              return (
                <ParticipantPhotoCard
                  key={p.id}
                  gameType={gameType}
                  participant={p}
                  action={action}
                  onAssign={(a) => canVote && !submitted && assign(a, p.id)}
                  disabled={submitted || !canVote}
                  disabledSlots={
                    isBinaryPoll && game && !isUnary
                      ? pairDisabledSlots(pairAssignment, p.id, roundPartIds, pairMode)
                      : []
                  }
                />
              )
            })}
          </div>
        )}

        {/* Submit / submitted / spectating */}
        {!canVote ? (
          <p className="text-faint text-sm text-center">Results will appear when voting ends</p>
        ) : !submitted ? (
          <button
            onClick={handleSubmit}
            disabled={!allAssigned}
            className={allAssigned ? 'btn-primary' : 'btn-secondary opacity-60 cursor-not-allowed'}
          >
            {allAssigned
              ? 'Submit Vote ✓'
              : isUnary
                ? 'Pick Yes or No'
                : isBinaryPoll
                  ? gameType === 'smash_or_pass'
                    ? `Pick for both (${assignProgress}/${assignTarget})`
                    : `Rate both (${assignProgress}/${assignTarget})`
                  : `Assign all ${assignTarget} (${assignProgress}/${assignTarget})`}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="w-full py-4 rounded-2xl glass-card border border-emerald-500/30 text-center">
              <p className="text-green-400 font-semibold">✓ Vote submitted!</p>
              <p className="text-muted text-sm mt-0.5">Results will show when the round ends</p>
            </div>
            {!confessionSent ? (
              <div className="space-y-2">
                <p className="text-faint text-xs text-center">Leave an anonymous hot take (optional)</p>
                <div className="flex gap-2">
                  <input
                    value={confessionText}
                    onChange={(e) => setConfessionText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendConfession()}
                    placeholder="Why did you make those choices?"
                    className="flex-1 input-field py-2.5 text-sm"
                  />
                  <button
                    onClick={sendConfession}
                    disabled={!confessionText.trim()}
                    className="px-4 py-2.5 btn-secondary text-sm disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-faint text-xs text-center">Hot take sent 👀</p>
            )}
          </div>
        )}
      </div>
    )
  }

  // ROUND RESULTS — shown after round ends, before next round starts
  if (view === 'round_results' && lastFinishedRound) {
    const gameType = parseGameType(game?.game_type)

    if (isHotSeat(gameType)) {
      const hotSeatPlayerId = lastFinishedRound.submitter_player_id
      const hotSeatPlayerName = hotSeatPlayerDisplayName(hotSeatPlayerId, players, participants)
      const isLastRound = lastFinishedRound.round_number >= (game?.rounds_count ?? 0)

      return (
        <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full space-y-5">
          {sessionBar}
          <div className="text-center">
            <p className="text-muted text-xs uppercase tracking-wider">
              Round {lastFinishedRound.round_number} of {game?.rounds_count}
            </p>
            <GameTypeBadge gameType={gameType} className="mt-2" />
            <h2 className="text-2xl font-black tracking-tight mt-2">Hot Seat Reveal! 🪑🔥</h2>
          </div>

          <RoundResultsShareBlock
            game={game!}
            round={lastFinishedRound}
            votes={lastRoundVotes}
            participants={participants}
            players={players}
          >
            <HotSeatRoundResults hotSeatPlayerName={hotSeatPlayerName} submissions={hotSeatSubmissions} />
          </RoundResultsShareBlock>

          <ReactionBar className="pt-1" gameCode={gameCode} playerId={myPlayerId} />
          <p className="text-faint text-sm text-center">
            {roundResultsWaitMessage({
              isLastRound,
              autoReveal: !!game?.auto_reveal,
              nextRoundSecondsLeft: nextRoundCountdown,
              finalRevealSecondsLeft: finalRevealCountdown,
            })}
          </p>
        </div>
      )
    }

    if (isNeverHaveIEver(gameType)) {
      const myVote = lastRoundVotes.find((v) => v.player_id === myPlayerId)
      const { countA, countB, voterCount } = tallyWyrVotes(lastRoundVotes)
      const isLastRound = lastFinishedRound.round_number >= (game?.rounds_count ?? 0)

      return (
        <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full space-y-5">
          {sessionBar}
          <div className="text-center">
            <p className="text-muted text-xs uppercase tracking-wider">
              Round {lastFinishedRound.round_number} of {game?.rounds_count}
            </p>
            <GameTypeBadge gameType={gameType} className="mt-2" />
            <h2 className="text-2xl font-black tracking-tight mt-2">Results are in! 🙈</h2>
          </div>
          <RoundResultsShareBlock
            game={game!}
            round={lastFinishedRound}
            votes={lastRoundVotes}
            participants={participants}
            players={players}
          >
            <WyrRoundResults
              optionA={lastFinishedRound.mlt_question ?? ''}
              optionB=""
              countA={countA}
              countB={countB}
              voterCount={voterCount}
              myChoice={myVote?.wyr_choice ?? null}
              mode="nhie"
            />
          </RoundResultsShareBlock>
          <ConfessionsTicker confessions={allConfessions.filter((c) => c.round_id === lastFinishedRound.id)} />
          <ReactionBar className="pt-1" gameCode={gameCode} playerId={myPlayerId} />
          <p className="text-faint text-sm text-center">
            {roundResultsWaitMessage({
              isLastRound,
              autoReveal: !!game?.auto_reveal,
              nextRoundSecondsLeft: nextRoundCountdown,
              finalRevealSecondsLeft: finalRevealCountdown,
            })}
          </p>
        </div>
      )
    }

    if (isPickANumber(gameType)) {
      const pickerId = lastFinishedRound.submitter_player_id
      const pickerVote = lastRoundVotes.find((v) => v.player_id === pickerId)
      const pickerName = hotSeatPlayerDisplayName(pickerId, players, participants)
      const isLastRound = lastFinishedRound.round_number >= (game?.rounds_count ?? 0)
      const revealed = panRoundRevealed(lastFinishedRound)

      return (
        <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full space-y-5">
          {sessionBar}
          <div className="text-center">
            <p className="text-muted text-xs uppercase tracking-wider">
              Round {lastFinishedRound.round_number} of {game?.rounds_count}
            </p>
            <GameTypeBadge gameType={gameType} className="mt-2" />
            <h2 className="text-2xl font-black tracking-tight mt-2">
              {revealed ? 'Question revealed! 🔢' : 'Time ran out ⏱️'}
            </h2>
          </div>
          <RoundResultsShareBlock
            game={game!}
            round={lastFinishedRound}
            votes={lastRoundVotes}
            participants={participants}
            players={players}
          >
            {revealed ? (
              <PanRoundResults
                pickerName={pickerName}
                pickedNumber={pickerVote?.picked_number}
                question={lastFinishedRound.mlt_question ?? ''}
              />
            ) : (
              <p className="text-muted text-center">{pickerName} didn&apos;t pick a number before time ran out.</p>
            )}
          </RoundResultsShareBlock>
          <ConfessionsTicker confessions={allConfessions.filter((c) => c.round_id === lastFinishedRound.id)} />
          <ReactionBar className="pt-1" gameCode={gameCode} playerId={myPlayerId} />
          <p className="text-faint text-sm text-center">
            {roundResultsWaitMessage({
              isLastRound,
              autoReveal: !!game?.auto_reveal,
              nextRoundSecondsLeft: nextRoundCountdown,
              finalRevealSecondsLeft: finalRevealCountdown,
            })}
          </p>
        </div>
      )
    }

    if (isBinaryChoiceGame(gameType)) {
      const myVote = lastRoundVotes.find((v) => v.player_id === myPlayerId)
      const { countA, countB, voterCount } = tallyWyrVotes(lastRoundVotes)
      const isLastRound = lastFinishedRound.round_number >= (game?.rounds_count ?? 0)

      return (
        <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full space-y-5">
          {sessionBar}
          <div className="text-center">
            <p className="text-muted text-xs uppercase tracking-wider">
              Round {lastFinishedRound.round_number} of {game?.rounds_count}
            </p>
            <GameTypeBadge gameType={gameType} className="mt-2" />
            <h2 className="text-2xl font-black tracking-tight mt-2">Results are in! 🗳️</h2>
          </div>
          <RoundResultsShareBlock
            game={game!}
            round={lastFinishedRound}
            votes={lastRoundVotes}
            participants={participants}
            players={players}
          >
            <WyrRoundResults
              optionA={lastFinishedRound.wyr_option_a ?? ''}
              optionB={lastFinishedRound.wyr_option_b ?? ''}
              countA={countA}
              countB={countB}
              voterCount={voterCount}
              myChoice={myVote?.wyr_choice ?? null}
              mode={isTotGame ? 'tot' : 'wyr'}
            />
          </RoundResultsShareBlock>
          <ConfessionsTicker confessions={allConfessions.filter((c) => c.round_id === lastFinishedRound.id)} />
          <ReactionBar className="pt-1" gameCode={gameCode} playerId={myPlayerId} />
          <p className="text-faint text-sm text-center">
            {roundResultsWaitMessage({
              isLastRound,
              autoReveal: !!game?.auto_reveal,
              nextRoundSecondsLeft: nextRoundCountdown,
              finalRevealSecondsLeft: finalRevealCountdown,
            })}
          </p>
        </div>
      )
    }

    if (isWhoSaidThis(gameType) && game) {
      const myVote = lastRoundVotes.find((v) => v.player_id === myPlayerId)
      const myPickName = lastFinishedRound.anime_metadata
        ? (myVote?.anime_choice ?? null)
        : myVote?.target_participant_id
          ? (participants.find((p) => p.id === myVote.target_participant_id)?.name ?? null)
          : null
      const isLastRound = lastFinishedRound.round_number >= (game?.rounds_count ?? 0)

      if (isAnimeRound(lastFinishedRound)) {
        const meta = lastFinishedRound.anime_metadata as {
          anime_name: string
          correct_character: string
          choices: string[]
        }
        const animeTally = tallyAnimeWstVotes(lastRoundVotes, meta.choices, meta.correct_character)
        return (
          <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full space-y-5">
            {sessionBar}
            <div className="text-center">
              <p className="text-muted text-xs uppercase tracking-wider">
                Round {lastFinishedRound.round_number} of {game?.rounds_count}
              </p>
              <GameTypeBadge gameType={gameType} className="mt-2" />
              <h2 className="text-2xl font-black tracking-tight mt-2">Results are in! 🕵️</h2>
            </div>
            <RoundResultsShareBlock
              game={game!}
              round={lastFinishedRound}
              votes={lastRoundVotes}
              participants={participants}
              players={players}
            >
              <AnimeWstRoundResults
                quote={lastFinishedRound.quote_text ?? '(no quote)'}
                animeName={meta.anime_name}
                rows={animeTally.rows}
                voterCount={animeTally.voterCount}
                maxCount={animeTally.maxCount}
                topGuesses={animeTally.topGuesses}
                correctCharacter={meta.correct_character}
                correctCount={animeTally.correctCount}
                myPickName={myPickName}
              />
            </RoundResultsShareBlock>
            <p className="text-faint text-sm text-center">
              {roundResultsWaitMessage({
                isLastRound,
                autoReveal: !!game?.auto_reveal,
                nextRoundSecondsLeft: nextRoundCountdown,
                finalRevealSecondsLeft: finalRevealCountdown,
              })}
            </p>
          </div>
        )
      }

      const targets = wstVoteTargets(participants)
      const correctName = wstCorrectNameFromRound(lastFinishedRound, players, participants)
      const correctId = wstCorrectParticipantIdFromRound(lastFinishedRound, players)
      const { rows, voterCount, maxCount, topGuesses, correctCount } = tallyWstVotes(lastRoundVotes, targets, correctId)

      return (
        <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full space-y-5">
          {sessionBar}
          <div className="text-center">
            <p className="text-muted text-xs uppercase tracking-wider">
              Round {lastFinishedRound.round_number} of {game?.rounds_count}
            </p>
            <GameTypeBadge gameType={gameType} className="mt-2" />
            <h2 className="text-2xl font-black tracking-tight mt-2">Results are in! 🕵️</h2>
          </div>
          <RoundResultsShareBlock
            game={game!}
            round={lastFinishedRound}
            votes={lastRoundVotes}
            participants={participants}
            players={players}
          >
            <WstRoundResults
              quote={lastFinishedRound.quote_text ?? '(no quote submitted)'}
              rows={rows}
              voterCount={voterCount}
              maxCount={maxCount}
              topGuesses={topGuesses}
              correctName={correctName}
              correctCount={correctCount}
              myPickName={myPickName}
            />
          </RoundResultsShareBlock>
          <ConfessionsTicker confessions={allConfessions.filter((c) => c.round_id === lastFinishedRound.id)} />
          <ReactionBar className="pt-1" gameCode={gameCode} playerId={myPlayerId} />
          <p className="text-faint text-sm text-center">
            {roundResultsWaitMessage({
              isLastRound,
              autoReveal: !!game?.auto_reveal,
              nextRoundSecondsLeft: nextRoundCountdown,
              finalRevealSecondsLeft: finalRevealCountdown,
            })}
          </p>
        </div>
      )
    }

    if (isMostLikelyTo(gameType) && game) {
      const myVote = lastRoundVotes.find((v) => v.player_id === myPlayerId)
      const mltKind = isMltImportGame(game) ? 'participant' : 'player'
      const mltTargets = mltVoteTargets(game, participants, players)
      const { rows, voterCount, maxCount, winnerNames } = tallyMltVotes(lastRoundVotes, mltTargets, mltKind)
      const pickedId = myVote ? mltTargetIdFromVote(myVote, mltKind) : null
      const myPickName = pickedId ? (mltTargets.find((t) => t.id === pickedId)?.name ?? null) : null
      const isLastRound = lastFinishedRound.round_number >= (game?.rounds_count ?? 0)

      return (
        <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full space-y-5">
          {sessionBar}
          <div className="text-center">
            <p className="text-muted text-xs uppercase tracking-wider">
              Round {lastFinishedRound.round_number} of {game?.rounds_count}
            </p>
            <GameTypeBadge gameType={gameType} className="mt-2" />
            <h2 className="text-2xl font-black tracking-tight mt-2">Results are in! 🗳️</h2>
          </div>
          <RoundResultsShareBlock
            game={game!}
            round={lastFinishedRound}
            votes={lastRoundVotes}
            participants={participants}
            players={players}
          >
            <MltRoundResults
              question={lastFinishedRound.mlt_question ?? ''}
              rows={rows}
              voterCount={voterCount}
              maxCount={maxCount}
              winnerNames={winnerNames}
              myPickName={myPickName}
            />
          </RoundResultsShareBlock>
          <ConfessionsTicker confessions={allConfessions.filter((c) => c.round_id === lastFinishedRound.id)} />
          <ReactionBar className="pt-1" gameCode={gameCode} playerId={myPlayerId} />
          <p className="text-faint text-sm text-center">
            {roundResultsWaitMessage({
              isLastRound,
              autoReveal: !!game?.auto_reveal,
              nextRoundSecondsLeft: nextRoundCountdown,
              finalRevealSecondsLeft: finalRevealCountdown,
            })}
          </p>
        </div>
      )
    }

    const roundParts = participants.filter((p) => lastFinishedRound.participant_ids.includes(p.id))
    const roundParticipantGender = getRoundParticipantGender(lastFinishedRound.participant_ids, participants)
    const genderFreeVoting = !!game && isGenderFreeVoting(game)
    const roundGender = genderFreeVoting ? null : roundGenderLabel(roundParts.map((p) => p.gender))
    const myVote = lastRoundVotes.find((v) => v.player_id === myPlayerId)
    const watchedRound = !!(
      !genderFreeVoting &&
      !myVote &&
      myPlayerGender &&
      roundParticipantGender &&
      !canPlayerVoteInRound(myPlayerGender, roundParticipantGender)
    )
    const roundConfessions = allConfessions.filter((c) => c.round_id === lastFinishedRound.id)
    const isLastRound = lastFinishedRound.round_number >= (game?.rounds_count ?? 0)

    return (
      <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full space-y-5">
        {sessionBar}
        {/* Header */}
        <div className="text-center">
          <p className="text-muted text-xs uppercase tracking-wider">
            Round {lastFinishedRound.round_number} of {game?.rounds_count}
            {roundGender ? ` · ${roundGender}` : ''}
          </p>
          <GameTypeBadge gameType={gameType} className="mt-2" />
          <h2 className="text-2xl font-black tracking-tight mt-2">Results are in! 🗳️</h2>
          {watchedRound && (
            <p className="text-muted text-sm mt-2">You watched this round — everyone sees the same results</p>
          )}
        </div>

        {/* My vote recap */}
        {myVote && (
          <div className="glass-card border border-[var(--primary)]/30 p-4">
            <p className="text-[var(--primary)] text-xs uppercase tracking-wider mb-2">Your vote</p>
            {isCustomGame(gameType) && game ? (
              <div className="space-y-1.5">
                {customVoteRecapItems(
                  myVote.pair_assignments as Record<string, string> | null,
                  roundParts,
                  getCustomSlots(game)
                ).map((item) => (
                  <p key={`${item.label}-${item.name}`} className="text-sm font-medium" style={{ color: item.color }}>
                    {item.emoji} {item.label}: {item.name}
                  </p>
                ))}
              </div>
            ) : (
              <div className="inline-flex flex-wrap gap-x-3 gap-y-1">
                {isBinaryPeoplePollGame(gameType)
                  ? roundParts.map((p) => {
                      const flag = flagForParticipant(myVote, p.id)
                      if (!flag) return null
                      const meta = slotMeta(gameType, flag)
                      return (
                        <span key={p.id} className="text-sm font-medium" style={{ color: meta.textColor }}>
                          {p.name}: {meta.emoji} {meta.label}
                        </span>
                      )
                    })
                  : voteSlots(gameType).map((slot) => {
                      const participantId =
                        slot === 'kiss'
                          ? myVote.kiss_participant_id
                          : slot === 'marry'
                            ? myVote.marry_participant_id
                            : myVote.kill_participant_id
                      if (!participantId) return null
                      const meta = slotMeta(gameType, slot)
                      return (
                        <span key={slot} className="text-sm font-medium" style={{ color: meta.textColor }}>
                          {meta.emoji} {participants.find((p) => p.id === participantId)?.name}
                        </span>
                      )
                    })}
              </div>
            )}
          </div>
        )}

        <RoundResultsShareBlock
          game={game!}
          round={lastFinishedRound}
          votes={lastRoundVotes}
          participants={participants}
          players={players}
        >
          {isCustomGame(gameType) && game
            ? (() => {
                const slots = getCustomSlots(game)
                const slotKeys = slots.map((s) => s.key)
                const roundPartsIds = lastFinishedRound.participant_ids
                const nameMap = new Map(participants.map((p) => [p.id, p.name]))
                const tally = tallyCustomVotes(lastRoundVotes, roundPartsIds, nameMap, slotKeys)
                const myAssignment = myVote?.pair_assignments as Record<string, string> | null
                return <CustomRoundResults tally={tally} slots={slots} myAssignment={myAssignment} />
              })()
            : (() => {
                const tallies = tallyRoundVotes(
                  roundParts.map((p) => p.id),
                  lastRoundVotes
                )
                const nameById = new Map(roundParts.map((p) => [p.id, p.name]))
                const voterCount = lastRoundVotes.length

                return (
                  <ParticipantRoundResults
                    gameType={gameType}
                    tallies={tallies}
                    nameById={nameById}
                    voterCount={voterCount}
                    participantDetails={roundParts.map((p) => ({ id: p.id, name: p.name, gender: p.gender }))}
                    myFlagsByParticipantId={
                      myVote
                        ? Object.fromEntries(roundParts.map((p) => [p.id, flagForParticipant(myVote, p.id)]))
                        : undefined
                    }
                    renderCard={
                      isBinaryPeoplePollGame(gameType)
                        ? undefined
                        : ({ tally, name, maxes, isWinner }) => {
                            const myAction =
                              myVote?.kiss_participant_id === tally.id
                                ? 'kiss'
                                : myVote?.marry_participant_id === tally.id
                                  ? 'marry'
                                  : myVote?.kill_participant_id === tally.id
                                    ? 'kill'
                                    : null

                            const borderCls = myActionBorderClass(gameType, myAction)

                            return (
                              <div key={tally.id} className={`glass-card border-2 ${borderCls} rounded-2xl p-4`}>
                                <div className="flex items-center gap-3 mb-3">
                                  <Avatar name={name} />
                                  <p className="font-bold text-body text-lg">{name}</p>
                                  {myAction && (
                                    <span className="ml-auto text-xs text-muted italic">
                                      you: {assignmentEmojiFor(gameType, myAction)}
                                    </span>
                                  )}
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                  {getVoteCategories(gameType).map((category) => {
                                    const meta = getCategoryMeta(gameType, category)
                                    return (
                                      <VoteCountStat
                                        key={category}
                                        emoji={meta.emoji}
                                        label={meta.label}
                                        count={tally[category]}
                                        max={maxes[category]}
                                        color={meta.color}
                                        isWinner={isWinner(category)}
                                      />
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          }
                    }
                  />
                )
              })()}
        </RoundResultsShareBlock>

        {/* Hot takes for this round */}
        <ConfessionsTicker confessions={roundConfessions} />

        <ReactionBar className="pt-1" gameCode={gameCode} playerId={myPlayerId} />

        <p className={`text-sm text-center animate-pulse ${isLastRound ? 'text-[var(--primary)]' : 'text-faint'}`}>
          {roundResultsWaitMessage({
            isLastRound,
            autoReveal: !!game?.auto_reveal,
            nextRoundSecondsLeft: nextRoundCountdown,
            finalRevealSecondsLeft: finalRevealCountdown,
            finalLabel: 'leaderboard',
          })}
        </p>
      </div>
    )
  }

  // FINAL RESULTS
  if (view === 'results') {
    return (
      <FinalResultsView
        game={game!}
        gameCode={gameCode}
        participants={participants}
        rounds={allRounds}
        votes={allVotes}
        confessions={allConfessions}
        players={players}
        myPlayerId={myPlayerId}
        myPlayerName={myPlayerName}
        onPlayerLeft={handlePlayerLeft}
        onPlayerRenamed={handlePlayerRenamed}
        hotSeatSubmissions={allHotSeatSubmissions}
      />
    )
  }

  return <FullLoader />
}

// ── Sub-components ────────────────────────────────────────────────────────

function TimerDisplay({ seconds, total }: { seconds: number; total: number }) {
  const pct = total > 0 ? (seconds / total) * 100 : 0
  const color = seconds <= 5 ? 'text-red-400' : seconds <= 10 ? 'text-amber-400' : 'text-green-400'
  const barColor = seconds <= 5 ? 'bg-red-500' : seconds <= 10 ? 'bg-amber-500' : 'bg-green-500'
  return (
    <div className="text-right">
      <p className={`text-4xl font-black tabular-nums ${color} ${seconds <= 5 ? 'animate-pulse' : ''}`}>{seconds}</p>
      <div className="w-20 h-1.5 progress-track mt-1 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function FinalResultsView({
  game,
  gameCode,
  participants,
  rounds,
  votes,
  confessions,
  players,
  myPlayerId,
  myPlayerName,
  onPlayerLeft,
  onPlayerRenamed,
  hotSeatSubmissions,
}: {
  game: Game
  gameCode: string
  participants: Participant[]
  rounds: Round[]
  votes: Vote[]
  confessions: Confession[]
  players: Player[]
  myPlayerId: string | null
  myPlayerName: string | null
  onPlayerLeft: () => void
  onPlayerRenamed: (name: string) => void
  hotSeatSubmissions: { id: string; round_id: string; text: string; submission_type: string }[]
}) {
  const gameType = parseGameType(game.game_type)
  const playedParticipants = filterParticipantsInRounds(participants, rounds)
  const isBinaryGameType = isBinaryChoiceGame(gameType)
  const isNhie = isNeverHaveIEver(gameType)
  const isPan = isPickANumber(gameType)
  const isMlt = isMostLikelyTo(gameType)
  const isWst = isWhoSaidThis(gameType)
  const isHotSeatGame = isHotSeat(gameType)
  const isMltImport = isMltImportGame(game)
  const showPollLeaderboards =
    !isBinaryGameType && !isNhie && !isPan && !isMlt && !isWst && !isCustomGame(gameType) && !isHotSeatGame
  const genderBasedLeaderboards = showPollLeaderboards && isGameGenderBased(game)
  const namesOnlyLeaderboards = showPollLeaderboards && isGenderFreeVoting(game)
  const wstScores = isWst ? tallyWstPlayerScores(rounds, votes, players) : []
  const achievements = useMemo(
    () => computeAchievements(game, participants, rounds, votes, players),
    [game, participants, rounds, votes, players]
  )
  const hasFinalLeaderboardSnapshot =
    (isWst && wstScores.length > 0) || isCustomGame(gameType) || genderBasedLeaderboards || namesOnlyLeaderboards
  const showFinalShareResults =
    !isThisOrThat(gameType) && !isWouldYouRather(gameType) && !isNhie && !isPan && !isMlt && !isHotSeatGame

  return (
    <div className="page-wrap px-4 py-8 max-w-2xl mx-auto w-full space-y-8">
      {myPlayerId && myPlayerName ? (
        <PlayerSessionBar
          gameCode={gameCode}
          playerId={myPlayerId}
          name={myPlayerName}
          onRenamed={onPlayerRenamed}
          onLeft={onPlayerLeft}
        />
      ) : null}
      <div className="text-center">
        <div className="text-4xl mb-2">🎊</div>
        <h1 className="text-3xl font-black text-body">{game.title}</h1>
        <GameTypeBadge gameType={gameType} className="mt-2" />
        <p className="text-muted mt-2">
          {players.length} players · {rounds.length} rounds
          {isMltImport
            ? ` · ${mltVoteTargets(game, participants, players).length} in poll`
            : isWst
              ? ` · ${participants.length} names`
              : !isBinaryGameType && !isMlt
                ? ` · ${playedParticipants.length} in game`
                : ''}
        </p>
      </div>

      {hasFinalLeaderboardSnapshot ? (
        <FinalResultsShareBlock game={game} participants={participants} votes={votes} rounds={rounds} players={players}>
          {isWst && wstScores.length > 0 && (
            <PaginatedLeaderboard
              title="Best guessers"
              rows={wstScores.map((row, i) => ({
                id: row.playerId,
                name: row.name,
                score: row.correctGuesses,
                rank: i + 1,
              }))}
              highlightId={myPlayerId}
            />
          )}

          {isCustomGame(gameType) && game
            ? (() => {
                const slots = getCustomSlots(game)
                const leaderboard = buildCustomLeaderboard(votes, participants, slots)
                return (
                  <div className="glass-card border border-theme-strong p-4 space-y-4">
                    <p className="text-muted text-xs uppercase tracking-wider text-center">Final Leaderboard</p>
                    {leaderboard.map(
                      (entry: {
                        slot: { key: string; emoji: string; label: string; color: string }
                        entries: { name: string; count: number }[]
                      }) => (
                        <div key={entry.slot.key} className="space-y-1">
                          <p className="text-sm font-semibold" style={{ color: entry.slot.color }}>
                            {entry.slot.emoji} Most {entry.slot.label}
                          </p>
                          {entry.entries.slice(0, 3).map((e: { name: string; count: number }, i: number) => (
                            <p key={e.name} className="text-body text-sm pl-6">
                              {i === 0 ? '\u{1F3C6}' : `${i + 1}.`} {e.name} ({e.count} votes)
                            </p>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                )
              })()
            : null}

          {genderBasedLeaderboards && (
            <FinalGenderLeaderboards
              gameType={gameType}
              participants={participants}
              rounds={rounds}
              votes={votes}
              TopCard={LeaderCard}
            />
          )}

          {namesOnlyLeaderboards && (
            <FinalOverallLeaderboards
              gameType={gameType}
              participants={participants}
              rounds={rounds}
              votes={votes}
              TopCard={LeaderCard}
            />
          )}
        </FinalResultsShareBlock>
      ) : showFinalShareResults ? (
        <>
          <ShareResults game={game} participants={participants} votes={votes} rounds={rounds} players={players} />
          <CreateNewGameButton />
        </>
      ) : (
        <CreateNewGameButton />
      )}

      <AchievementsShareBlock achievements={achievements} gameTitle={game.title} />

      <RematchHistory
        gameId={game.id}
        currentParticipants={participants}
        currentVotes={votes}
        gameType={game.game_type}
        customSlots={game.custom_slots?.slots}
      />

      {genderBasedLeaderboards && (
        <FinalGenderBreakdown gameType={gameType} participants={participants} rounds={rounds} votes={votes} />
      )}

      {namesOnlyLeaderboards && (
        <FinalOverallBreakdown gameType={gameType} participants={participants} rounds={rounds} votes={votes} />
      )}

      {isHotSeatGame ? (
        <div>
          <h2 className="text-muted text-xs uppercase tracking-wider mb-4">All round results</h2>
          <div className="space-y-8">
            {rounds.map((round) => {
              const hotSeatPlayerName = hotSeatPlayerDisplayName(round.submitter_player_id, players, participants)
              const roundSubs = hotSeatSubmissions.filter((s) => s.round_id === round.id)
              return (
                <div key={round.id}>
                  <h2 className="text-muted text-xs uppercase tracking-wider mb-3">Round {round.round_number}</h2>
                  <HotSeatRoundResults
                    hotSeatPlayerName={hotSeatPlayerName ?? 'Unknown'}
                    submissions={roundSubs}
                    animate={false}
                  />
                </div>
              )
            })}
          </div>
        </div>
      ) : isPan ? (
        <div>
          <h2 className="text-muted text-xs uppercase tracking-wider mb-4">All round results</h2>
          <div className="space-y-8">
            {rounds.map((round) => {
              const pickerName = hotSeatPlayerDisplayName(round.submitter_player_id, players, participants)
              const roundVotes = votes.filter((v) => v.round_id === round.id)
              const pickerVote = roundVotes.find((v) => v.player_id === round.submitter_player_id)
              return (
                <div key={round.id}>
                  <h2 className="text-muted text-xs uppercase tracking-wider mb-3">Round {round.round_number}</h2>
                  {pickerVote?.picked_number && panRoundRevealed(round) ? (
                    <PanRoundResults
                      pickerName={pickerName}
                      pickedNumber={pickerVote.picked_number}
                      question={round.mlt_question ?? ''}
                    />
                  ) : (
                    <p className="text-muted text-center">No number picked this round</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div>
          <h2 className="text-muted text-xs uppercase tracking-wider mb-4">All round results</h2>
          <div className="space-y-8">
            {rounds.map((round) => {
              const roundVotes = votes.filter((v) => v.round_id === round.id)
              const myVote = roundVotes.find((v) => v.player_id === myPlayerId)

              if (isCustomGame(gameType) && game) {
                const slots = getCustomSlots(game)
                const slotKeys = slots.map((s) => s.key)
                const nameMap = new Map(participants.map((p) => [p.id, p.name]))
                const tally = tallyCustomVotes(roundVotes, round.participant_ids, nameMap, slotKeys)
                const myAssignment = myVote?.pair_assignments as Record<string, string> | null
                return (
                  <div key={round.id}>
                    <h2 className="text-muted text-xs uppercase tracking-wider mb-3">Round {round.round_number}</h2>
                    <CustomRoundResults tally={tally} slots={slots} myAssignment={myAssignment} />
                  </div>
                )
              }

              if (isNhie) {
                const { countA, countB, voterCount } = tallyWyrVotes(roundVotes)
                return (
                  <div key={round.id}>
                    <h2 className="text-muted text-xs uppercase tracking-wider mb-3">Round {round.round_number}</h2>
                    <WyrRoundResults
                      optionA={round.mlt_question ?? ''}
                      optionB=""
                      countA={countA}
                      countB={countB}
                      voterCount={voterCount}
                      myChoice={myVote?.wyr_choice ?? null}
                      mode="nhie"
                    />
                  </div>
                )
              }

              if (isBinaryGameType) {
                const { countA, countB, voterCount } = tallyWyrVotes(roundVotes)
                return (
                  <div key={round.id}>
                    <h2 className="text-muted text-xs uppercase tracking-wider mb-3">Round {round.round_number}</h2>
                    <WyrRoundResults
                      optionA={round.wyr_option_a ?? ''}
                      optionB={round.wyr_option_b ?? ''}
                      countA={countA}
                      countB={countB}
                      voterCount={voterCount}
                      myChoice={myVote?.wyr_choice ?? null}
                      mode={isThisOrThat(gameType) ? 'tot' : 'wyr'}
                    />
                  </div>
                )
              }

              if (isWst) {
                if (isAnimeRound(round)) {
                  const meta = round.anime_metadata as {
                    anime_name: string
                    correct_character: string
                    choices: string[]
                  }
                  const animeTally = tallyAnimeWstVotes(roundVotes, meta.choices, meta.correct_character)
                  const myPickName = myVote?.anime_choice ?? null
                  return (
                    <div key={round.id}>
                      <h2 className="text-muted text-xs uppercase tracking-wider mb-3">Round {round.round_number}</h2>
                      <AnimeWstRoundResults
                        quote={round.quote_text ?? '(no quote)'}
                        animeName={meta.anime_name}
                        rows={animeTally.rows}
                        voterCount={animeTally.voterCount}
                        maxCount={animeTally.maxCount}
                        topGuesses={animeTally.topGuesses}
                        correctCharacter={meta.correct_character}
                        correctCount={animeTally.correctCount}
                        myPickName={myPickName}
                      />
                    </div>
                  )
                }
                const targets = wstVoteTargets(participants)
                const correctName = wstCorrectNameFromRound(round, players, participants)
                const correctId = wstCorrectParticipantIdFromRound(round, players)
                const { rows, voterCount, maxCount, topGuesses, correctCount } = tallyWstVotes(
                  roundVotes,
                  targets,
                  correctId
                )
                const myPickName = myVote?.target_participant_id
                  ? (participants.find((p) => p.id === myVote.target_participant_id)?.name ?? null)
                  : null
                return (
                  <div key={round.id}>
                    <h2 className="text-muted text-xs uppercase tracking-wider mb-3">Round {round.round_number}</h2>
                    <WstRoundResults
                      quote={round.quote_text ?? '(no quote submitted)'}
                      rows={rows}
                      voterCount={voterCount}
                      maxCount={maxCount}
                      topGuesses={topGuesses}
                      correctName={correctName}
                      correctCount={correctCount}
                      myPickName={myPickName}
                    />
                  </div>
                )
              }

              if (isMlt) {
                const mltKind = isMltImport ? 'participant' : 'player'
                const mltTargets = mltVoteTargets(game, participants, players)
                const { rows, voterCount, maxCount, winnerNames } = tallyMltVotes(roundVotes, mltTargets, mltKind)
                const pickedId = myVote ? mltTargetIdFromVote(myVote, mltKind) : null
                const myPickName = pickedId ? (mltTargets.find((t) => t.id === pickedId)?.name ?? null) : null
                return (
                  <div key={round.id}>
                    <h2 className="text-muted text-xs uppercase tracking-wider mb-3">Round {round.round_number}</h2>
                    <MltRoundResults
                      question={round.mlt_question ?? ''}
                      rows={rows}
                      voterCount={voterCount}
                      maxCount={maxCount}
                      winnerNames={winnerNames}
                      myPickName={myPickName}
                    />
                  </div>
                )
              }

              const roundParts = participants.filter((p) => round.participant_ids.includes(p.id))
              const roundGender =
                game && isGenderFreeVoting(game) ? null : roundGenderLabel(roundParts.map((p) => p.gender))

              return (
                <div key={round.id}>
                  <h2 className="text-muted text-xs uppercase tracking-wider mb-3">
                    Round {round.round_number}
                    {roundGender ? ` · ${roundGender}` : ''}
                  </h2>
                  {myVote && (
                    <div className="glass-card border border-[var(--primary)]/25 px-4 py-2.5 mb-3 flex gap-4 flex-wrap">
                      <span className="text-muted text-xs uppercase tracking-wider self-center">Your vote:</span>
                      {isBinaryPeoplePollGame(gameType)
                        ? roundParts.map((p) => {
                            const flag = flagForParticipant(myVote, p.id)
                            if (!flag) return null
                            const meta = slotMeta(gameType, flag)
                            return (
                              <span key={p.id} className="text-sm" style={{ color: meta.textColor }}>
                                {p.name}: {meta.emoji}
                              </span>
                            )
                          })
                        : voteSlots(gameType).map((slot) => {
                            const participantId =
                              slot === 'kiss'
                                ? myVote.kiss_participant_id
                                : slot === 'marry'
                                  ? myVote.marry_participant_id
                                  : myVote.kill_participant_id
                            if (!participantId) return null
                            const meta = slotMeta(gameType, slot)
                            return (
                              <span key={slot} className="text-sm" style={{ color: meta.textColor }}>
                                {meta.emoji} {participants.find((p) => p.id === participantId)?.name}
                              </span>
                            )
                          })}
                    </div>
                  )}
                  <div className="space-y-4">
                    {(() => {
                      const tallies = tallyRoundVotes(
                        roundParts.map((p) => p.id),
                        roundVotes
                      )
                      const nameById = new Map(roundParts.map((p) => [p.id, p.name]))
                      return (
                        <ParticipantRoundResults
                          gameType={gameType}
                          tallies={tallies}
                          nameById={nameById}
                          voterCount={roundVotes.length}
                          participantDetails={roundParts.map((p) => ({ id: p.id, name: p.name, gender: p.gender }))}
                          renderCard={
                            isBinaryPeoplePollGame(gameType)
                              ? undefined
                              : ({ tally, name, maxes, isWinner }) => (
                                  <div key={tally.id} className="glass-card p-4">
                                    <div className="flex items-center gap-3 mb-2">
                                      <Avatar name={name} size="sm" />
                                      <p className="font-bold text-body">{name}</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                      {getVoteCategories(gameType).map((category) => {
                                        const meta = getCategoryMeta(gameType, category)
                                        return (
                                          <VoteCountStat
                                            key={category}
                                            emoji={meta.emoji}
                                            label={meta.label}
                                            count={tally[category]}
                                            max={maxes[category]}
                                            color={meta.color}
                                            isWinner={isWinner(category)}
                                          />
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                          }
                        />
                      )
                    })()}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* All hot takes */}
      {confessions.length > 0 && (
        <div>
          <h2 className="text-muted text-xs uppercase tracking-wider mb-3">🔥 All Hot Takes</h2>
          <div className="space-y-2">
            {confessions.map((c) => (
              <div key={c.id} className="glass-card px-4 py-3">
                <p className="text-body-muted text-sm italic">&ldquo;{c.text}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-faint text-xs text-center">
        You'll return to the lobby automatically when the host starts another game.
      </p>
    </div>
  )
}

function LeaderCard({
  emoji,
  label,
  name,
  count,
  accentColor,
}: {
  emoji: string
  label: string
  name?: string
  count?: number
  accentColor: string
}) {
  return (
    <div
      className="glass-card border rounded-2xl p-3 text-center"
      style={{
        borderColor: hexToRgba(accentColor, 0.33),
        backgroundColor: hexToRgba(accentColor, 0.08),
      }}
    >
      <p className="text-2xl">{emoji}</p>
      <p className="text-muted text-xs mt-1 leading-tight">{label}</p>
      <p className="font-bold text-body text-sm mt-1 truncate">{name ?? '—'}</p>
      {count !== undefined && <p className="text-muted text-xs">{count} votes</p>}
    </div>
  )
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-wrap flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm glass-card-strong p-6 space-y-6">{children}</div>
    </div>
  )
}

function FullLoader() {
  return (
    <div className="page-wrap flex items-center justify-center">
      <div className="w-11 h-11 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function NotFound({ onHome }: { onHome: () => void }) {
  return (
    <div className="page-wrap flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <p className="text-6xl">🤷</p>
        <h1 className="text-2xl font-black gradient-title-subtle">Game not found</h1>
        <p className="text-muted">Check the code and try again</p>
        <button onClick={onHome} className={primaryBtnCls + ' max-w-xs mx-auto'}>
          Back Home
        </button>
      </div>
    </div>
  )
}

const inputCls = 'input-field'
const primaryBtnCls = 'btn-primary'
