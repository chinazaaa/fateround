'use client'
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getPlayerSession, setPlayerSession, clearPlayerSession, filterParticipantsInRounds } from '@/lib/utils'
import { resolvePlayerSession } from '@/lib/player-resume'
import { hexToRgba } from '@/lib/color'
import { Avatar } from '@/components/Avatar'
import { ParticipantPhotoCard } from '@/components/ParticipantPhotoCard'
import { ParticipantGallery } from '@/components/ParticipantGallery'
import { parseThemeId, THEME_MAP } from '@/lib/themes'
import {
  playRoundStartSound,
  playVoteSubmittedSound,
  playRoundEndSound,
  playGameFinishedSound,
  playConfessionSound,
  unlockAudio,
} from '@/lib/sounds'
import {
  roundGenderLabel,
  playerIdentityLabel,
  genderLabel,
  getRoundParticipantGender,
  canPlayerVoteInRound,
  roundVoterLabel,
  spectatorMessage,
  activeVoteBanner,
  parsePlayerGenderFromDb,
  parseParticipantGenderFromDb,
  playerGenderFromJoin,
  joinGenderHint,
  playerVoteGenderForRound,
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
  emptyAssignment,
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
  assignPairSlot,
  isHotSeat,
  isCustomGame,
  isAnonymousMessagesGame,
  isSecretMessageGame,
  isBingoGame,
  isCodewordsGame,
  isTriviaGame,
  isTwoTruthsGame,
  isMonopolyGame,
  isYahtzeeGame,
  isWhotGame,
  isLudoGame,
} from '@/lib/game-types'
import { AnonymousMessagesPlayerView } from '@/components/anonymous-messages/AnonymousMessagesPlayerView'
import { SecretMessageSenderView } from '@/components/secret-message/SecretMessageSenderView'
import { BingoPlayerView } from '@/components/bingo/BingoPlayerView'
import { TriviaPlayerView } from '@/components/trivia/TriviaPlayerView'
import { TwoTruthsPlayerView } from '@/components/two-truths/TwoTruthsPlayerView'
import { CodewordsPlayerView } from '@/components/codewords/CodewordsPlayerView'
import { MonopolyPlayerView } from '@/components/monopoly/MonopolyPlayerView'
import { YahtzeePlayerView } from '@/components/yahtzee/YahtzeePlayerView'
import { WhotPlayerView } from '@/components/whot/WhotPlayerView'
import { LudoPlayerView } from '@/components/ludo/LudoPlayerView'
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
import { useTimerTickSound } from '@/hooks/useTimerTickSound'
import { useGameChannel } from '@/hooks/useGameChannel'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { ShareGameLinkCard } from '@/components/ShareGameLinkCard'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { PlayerSessionBar } from '@/components/ui/PlayerSessionBar'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { gameOffersLateJoinChoice, preJoinScreen, playerIsViewer, allowLatePlayers } from '@/lib/viewers'
import {
  CONFESSION_SELECT,
  GAME_SELECT,
  PARTICIPANT_SELECT,
  PLAYER_QUESTION_SELECT,
  PLAYER_SELECT,
  ROUND_SELECT,
  VOTE_SELECT,
} from '@/lib/supabase-selects'
import { useRoundTimer } from '@/hooks/useRoundTimer'
import { useAutoSubmit } from '@/hooks/useAutoSubmit'
import { HOT_SEAT_SUBMISSION_TYPES, hotSeatPlayerDisplayName } from '@/lib/hot-seat'
import { panUsedNumbersFromVotes, pickANumberPoolSize, panRoundRevealed } from '@/lib/pick-a-number'
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

type View =
  | 'loading'
  | 'not_found'
  | 'join'
  | 'game_started_waiting'
  | 'late_join_choice'
  | 'waiting'
  | 'round'
  | 'round_results'
  | 'results'

function preJoinView(game: Game, hasPlayer: boolean): View {
  const pre = preJoinScreen(game, hasPlayer)
  if (pre === 'game_started_waiting') return 'game_started_waiting'
  if (pre === 'late_join_choice') return 'late_join_choice'
  return 'join'
}

export function PollGamePlayerExperience({
  gameCode: gameCodeProp,
  embedded: _embedded = false,
}: {
  gameCode: string
  embedded?: boolean
}) {
  const params = useParams<{ code: string }>()
  const router = useRouter()
  const toast = useToast()
  const { confirm } = useConfirm()
  const gameCode = (
    gameCodeProp ?? (Array.isArray(params.code) ? params.code[0] : params.code)
  ).toUpperCase()

  const [view, setView] = useState<View>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [players, setPlayers] = useState<Player[]>([])

  // Active round state
  const [currentRound, setCurrentRound] = useState<Round | null>(null)
  const [assignment, setAssignment] = useState<VoteAssignment>(emptyAssignment())
  const [pairAssignment, setPairAssignment] = useState<PairAssignmentMap>({})
  const [wyrChoice, setWyrChoice] = useState<WyrChoice | null>(null)
  const [pickedNumber, setPickedNumber] = useState<number | null>(null)
  const [panUsedNumbers, setPanUsedNumbers] = useState<ReadonlySet<number>>(new Set())
  const [mltTargetPlayerId, setMltTargetPlayerId] = useState<string | null>(null)
  const [animeChoice, setAnimeChoice] = useState<string | null>(null)
  const [quoteInput, setQuoteInput] = useState('')
  const [quoteAuthorParticipantId, setQuoteAuthorParticipantId] = useState<string | null>(null)
  const [quoteSubmitting, setQuoteSubmitting] = useState(false)
  const [wstPool, setWstPool] = useState<WstQuotePoolEntry[]>([])
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [customAssignments, setCustomAssignments] = useState<Record<string, string>>({})
  const [confessionText, setConfessionText] = useState('')
  const [confessionSent, setConfessionSent] = useState(false)

  // Hot Seat
  const [hotSeatText, setHotSeatText] = useState('')
  const [hotSeatType, setHotSeatType] = useState<'compliment' | 'roast' | 'observation'>('observation')
  const [hotSeatSubmitted, setHotSeatSubmitted] = useState(false)
  const [hotSeatSubmissions, setHotSeatSubmissions] = useState<{ id: string; text: string; submission_type: string }[]>(
    []
  )

  // Between-rounds results
  const [lastFinishedRound, setLastFinishedRound] = useState<Round | null>(null)
  const [lastRoundVotes, setLastRoundVotes] = useState<Vote[]>([])

  // All-game accumulation (for final results)
  const [allVotes, setAllVotes] = useState<Vote[]>([])
  const [allRounds, setAllRounds] = useState<Round[]>([])
  const [allHotSeatSubmissions, setAllHotSeatSubmissions] = useState<
    { id: string; round_id: string; text: string; submission_type: string }[]
  >([])
  const [allConfessions, setAllConfessions] = useState<Confession[]>([])

  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myPlayerName, setMyPlayerName] = useState<string | null>(null)
  const [myPlayerGender, setMyPlayerGender] = useState<PlayerGender | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null)
  const [joinIdentityGender, setJoinIdentityGender] = useState<ParticipantGender>('female')
  const [voteBothGenders, setVoteBothGenders] = useState(false)
  const [joining, setJoining] = useState(false)
  const [editingJoin, setEditingJoin] = useState(false)

  // Player question submission (WYR/MLT lobby)
  const [pqWyrA, setPqWyrA] = useState('')
  const [pqWyrB, setPqWyrB] = useState('')
  const [pqTotText, setPqTotText] = useState('')
  const [pqMltText, setPqMltText] = useState('')
  const [pqSubmitting, setPqSubmitting] = useState(false)
  const [pqList, setPqList] = useState<
    {
      id: string
      player_id: string
      question_type: string
      option_a?: string
      option_b?: string
      question_text?: string
    }[]
  >([])
  const [pqOpen, setPqOpen] = useState(false)

  // Player name submission (people poll games — RFGF, SMK, etc.)
  const [pnNameInput, setPnNameInput] = useState('')
  const [pnGender, setPnGender] = useState<ParticipantGender>('female')
  const [pnSubmitting, setPnSubmitting] = useState(false)
  const [pnList, setPnList] = useState<Participant[]>([])
  const [pnOpen, setPnOpen] = useState(false)

  // Photo upload (people-based modes)
  const [photoUploading, setPhotoUploading] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

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
  const joinNeedsGender = game ? isGameGenderBased(game) : false
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
  const joinPlayerGender: PlayerGender =
    isNameOnlyJoin || !joinNeedsGender ? 'both' : playerGenderFromJoin(joinIdentityGender, voteBothGenders)

  const setJoinIdentity = (gender: ParticipantGender) => {
    joinGenderTouchedRef.current = true
    setJoinIdentityGender(gender)
  }

  const namePickerOptions = useMemo(() => {
    if (isJoinersMode || isVoterOnly) return []
    const claimedParticipantIds = new Set(
      players.filter((p) => p.id !== myPlayerId && p.participant_id).map((p) => p.participant_id as string)
    )
    const takenNames = new Set(players.filter((p) => p.id !== myPlayerId).map((p) => p.name.toLowerCase()))
    return participants
      .filter((p) => !claimedParticipantIds.has(p.id) && !takenNames.has(p.name.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((p) => ({
        id: p.id,
        name: p.name,
        ...(joinNeedsGender ? { subtitle: genderLabel(p.gender) } : {}),
      }))
  }, [isJoinersMode, isVoterOnly, participants, players, myPlayerId, joinNeedsGender])

  const handleSelectParticipant = (id: string, name: string) => {
    const changed = id !== selectedParticipantId
    setSelectedParticipantId(id)
    setNameInput(name)
    const p = participants.find((x) => x.id === id)
    if (p && !isJoinersMode && changed && !joinGenderTouchedRef.current) {
      setJoinIdentityGender(p.gender)
      setVoteBothGenders(false)
    }
  }

  const useFreeNameJoin = isJoinersMode || isVoterOnly

  const canSubmitJoin = useFreeNameJoin ? nameInput.trim().length > 0 : selectedParticipantId !== null

  const myPlayer = useMemo(() => players.find((p) => p.id === myPlayerId) ?? null, [players, myPlayerId])
  const isViewer = !!(game && myPlayer && playerIsViewer(myPlayer, game))

  const reloadPlayers = useCallback(async () => {
    const { data: plrs } = await supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at')
    if (plrs) setPlayers(plrs)
  }, [gameCode])

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

  // If someone else claims this name while you're still on the join screen, clear your pick
  useEffect(() => {
    if (useFreeNameJoin || view !== 'join' || !selectedParticipantId) return
    const stillAvailable = namePickerOptions.some((o) => o.id === selectedParticipantId)
    if (!stillAvailable) {
      setSelectedParticipantId(null)
      setNameInput('')
      joinGenderTouchedRef.current = false
    }
  }, [namePickerOptions, selectedParticipantId, useFreeNameJoin, view])
  const { refs: autoSubmitRefs, triggerAutoSubmit } = useAutoSubmit(gameCode, {
    onCustomAssignmentsChange: setCustomAssignments,
  })
  const {
    assignmentRef,
    pairAssignmentRef,
    customAssignmentsRef,
    wyrChoiceRef,
    mltTargetPlayerIdRef: autoMltRef,
    animeChoiceRef,
    playersRef,
    currentRoundRef,
    gameRef,
    participantsRef,
    myPlayerIdRef,
    myPlayerGenderRef,
    submittedRef,
    pickedNumberRef,
    panUsedNumbersRef,
  } = autoSubmitRefs

  // Sync state → refs so auto-submit reads current values
  assignmentRef.current = assignment
  pairAssignmentRef.current = pairAssignment
  customAssignmentsRef.current = customAssignments
  wyrChoiceRef.current = wyrChoice
  autoMltRef.current = mltTargetPlayerId
  animeChoiceRef.current = animeChoice
  pickedNumberRef.current = pickedNumber
  panUsedNumbersRef.current = panUsedNumbers
  playersRef.current = players
  currentRoundRef.current = currentRound
  gameRef.current = game
  participantsRef.current = participants
  myPlayerIdRef.current = myPlayerId
  myPlayerGenderRef.current = myPlayerGender

  const announcedRoundIdRef = useRef<string | null>(null)
  const suppressRoundSoundRef = useRef(true)
  const joinGenderTouchedRef = useRef(false)
  const roundFormIdRef = useRef<string | null>(null)

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const { data: gameData } = await supabase.from('games').select('*').eq('id', gameCode).maybeSingle()
        if (!gameData) {
          setView('not_found')
          return
        }
        setGame(gameData)

        const [{ data: parts }, { data: plrs }] = await Promise.all([
          supabase.from('participants').select('*').eq('game_id', gameCode).order('display_order'),
          supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
        ])
        setParticipants(parts || [])
        setPlayers(plrs || [])

        const session = await resolvePlayerSession(gameCode, plrs || [])
        if (session) {
          setMyPlayerId(session.playerId)
          setMyPlayerName(session.playerName)
          const me = (plrs || []).find((p) => p.id === session.playerId)
          const voteGender = me ? playerVoteGenderForRound(me, parts || []) : session.playerGender
          setMyPlayerGender(voteGender)
          if (me && voteGender) {
            setPlayerSession(gameCode, me.id, me.name, voteGender, session.resumeToken ?? me.resume_token)
          }
        }

        if (gameData.status === 'active') {
          const { data: activeRound } = await supabase
            .from('rounds')
            .select('*')
            .eq('game_id', gameCode)
            .eq('status', 'active')
            .maybeSingle()

          if (activeRound) {
            roundFormIdRef.current = activeRound.id
            setCurrentRound(activeRound)
            announcedRoundIdRef.current = activeRound.id
            if (session) {
              const { data: existingVote } = await supabase
                .from('votes')
                .select('*')
                .eq('player_id', session.playerId)
                .eq('round_id', activeRound.id)
                .maybeSingle()
              if (existingVote) {
                const gameType = parseGameType(gameData.game_type)
                if (isBinaryChoiceGame(gameType)) {
                  setWyrChoice(existingVote.wyr_choice)
                } else if (isNeverHaveIEver(gameType)) {
                  setWyrChoice(existingVote.wyr_choice)
                } else if (isPickANumber(gameType)) {
                  setPickedNumber(existingVote.picked_number ?? null)
                } else if (isMostLikelyTo(gameType)) {
                  const targetId = isMltImportGame(gameData)
                    ? existingVote.target_participant_id
                    : existingVote.target_player_id
                  setMltTargetPlayerId(targetId)
                } else if (isWhoSaidThis(gameType)) {
                  setMltTargetPlayerId(existingVote.target_participant_id)
                } else if (isBinaryPeoplePollGame(gameType)) {
                  setPairAssignment(pairAssignmentFromVote(existingVote, activeRound.participant_ids))
                } else {
                  setAssignment({
                    kiss: existingVote.kiss_participant_id,
                    marry: existingVote.marry_participant_id,
                    kill: existingVote.kill_participant_id,
                  })
                }
                submittedRef.current = true
                setSubmitted(true)
              }
            }
            setView(session ? 'round' : preJoinView(gameData, false))
          } else {
            const { data: finishedRound } = await supabase
              .from('rounds')
              .select('*')
              .eq('game_id', gameCode)
              .eq('status', 'finished')
              .order('round_number', { ascending: false })
              .limit(1)
              .maybeSingle()

            if (finishedRound && session) {
              const [{ data: rv }, { data: rc }] = await Promise.all([
                supabase.from('votes').select('*').eq('round_id', finishedRound.id),
                supabase.from('confessions').select('*').eq('round_id', finishedRound.id).order('created_at'),
              ])
              setLastFinishedRound(finishedRound)
              setLastRoundVotes(rv || [])
              if (rc?.length) {
                setAllConfessions((prev) => {
                  const ids = new Set(prev.map((c) => c.id))
                  return [...prev, ...rc.filter((c) => !ids.has(c.id))]
                })
              }
              setView('round_results')
            } else {
              setView(session ? 'waiting' : preJoinView(gameData, false))
            }
          }
          return
        }

        if (gameData.status === 'finished') {
          await loadAllResults()
          setView('results')
          return
        }

        setView(session ? 'waiting' : 'join')
        if (gameData.status === 'waiting' && isWhoSaidThis(parseGameType(gameData.game_type))) {
          const { data: pool } = await supabase
            .from('wst_quote_pool')
            .select('*')
            .eq('game_id', gameCode)
            .order('created_at')
          setWstPool(dedupeWstPool(pool ?? []))
        }
      } finally {
        suppressRoundSoundRef.current = false
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- polling on mount only
  }, [gameCode])

  useEffect(() => {
    if (view !== 'round' || !currentRound?.id || suppressRoundSoundRef.current) return
    if (announcedRoundIdRef.current === currentRound.id) return
    announcedRoundIdRef.current = currentRound.id
    playRoundStartSound()
  }, [view, currentRound?.id])

  // Play round-end sound when transitioning to round results, game-finished sound for final results
  const prevViewRef = useRef<View | null>(null)
  useEffect(() => {
    if (view === 'round_results' && prevViewRef.current !== 'round_results' && !suppressRoundSoundRef.current) {
      playRoundEndSound()
    }
    if (view === 'results' && prevViewRef.current !== 'results') {
      playGameFinishedSound()
    }
    prevViewRef.current = view
  }, [view])

  // Fetch Hot Seat submissions when entering round results
  useEffect(() => {
    if (view !== 'round_results' || !isHotSeat(game?.game_type) || !lastFinishedRound) return
    async function fetchHotSeatResults() {
      const res = await fetch(`/api/hot-seat?roundId=${lastFinishedRound!.id}&gameId=${gameCode}`)
      if (res.ok) {
        const { submissions } = await res.json()
        setHotSeatSubmissions(submissions ?? [])
      }
    }
    fetchHotSeatResults()
  }, [view, game?.game_type, lastFinishedRound, gameCode])

  async function loadAllResults() {
    const [{ data: rounds }, { data: votes }, { data: confs }, { data: subs }] = await Promise.all([
      supabase.from('rounds').select('*').eq('game_id', gameCode).order('round_number'),
      supabase.from('votes').select('*').eq('game_id', gameCode),
      supabase.from('confessions').select('*').eq('game_id', gameCode).order('created_at'),
      supabase.from('hot_seat_submissions').select('id, round_id, text, submission_type').eq('game_id', gameCode),
    ])
    setAllRounds(rounds || [])
    setAllVotes(votes || [])
    setAllConfessions(confs || [])
    setAllHotSeatSubmissions(subs ?? [])
  }

  function resetRoundPlayerState() {
    submittedRef.current = false
    setSubmitted(false)
    setAssignment(emptyAssignment())
    setPairAssignment({})
    setWyrChoice(null)
    setPickedNumber(null)
    setMltTargetPlayerId(null)
    setCustomAssignments({})
    setAnimeChoice(null)
    setQuoteInput('')
    setQuoteAuthorParticipantId(null)
    setQuoteSubmitting(false)
    setConfessionText('')
    setConfessionSent(false)
    setHotSeatText('')
    setHotSeatType('observation')
    setHotSeatSubmitted(false)
    setHotSeatSubmissions([])
  }

  function applyActiveRound(round: Round, options?: { switchView?: boolean }) {
    setCurrentRound((prev) => mergeActiveRound(prev, round))
    if (roundFormIdRef.current !== round.id) {
      roundFormIdRef.current = round.id
      resetRoundPlayerState()
      if (options?.switchView !== false) setView('round')
    }
  }

  function resetPlayerForLobby(hasSession: boolean) {
    setCurrentRound(null)
    setLastFinishedRound(null)
    setAllRounds([])
    setAllVotes([])
    setAllConfessions([])
    setLastRoundVotes([])
    roundFormIdRef.current = null
    resetRoundPlayerState()
    setWstPool([])
    setQuoteInput('')
    setQuoteAuthorParticipantId(null)
    setEditingQuoteId(null)
    announcedRoundIdRef.current = null
    setView(hasSession ? 'waiting' : 'join')
  }

  useLobbyOpenNotification(game?.status, () => {
    if (myPlayerIdRef.current) {
      resetPlayerForLobby(true)
    } else {
      setView('join')
    }
  })

  // ── Real-time subscriptions ───────────────────────────────────────────────
  useGameChannel(
    gameCode,
    `game-player-${gameCode}`,
    {
      setGame,
      setPlayers,
      setParticipants,
      setWstPool,
      setConfessions: setAllConfessions,
    },
    {
      onGameUpdate: async (newGame) => {
        if (newGame.status === 'active' && !myPlayerIdRef.current) {
          setView(preJoinView(newGame, false))
        }
        if (newGame.status === 'active' && myPlayerIdRef.current) {
          const [{ data: activeRound }, { data: parts }] = await Promise.all([
            supabase.from('rounds').select('*').eq('game_id', gameCode).eq('status', 'active').maybeSingle(),
            supabase.from('participants').select('*').eq('game_id', gameCode).order('display_order'),
          ])
          if (parts) setParticipants(parts)
          if (activeRound) {
            applyActiveRound(activeRound)
          }
        }
        if (newGame.status === 'finished') {
          await loadAllResults()
          setView('results')
        }
        if (newGame.status === 'waiting') {
          resetPlayerForLobby(!!myPlayerIdRef.current)
        }
      },
      onRoundInsert: async (round) => {
        if (round.status === 'active' && myPlayerIdRef.current) {
          const { data: parts } = await supabase
            .from('participants')
            .select('*')
            .eq('game_id', gameCode)
            .order('display_order')
          if (parts) setParticipants(parts)
          applyActiveRound(round)
        }
      },
      onRoundUpdate: async (round) => {
        if (round.status === 'active') {
          const priorId = roundFormIdRef.current
          applyActiveRound(round, { switchView: priorId !== round.id })
          if (isPickANumber(parseGameType(gameRef.current?.game_type)) && panRoundRevealed(round) && round.submitter_player_id) {
            const { data: pickerVote } = await supabase
              .from('votes')
              .select('picked_number')
              .eq('round_id', round.id)
              .eq('player_id', round.submitter_player_id)
              .maybeSingle()
            if (pickerVote?.picked_number) setPickedNumber(pickerVote.picked_number)
          }
        }
        if (round.status === 'finished') {
          const [{ data: rv }, { data: rc }] = await Promise.all([
            supabase.from('votes').select('*').eq('round_id', round.id),
            supabase.from('confessions').select('*').eq('round_id', round.id).order('created_at'),
          ])
          setLastFinishedRound(round)
          setLastRoundVotes(rv || [])
          setAllConfessions((prev) => {
            const ids = new Set(prev.map((c) => c.id))
            return [...prev, ...(rc || []).filter((c) => !ids.has(c.id))]
          })
          setAllVotes((prev) => {
            const ids = new Set(prev.map((v) => v.id))
            return [...prev, ...(rv || []).filter((v) => !ids.has(v.id))]
          })
          setAllRounds((prev) => {
            const ids = new Set(prev.map((r) => r.id))
            return ids.has(round.id) ? prev.map((r) => (r.id === round.id ? round : r)) : [...prev, round]
          })
          setView('round_results')
        }
      },
      onPlayerUpdate: (p) => {
        if (p.id === myPlayerIdRef.current) {
          setMyPlayerName(p.name)
          const voteGender = playerVoteGenderForRound(p, participantsRef.current)
          if (voteGender) {
            setMyPlayerGender(voteGender)
            const existing = getPlayerSession(gameCode)
            setPlayerSession(gameCode, p.id, p.name, voteGender, existing?.resumeToken ?? p.resume_token)
          }
        }
      },
      onPlayerDelete: (p) => {
        if (p.id === myPlayerIdRef.current) {
          clearPlayerSession(gameCode)
          setMyPlayerId(null)
          setMyPlayerName(null)
          setMyPlayerGender(null)
          setEditingJoin(false)
          setView('join')
        }
      },
      onConfessionInsert: () => {
        // Trigger re-render for live confessions in round results
        setLastRoundVotes((prev) => prev)
      },
    }
  )

  // Poll during final results — return to lobby when host resets
  usePolling(
    async () => {
      const res = await supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle()
      if (!supabasePollOk(res)) return false
      if (res.data?.status === 'waiting') {
        setGame(res.data)
        resetPlayerForLobby(!!myPlayerIdRef.current)
      }
      return true
    },
    [gameCode, view],
    { intervalMs: POLL_INTERVALS.results, enabled: view === 'results' }
  )

  // Poll lobby / join — slow fallback if realtime is slow
  usePolling(
    async () => {
      const [plrsRes, partsRes, gameRes] = await Promise.all([
        supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
        supabase.from('participants').select(PARTICIPANT_SELECT).eq('game_id', gameCode).order('display_order'),
        supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      ])
      if (!supabasePollOk(plrsRes, partsRes, gameRes)) return false
      if (plrsRes.data) setPlayers(plrsRes.data)
      if (partsRes.data) setParticipants(partsRes.data)
      if (gameRes.data) setGame(gameRes.data)
      if (!myPlayerIdRef.current && gameRes.data) {
        setView((current) => {
          const next = preJoinView(gameRes.data as Game, false)
          if (current === 'join' || current === 'game_started_waiting' || current === 'late_join_choice') {
            return next
          }
          return current
        })
      }
      if (gameRes.data && isWhoSaidThis(parseGameType(gameRes.data.game_type))) {
        await fetchWstPool()
      }

      if (view === 'waiting' && gameRes.data?.status === 'active' && myPlayerIdRef.current) {
        const roundRes = await supabase
          .from('rounds')
          .select(ROUND_SELECT)
          .eq('game_id', gameCode)
          .eq('status', 'active')
          .maybeSingle()
        if (!supabasePollOk(roundRes)) return false
        if (roundRes.data) {
          applyActiveRound(roundRes.data)
        }
      }
      return true
    },
    [gameCode, view],
    { intervalMs: POLL_INTERVALS.lobby, enabled: view === 'waiting' || view === 'join' || view === 'game_started_waiting' || view === 'late_join_choice' }
  )

  // Poll player-submitted questions in lobby (WYR/MLT only)
  usePolling(
    async () => {
      const res = await supabase
        .from('player_questions')
        .select(PLAYER_QUESTION_SELECT)
        .eq('game_id', gameCode)
        .order('created_at')
      if (!supabasePollOk(res)) return false
      if (res.data) setPqList(res.data)
      return true
    },
    [gameCode, game?.game_type, game?.player_questions_enabled, isBinaryGame],
    {
      intervalMs: POLL_INTERVALS.lobby,
      enabled:
        view === 'waiting' &&
        !!game &&
        (isBinaryGame || isNhieGame || isMostLikelyTo(game.game_type)) &&
        lobbyAllowsPlayerQuestions(game),
    }
  )

  // Poll player-submitted names in lobby (people poll games)
  usePolling(
    async () => {
      const res = await fetch(`/api/player-participants?gameId=${gameCode}`)
      if (!res.ok) return false
      const { participants: subs } = await res.json()
      setPnList(subs ?? [])
      return true
    },
    [gameCode, game?.game_type, game?.player_questions_enabled],
    {
      intervalMs: POLL_INTERVALS.lobby,
      enabled:
        view === 'waiting' &&
        !!game &&
        isPeoplePollGame(game.game_type) &&
        lobbyAllowsPlayerNameSubmissions(game),
    }
  )

  // Poll during round / results — slow fallback when realtime misses transitions
  usePolling(
    async () => {
      const [gameRes, activeRoundRes, finishedRoundRes] = await Promise.all([
        supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
        supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).eq('status', 'active').maybeSingle(),
        supabase
          .from('rounds')
          .select(ROUND_SELECT)
          .eq('game_id', gameCode)
          .eq('status', 'finished')
          .order('round_number', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      if (!supabasePollOk(gameRes, activeRoundRes, finishedRoundRes)) return false

      const gameData = gameRes.data
      const activeRound = activeRoundRes.data
      const finishedRound = finishedRoundRes.data

      if (gameData) setGame(gameData)

      if (gameData?.status === 'waiting') {
        resetPlayerForLobby(!!myPlayerIdRef.current)
        return true
      }

      if (gameData?.status === 'finished') {
        await loadAllResults()
        setView('results')
        return true
      }

      if (activeRound && myPlayerIdRef.current) {
        applyActiveRound(activeRound, {
          switchView: view === 'round_results' || activeRound.id !== roundFormIdRef.current,
        })
        return true
      }

      if (finishedRound && myPlayerIdRef.current) {
        const [votesRes, confsRes] = await Promise.all([
          supabase.from('votes').select(VOTE_SELECT).eq('round_id', finishedRound.id),
          supabase.from('confessions').select(CONFESSION_SELECT).eq('round_id', finishedRound.id).order('created_at'),
        ])
        if (!supabasePollOk(votesRes, confsRes)) return false
        setLastFinishedRound(finishedRound)
        setLastRoundVotes(votesRes.data || [])
        if (confsRes.data?.length) {
          setAllConfessions((prev) => {
            const ids = new Set(prev.map((c) => c.id))
            return [...prev, ...confsRes.data!.filter((c) => !ids.has(c.id))]
          })
        }
        setView('round_results')
      }
      return true
    },
    [gameCode, view, currentRound?.id],
    { intervalMs: POLL_INTERVALS.activeGame, enabled: view === 'round' || view === 'round_results' }
  )

  useEffect(() => {
    if (!myPlayerId) return
    const me = players.find((p) => p.id === myPlayerId)
    const parsed = me ? playerVoteGenderForRound(me, participants) : null
    if (parsed) setMyPlayerGender(parsed)
  }, [myPlayerId, players, participants])

  const timeLeft = useRoundTimer({
    game,
    currentRound,
    active: view === 'round' && !!currentRound?.started_at && !!game,
    onExpire: () => {
      if (submittedRef.current) return

      const roundGender = getRoundParticipantGender(
        currentRoundRef.current?.participant_ids ?? [],
        participantsRef.current
      )
      const gameType = parseGameType(gameRef.current?.game_type)
      const playerGender = myPlayerGenderRef.current ?? getPlayerSession(gameCode)?.playerGender ?? null
      const r = currentRoundRef.current
      const isWstRound = isWhoSaidThis(gameType)
      const isPanRound = isPickANumber(gameType)
      const isPanPicker = isPanRound && r?.submitter_player_id === myPlayerIdRef.current
      const isSubmitter = isWstRound && r?.submitter_player_id === myPlayerIdRef.current
      const genderFreeVoting = !!gameRef.current && isGenderFreeVoting(gameRef.current)
      const canVote = isWstRound
        ? !!myPlayerIdRef.current && !isSubmitter && !!r?.quote_text
        : isNameOnlyPlayerJoin(gameType) || genderFreeVoting
          ? !!myPlayerIdRef.current
          : !!roundGender && !!playerGender && canPlayerVoteInRound(playerGender, roundGender)

      if (canVote && (!isPanRound || isPanPicker)) {
        void triggerAutoSubmit().then((result) => {
          if (result.submitted) {
            submittedRef.current = true
            setSubmitted(true)
            if (result.revealedQuestion && currentRoundRef.current) {
              setCurrentRound({ ...currentRoundRef.current, mlt_question: result.revealedQuestion })
            }
            if (typeof result.pickedNumber === 'number') setPickedNumber(result.pickedNumber)
            playVoteSubmittedSound()
          }
        })
      }
    },
  })

  useTimerTickSound(timeLeft, view === 'round')

  useEffect(() => {
    if (!isPanGame || view !== 'round' || !currentRound?.id || !panRoundRevealed(currentRound)) return
    const pickerId = currentRound.submitter_player_id
    if (!pickerId || pickedNumber !== null) return
    let cancelled = false
    void supabase
      .from('votes')
      .select('picked_number')
      .eq('round_id', currentRound.id)
      .eq('player_id', pickerId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.picked_number) setPickedNumber(data.picked_number)
      })
    return () => {
      cancelled = true
    }
  }, [isPanGame, view, currentRound?.id, currentRound?.mlt_question, currentRound?.submitter_player_id, pickedNumber])

  useEffect(() => {
    if (!isPanGame || view !== 'round' || !currentRound) {
      setPanUsedNumbers(new Set())
      return
    }

    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('votes')
        .select('picked_number, round_id')
        .eq('game_id', gameCode)
        .not('picked_number', 'is', null)
      if (cancelled) return
      setPanUsedNumbers(panUsedNumbersFromVotes(data ?? [], currentRound.id))
    })()

    return () => {
      cancelled = true
    }
  }, [isPanGame, view, currentRound?.id, gameCode])

  // ── Apply theme CSS variables (same as host page) ─────────────────────────
  useEffect(() => {
    const themeId = parseThemeId(game?.theme)
    const vars = THEME_MAP[themeId]?.cssVars ?? {}
    const root = document.documentElement
    const keys = Object.keys(vars)
    keys.forEach((k) => root.style.setProperty(k, vars[k]))
    if (Object.keys(vars).length > 0) {
      root.style.setProperty('background', vars['--background'] ?? '')
    }
    return () => {
      keys.forEach((k) => root.style.removeProperty(k))
      root.style.removeProperty('background')
    }
  }, [game?.theme])

  // ── Actions ───────────────────────────────────────────────────────────────
  const assign = (action: keyof VoteAssignment, participantId: string) => {
    const gameType = parseGameType(game?.game_type)
    if (isBinaryPeoplePollGame(gameType) && (action === 'kiss' || action === 'kill')) {
      setPairAssignment((prev) => {
        if (!game || !currentRound) return { ...prev, [participantId]: action }
        return assignPairSlot(
          prev,
          participantId,
          action,
          currentRound.participant_ids,
          parsePairVoteMode(game.pair_vote_mode)
        )
      })
      return
    }
    setAssignment((prev) => {
      const next = { ...prev }
      // Clear this participant from any existing slot
      ;(Object.keys(next) as (keyof VoteAssignment)[]).forEach((k) => {
        if (next[k] === participantId) next[k] = null
      })
      next[action] = participantId
      return next
    })
  }

  async function fetchWstPool() {
    const { data } = await supabase.from('wst_quote_pool').select('*').eq('game_id', gameCode).order('created_at')
    const pool = dedupeWstPool(data ?? [])
    setWstPool(pool)
    return pool
  }

  const handleSubmitPoolQuote = async () => {
    if (!myPlayerId || quoteSubmitting) return
    const text = quoteInput.trim()
    if (!text || !quoteAuthorParticipantId) return
    const authorId = quoteAuthorParticipantId
    setQuoteSubmitting(true)
    try {
      const res = await fetch('/api/wst-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: myPlayerId,
          gameId: gameCode,
          quoteText: text,
          authorParticipantId: authorId,
          ...(editingQuoteId ? { quoteId: editingQuoteId } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to submit quote')
        return
      }
      if (data.entry) {
        setWstPool((prev) => mergeWstPoolEntry(prev, data.entry as WstQuotePoolEntry))
      }
      setQuoteInput('')
      setQuoteAuthorParticipantId(null)
      setEditingQuoteId(null)
      await fetchWstPool()
    } catch {
      toast.error('Could not submit quote — try again')
    } finally {
      setQuoteSubmitting(false)
    }
  }

  const handleDeletePoolQuote = async (quoteId: string) => {
    if (!myPlayerId || quoteSubmitting) return
    setQuoteSubmitting(true)
    try {
      const res = await fetch('/api/wst-quotes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: myPlayerId, gameId: gameCode, quoteId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to remove quote')
        return
      }
      setWstPool((prev) => prev.filter((e) => e.id !== quoteId))
      if (editingQuoteId === quoteId) {
        setQuoteInput('')
        setQuoteAuthorParticipantId(null)
        setEditingQuoteId(null)
      }
    } catch {
      toast.error('Could not remove quote — try again')
    } finally {
      setQuoteSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    if (submittedRef.current || !currentRound || !myPlayerId || !game || isViewer) return
    const submitGameType = parseGameType(game.game_type)
    const roundIds = currentRound.participant_ids
    if (
      isBinaryPeoplePollGame(submitGameType) &&
      !isPairAssignmentValid(pairAssignment, roundIds, parsePairVoteMode(game.pair_vote_mode))
    ) {
      return
    }
    if (isCustomGame(submitGameType)) {
      const slotKeys = getCustomSlotKeys(game)
      const customMode = customAssignmentMode(game, roundIds.length, slotKeys)
      if (!isCustomAssignmentValid(customAssignments, roundIds, slotKeys, customMode)) return
    }
    if (isPickANumber(submitGameType)) {
      if (!pickedNumber || panUsedNumbers.has(pickedNumber)) {
        toast.error('Pick a number that has not been used yet')
        return
      }
    }
    const voteBody = isBinaryChoiceGame(submitGameType) || isNeverHaveIEver(submitGameType)
      ? { wyrChoice }
      : isPickANumber(submitGameType)
        ? { pickedNumber }
        : isMostLikelyTo(submitGameType)
        ? isMltImportGame(game!)
          ? { targetParticipantId: mltTargetPlayerId }
          : { targetPlayerId: mltTargetPlayerId }
        : isWhoSaidThis(submitGameType)
          ? currentRound?.anime_metadata
            ? { animeChoice: animeChoiceRef.current }
            : { targetParticipantId: mltTargetPlayerId }
          : isCustomGame(submitGameType)
            ? { customAssignments }
            : isBinaryPeoplePollGame(submitGameType)
              ? {
                  pairAssignments: Object.fromEntries(
                    roundIds
                      .map((id) => [id, pairAssignment[id]] as const)
                      .filter((entry): entry is [string, 'kiss' | 'kill'] => entry[1] === 'kiss' || entry[1] === 'kill')
                  ),
                }
              : {
                  kiss: assignment.kiss,
                  marry: isThreeChoiceGame(submitGameType) ? assignment.marry : null,
                  kill: assignment.kill,
                }
    try {
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: myPlayerId,
          roundId: currentRound.id,
          gameId: gameCode,
          ...voteBody,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to submit vote')
        return
      }
      if (isPickANumber(submitGameType) && data.revealedQuestion && currentRound) {
        setCurrentRound({ ...currentRound, mlt_question: data.revealedQuestion })
        if (typeof data.pickedNumber === 'number') setPickedNumber(data.pickedNumber)
      }
      submittedRef.current = true
      setSubmitted(true)
      playVoteSubmittedSound()
    } catch {
      toast.error('Could not submit — try again')
    }
  }

  const joinGame = async (joinAsViewer?: boolean) => {
    if (joining) return
    if (useFreeNameJoin ? !nameInput.trim() : !selectedParticipantId) return
    unlockAudio()
    setJoining(true)
    try {
      const body =
        isNameOnlyJoin || ((isJoinersMode || isVoterOnly) && !joinNeedsGender)
          ? { gameCode, playerName: nameInput.trim() }
          : !joinNeedsGender && isImportClaim
            ? { gameCode, participantId: selectedParticipantId! }
            : isJoinersMode || isVoterOnly
              ? {
                  gameCode,
                  playerName: nameInput.trim(),
                  gender: joinPlayerGender,
                  identityGender: joinIdentityGender,
                  ...(voteBothGenders ? { pollGender: joinIdentityGender } : {}),
                }
              : {
                  gameCode,
                  gender: joinPlayerGender,
                  identityGender: joinIdentityGender,
                  participantId: selectedParticipantId!,
                }

      const gameType = parseGameType(game?.game_type)
      const activeJoinExtras =
        game?.status === 'active'
          ? gameOffersLateJoinChoice(gameType)
            ? { joinAsViewer }
            : allowLatePlayers(game!)
              ? {}
              : { joinAsViewer: true }
          : {}

      const res = await fetch('/api/players', {
        method: editingJoin && myPlayerId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editingJoin && myPlayerId ? { ...body, playerId: myPlayerId } : { ...body, ...activeJoinExtras }
        ),
      })
      const data = await res.json()
      if (data.playerId) {
        const [{ data: plrs }, { data: parts }] = await Promise.all([
          supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
          supabase.from('participants').select('*').eq('game_id', gameCode).order('display_order'),
        ])
        setPlayers(plrs || [])
        setParticipants(parts || [])
        const me = plrs?.find((p) => p.id === data.playerId)
        const voteGender = me ? playerVoteGenderForRound(me, parts || []) : parsePlayerGenderFromDb(data.playerGender)
        if (voteGender) {
          setPlayerSession(gameCode, data.playerId, data.playerName, voteGender, data.resumeToken)
          setMyPlayerGender(voteGender)
        }
        setMyPlayerId(data.playerId)
        setMyPlayerName(data.playerName)
        setEditingJoin(false)
        if (game?.status === 'active') {
          const { data: activeRound } = await supabase
            .from('rounds')
            .select('*')
            .eq('game_id', gameCode)
            .eq('status', 'active')
            .maybeSingle()
          if (activeRound) {
            applyActiveRound(activeRound)
          } else {
            setView('waiting')
          }
        } else {
          setView('waiting')
        }
      } else {
        const msg = data.error ?? 'Failed to join'
        toast.error(msg.toLowerCase().includes('taken') ? 'That name was just taken — pick another' : msg)
      }
    } finally {
      setJoining(false)
    }
  }

  const openEditJoin = () => {
    const me = players.find((p) => p.id === myPlayerId)
    const votePref = me
      ? parsePlayerGenderFromDb(me.gender)
      : parsePlayerGenderFromDb(getPlayerSession(gameCode)?.playerGender ?? '')
    const voteBoth = votePref === 'both'
    setNameInput(myPlayerName ?? '')
    const part =
      participants.find((p) => p.id === me?.participant_id) ?? participants.find((p) => p.name === myPlayerName)
    setSelectedParticipantId(part?.id ?? null)
    setJoinIdentityGender(
      me?.identity_gender ? (parseParticipantGenderFromDb(me.identity_gender) ?? 'female') : (part?.gender ?? 'female')
    )
    setVoteBothGenders(voteBoth)
    joinGenderTouchedRef.current = true
    setEditingJoin(true)
    setView('join')
  }

  const cancelEditJoin = () => {
    setEditingJoin(false)
    if (myPlayerId) setView('waiting')
  }

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyPlayerName(null)
    setMyPlayerGender(null)
    setNameInput('')
    setSelectedParticipantId(null)
    setJoinIdentityGender('female')
    setVoteBothGenders(false)
    joinGenderTouchedRef.current = false
    setEditingJoin(false)
    setView('join')
  }

  const handlePlayerRenamed = (name: string) => {
    setMyPlayerName(name)
    const existing = getPlayerSession(gameCode)
    if (existing) setPlayerSession(gameCode, existing.playerId, name, existing.playerGender ?? 'both', existing.resumeToken)
  }

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

  const sendConfession = async () => {
    if (!confessionText.trim() || confessionSent) return
    setConfessionSent(true)
    const res = await fetch('/api/confessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, roundId: currentRound?.id, text: confessionText }),
    })
    if (res.ok) playConfessionSound()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (view === 'loading') return <FullLoader />
  if (view === 'not_found') return <NotFound onHome={() => router.push('/')} />
  if (game && isSecretMessageGame(game.game_type)) {
    return <SecretMessageSenderView gameCode={gameCode} />
  }
  if (game && isBingoGame(game.game_type)) {
    return <BingoPlayerView gameCode={gameCode} />
  }
  if (game && isCodewordsGame(game.game_type)) {
    return <CodewordsPlayerView gameCode={gameCode} />
  }
  if (game && isTriviaGame(game.game_type)) {
    return <TriviaPlayerView gameCode={gameCode} />
  }

  if (game && isTwoTruthsGame(game.game_type)) {
    return <TwoTruthsPlayerView gameCode={gameCode} />
  }
  if (game && isMonopolyGame(game.game_type)) {
    return <MonopolyPlayerView gameCode={gameCode} />
  }
  if (game && isYahtzeeGame(game.game_type)) {
    return <YahtzeePlayerView gameCode={gameCode} />
  }
  if (game && isWhotGame(game.game_type)) {
    return <WhotPlayerView gameCode={gameCode} />
  }
  if (game && isLudoGame(game.game_type)) {
    return <LudoPlayerView gameCode={gameCode} />
  }
  if (game && isAnonymousMessagesGame(game.game_type)) {
    return <AnonymousMessagesPlayerView gameCode={gameCode} />
  }

  if (view === 'game_started_waiting') {
    return (
      <GameStartedWaiting
        gameCode={gameCode}
        game={game}
        onLobbyOpen={() => setView('join')}
      />
    )
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
                  onChange={setJoinIdentity}
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
          <ShareGameLinkCard gameCode={gameCode} />
        </div>
      </CenteredCard>
    )
  }

  // WAITING
  if (view === 'waiting') {
    const isWst = isWhoSaidThis(game?.game_type)
    const wstTargets = isWst ? wstVoteTargets(participants) : []
    const me = myPlayerId ? players.find((p) => p.id === myPlayerId) : null
    const myQuotes =
      isWst && myPlayerId ? wstPool.filter((e) => e.player_id === myPlayerId).sort((a, b) => a.created_at.localeCompare(b.created_at)) : []
    const canSubmitPoolQuote = !!me?.participant_id
    const isPeopleMode =
      !isBinaryChoiceGame(game?.game_type) && !isNeverHaveIEver(game?.game_type) && !isMostLikelyTo(game?.game_type) && !isWst && !isVoterOnly
    const myParticipant = me?.participant_id ? participants.find((p) => p.id === me.participant_id) : null
    const canUploadPhoto = isPeopleMode && !!me?.participant_id

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !me?.participant_id || photoUploading) return
      e.target.value = ''

      if (file.size > 2 * 1024 * 1024) {
        toast.error('Photo must be under 2MB')
        return
      }

      setPhotoUploading(true)
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('gameId', gameCode)
        fd.append('participantId', me.participant_id)
        fd.append('playerId', me.id)

        const res = await fetch('/api/photos', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || 'Failed to upload photo')
          return
        }
        const url = data.photoUrl + '?t=' + Date.now()
        setParticipants((prev) => prev.map((p) => (p.id === me.participant_id ? { ...p, photo_url: url } : p)))
      } catch {
        toast.error('Upload failed — try again')
      } finally {
        setPhotoUploading(false)
      }
    }

    const handlePhotoDelete = async () => {
      if (!me?.participant_id || photoUploading) return
      setPhotoUploading(true)
      try {
        const res = await fetch('/api/photos', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: gameCode,
            participantId: me.participant_id,
            playerId: me.id,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || 'Failed to remove photo')
          return
        }
        setParticipants((prev) => prev.map((p) => (p.id === me.participant_id ? { ...p, photo_url: null } : p)))
      } catch {
        toast.error('Could not remove photo — try again')
      } finally {
        setPhotoUploading(false)
      }
    }

    return (
      <CenteredCard>
        <div className="text-center space-y-1">
          <div className="text-4xl">⏳</div>
          <h1 className="text-2xl font-black tracking-tight gradient-title">{game?.title}</h1>
          <GameTypeBadge gameType={game?.game_type} />
          {game && <GameLobbySummary game={game} />}
          <p className="text-muted text-sm">
            {game?.rounds_count} rounds · {game?.timer_seconds}s each
          </p>
          <p className="text-muted">Waiting for the host to start...</p>
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
                      <p className="text-faint text-[10px] uppercase tracking-wider">
                        Your quotes ({myQuotes.length})
                      </p>
                      {myQuotes.map((entry) => {
                        const authorName =
                          participants.find((p) => p.id === entry.author_participant_id)?.name ?? 'Unknown'
                        return (
                          <div key={entry.id} className="flex items-start gap-2 rounded-xl border border-theme px-3 py-2">
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
                    {editingQuoteId ? 'Edit quote' : myQuotes.length > 0 ? 'Add another quote' : 'Add your quote to the pool'}
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
        {game && (isBinaryGame || isNhieGame || isPanGame || isMostLikelyTo(game.game_type)) && lobbyAllowsPlayerQuestions(game) && myPlayerId && (
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
                        setPqSubmitting(true)
                        try {
                          const res = await fetch('/api/player-questions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              gameId: gameCode,
                              playerId: myPlayerId,
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
                        setPqSubmitting(true)
                        try {
                          const res = await fetch('/api/player-questions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              gameId: gameCode,
                              playerId: myPlayerId,
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
                        setPqSubmitting(true)
                        try {
                          const res = await fetch('/api/player-questions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              gameId: gameCode,
                              playerId: myPlayerId,
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
                              await fetch('/api/player-questions', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ questionId: q.id, playerId: myPlayerId }),
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
                      setPnSubmitting(true)
                      try {
                        const res = await fetch('/api/player-participants', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            gameId: gameCode,
                            playerId: myPlayerId,
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
                              await fetch('/api/player-participants', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ participantId: p.id, playerId: myPlayerId }),
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
        {participants.length > 0 && !isBinaryGame && !isNhieGame && !isMostLikelyTo(game?.game_type) && !isWst && !isVoterOnly && (
          <ParticipantGallery participants={participants} />
        )}

        {sessionBar}

        <ShareGameLinkCard gameCode={gameCode} />

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
      wyrChoice === 'a'
        ? 'border-fuchsia-500/40'
        : wyrChoice === 'b'
          ? 'border-sky-500/40'
          : 'border-theme'

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
            <p className="text-violet-600 dark:text-violet-400 text-xs uppercase tracking-wider mb-1">Picker this round</p>
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
              <p className="text-center text-body font-medium mb-1">
                Pick a number between 1 and {poolSize}
              </p>
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
                const res = await fetch('/api/hot-seat', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    gameId: gameCode,
                    roundId: currentRound.id,
                    playerId: myPlayerId,
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
      : !!(effectiveGender && roundParticipantGender && canPlayerVoteInRound(effectiveGender, roundParticipantGender) && !isViewer)
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
              <p className="text-faint text-xs mt-1">
                Would you let your son or daughter date or marry this person?
              </p>
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
              <p className="text-muted text-center">
                {pickerName} didn&apos;t pick a number before time ran out.
              </p>
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
  const showPollLeaderboards = !isBinaryGameType && !isNhie && !isPan && !isMlt && !isWst && !isCustomGame(gameType) && !isHotSeatGame
  const genderBasedLeaderboards = showPollLeaderboards && isGameGenderBased(game)
  const namesOnlyLeaderboards = showPollLeaderboards && isGenderFreeVoting(game)
  const wstScores = isWst ? tallyWstPlayerScores(rounds, votes, players) : []
  const achievements = useMemo(
    () => computeAchievements(game, participants, rounds, votes, players),
    [game, participants, rounds, votes, players]
  )
  const hasFinalLeaderboardSnapshot =
    (isWst && wstScores.length > 0) ||
    isCustomGame(gameType) ||
    genderBasedLeaderboards ||
    namesOnlyLeaderboards
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
        <FinalResultsShareBlock
          game={game}
          participants={participants}
          votes={votes}
          rounds={rounds}
          players={players}
        >
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
