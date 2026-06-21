'use client'
import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { filterParticipantsInRounds } from '@/lib/utils'
import { hexToRgba } from '@/lib/color'
import { useGameRealtime } from '@/hooks/useGameRealtime'
import { LOAD_TIMEOUT_MS, POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useScrollHostViewToTop, scrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import {
  CONFESSION_SELECT,
  GAME_SELECT,
  PARTICIPANT_SELECT,
  PLAYER_SELECT,
  ROUND_SELECT,
  VOTE_SELECT,
  WST_QUOTE_POOL_SELECT,
} from '@/lib/supabase-selects'
import { Avatar } from '@/components/Avatar'
import {
  roundGenderLabel,
  genderLabel,
  resolvePlayerIdentity,
  getRoundParticipantGender,
  eligibleVotersForRound,
  roundVoterLabel,
  hasEnoughForRounds,
  countByGender,
  hasVotersForPolls,
  participantsWhoJoined,
  maxRecommendedRounds,
  kmkRoundPickerOptions,
  roundLimitHint,
  minPoolForGame,
  parseParticipantGenderFromDb,
} from '@/lib/participants'
import type { ParticipantGender, PairVoteMode, PlayerQuestionsOrder } from '@/types'
import { tallyRoundVotes, getCategoryMeta, getVoteCategories, tallyWyrVotes, tallyMltVotes } from '@/lib/vote-stats'
import {
  parseGameType,
  isBinaryPeoplePollGame,
  isPairGame,
  isUnaryPollGame,
  isWouldYouRather,
  isNeverHaveIEver,
  isPickANumber,
  isThisOrThat,
  isBinaryChoiceGame,
  isMostLikelyTo,
  isWhoSaidThis,
  isHotSeat,
  isHotSeatLobbyGame,
  isPlayerOnlyJoinLobby,
  isNameOnlyPlayerJoin,
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
  isICallOnGame,
  pairVoteModeOptions,
  parsePairVoteMode,
} from '@/lib/game-types'
import { AnonymousMessagesHostView } from '@/components/anonymous-messages/AnonymousMessagesHostView'
import { SecretMessageHostView } from '@/components/secret-message/SecretMessageHostView'
import { BingoHostView } from '@/components/bingo/BingoHostView'
import { TriviaHostView } from '@/components/trivia/TriviaHostView'
import { TwoTruthsHostView } from '@/components/two-truths/TwoTruthsHostView'
import { CodewordsHostView } from '@/components/codewords/CodewordsHostView'
import { MonopolyHostView } from '@/components/monopoly/MonopolyHostView'
import { YahtzeeHostView } from '@/components/yahtzee/YahtzeeHostView'
import { WhotHostView } from '@/components/whot/WhotHostView'
import { LudoHostView } from '@/components/ludo/LudoHostView'
import { NpatHostView } from '@/components/npat/NpatHostView'
import {
  getCustomSlots,
  tallyCustomVotes,
  buildCustomLeaderboard,
  customPairVoteModeOptions,
  isCustomTwoSlotGame,
} from '@/lib/custom-game'
import { isGameGenderBased, supportsGenderToggle, isGenderFreeVoting } from '@/lib/gender-based'
import { isVoterOnlyMode } from '@/lib/participant-mode'
import { CustomRoundResults } from '@/components/CustomRoundResults'
import { isMltImportGame, mltVoteTargets } from '@/lib/mlt'
import {
  questionPoolCap,
  parseQuestionSource,
  customQuestionCount,
  questionRoundPickerOptions,
  clampLobbyQuestionRounds,
} from '@/lib/custom-questions'
import {
  lobbyAllowsPlayerQuestions,
  playerQuestionsOrderOptions,
  parsePlayerQuestionsOrder,
} from '@/lib/player-question-pool'
import {
  isPeoplePollGame,
  lobbyAllowsPlayerNameSubmissions,
  buildPeoplePollParticipantPool,
  playerNameSubmissionHint,
} from '@/lib/player-participant-pool'
import {
  wstVoteTargets,
  wstCorrectNameFromRound,
  wstCorrectParticipantIdFromRound,
  wstSubmitterName,
  wstEligibleSubmitters,
  wstAutoRoundCount,
  tallyWstVotes,
  tallyWstPlayerScores,
  mergeActiveRound,
  wstQuotePoolStatus,
  dedupeWstPool,
  mergeWstPoolEntry,
  wstHostPoolEntries,
  isAnimeRound,
  tallyAnimeWstVotes,
} from '@/lib/who-said-this'
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
import { HostLobbyStartButton } from '@/components/host-lobby/HostLobbyStartButton'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { PlayAgainSetup, playAgainNeedsSetup, hostPoolSetupLabels, type PlayAgainPayload, type PoolSetupVariant } from '@/components/PlayAgainSetup'
import {
  hotSeatEffectiveRounds,
  hotSeatLobbyRoundsHint,
  clampHotSeatMaxCap,
  hotSeatMaxCapUpperBound,
  HOT_SEAT_MIN_PLAYERS,
  HOT_SEAT_MAX_ROUNDS_CAP,
  hotSeatJoinedPlayers,
  hotSeatPlayerDisplayName,
} from '@/lib/hot-seat'
import { panUsedNumbersFromVotes, pickANumberPoolSize, PAN_MIN_PLAYERS, clampPanRounds, PAN_MAX_ROUNDS, panRoundPickerOptions, panRoundsHint, panRoundRevealed } from '@/lib/pick-a-number'
import { PanRoundResults } from '@/components/game/PanRoundResults'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { RoundResultsShareBlock } from '@/components/RoundResultsShareBlock'
import { FinalResultsShareBlock } from '@/components/FinalResultsShareBlock'
import { AchievementsShareBlock } from '@/components/AchievementsShareBlock'
import { ShareResults } from '@/components/ShareResults'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { HostPlayerManageList } from '@/components/host/HostPlayerManageList'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostPageShell } from '@/components/host/HostPageShell'
import { PollHostPlayShell } from '@/components/host/PollHostPlayShell'
import { computeAchievements } from '@/lib/achievements'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { AllowViewersToggle, LateJoinPolicyToggle } from '@/components/AllowViewersToggle'
import { gameSupportsViewerSetting, lateJoinPolicyFromGame, type LateJoinPolicy } from '@/lib/viewers'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import { useTimerTickSound } from '@/hooks/useTimerTickSound'
import { useRoundTimer } from '@/hooks/useRoundTimer'
import { useGameChannel } from '@/hooks/useGameChannel'
import { finalResultsAutoRevealSeconds, msUntilDeadline, ROUND_RESULTS_AUTO_ADVANCE_SECONDS } from '@/lib/round-timing'
import type {
  Game,
  Participant,
  Player,
  Round,
  Vote,
  Confession,
  WstQuotePoolEntry,
  AnimeQuotePoolEntry,
} from '@/types'
import { parseThemeId, THEME_MAP } from '@/lib/themes'
import { SegmentedControl } from '@/components/ui/CreateWizard'
import { NameSearchPicker } from '@/components/NameSearchPicker'
import { ROUND_TIMER_OPTIONS } from '@/lib/validation'

export default function HostPage() {
  const { code } = useParams<{ code: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const toast = useToast()
  const { confirm } = useConfirm()
  const gameCode = (Array.isArray(code) ? code[0] : code).toUpperCase()
  const hostToken = searchParams.get('token') ?? ''

  // Realtime → React Query cache bridge
  useGameRealtime(gameCode)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [authError, setAuthError] = useState(false)
  const [game, setGame] = useState<Game | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [currentRound, setCurrentRound] = useState<Round | null>(null)
  const [lastFinishedRound, setLastFinishedRound] = useState<Round | null>(null)
  const [allRounds, setAllRounds] = useState<Round[]>([])
  const [allHotSeatSubmissions, setAllHotSeatSubmissions] = useState<
    { id: string; round_id: string; text: string; submission_type: string }[]
  >([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [confessions, setConfessions] = useState<Confession[]>([])

  useScrollHostViewToTop({ gameStatus: game?.status })

  useEffect(() => {
    if (!loading && game) scrollHostViewToTop()
  }, [loading, game, gameCode])

  const [starting, setStarting] = useState(false)
  const [savingPairVoteMode, setSavingPairVoteMode] = useState(false)
  const [savingPlayerQuestions, setSavingPlayerQuestions] = useState(false)
  const [savingParticipantFilter, setSavingParticipantFilter] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [ending, setEnding] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [savingLobbyPool, setSavingLobbyPool] = useState(false)
  const [poolSetup, setPoolSetup] = useState<{ open: boolean; variant: PoolSetupVariant }>({
    open: false,
    variant: 'play-again',
  })
  const [adminBusy, setAdminBusy] = useState<string | null>(null)
  const [addName, setAddName] = useState('')
  const [addGender, setAddGender] = useState<ParticipantGender>('female')
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [updatingRounds, setUpdatingRounds] = useState(false)
  const [updatingTimer, setUpdatingTimer] = useState(false)
  const [updatingViewers, setUpdatingViewers] = useState(false)
  const [listSearch, setListSearch] = useState('')
  const [playersSearch, setPlayersSearch] = useState('')
  const [playerQuestionCount, setPlayerQuestionCount] = useState(0)
  const [playerNameSubmissionCount, setPlayerNameSubmissionCount] = useState(0)
  const [wstPool, setWstPool] = useState<WstQuotePoolEntry[]>([])
  const [hostQuoteInput, setHostQuoteInput] = useState('')
  const [hostQuoteAuthorId, setHostQuoteAuthorId] = useState<string | null>(null)
  const [hostEditingQuoteId, setHostEditingQuoteId] = useState<string | null>(null)
  const [hostQuoteSubmitting, setHostQuoteSubmitting] = useState(false)
  const [animePool, setAnimePool] = useState<AnimeQuotePoolEntry[]>([])
  const [animeFetching, setAnimeFetching] = useState(false)
  const [animeError, setAnimeError] = useState<string | null>(null)
  const [hotSeatSubmissions, setHotSeatSubmissions] = useState<{ id: string; text: string; submission_type: string }[]>(
    []
  )
  const [activeHotSeatSubs, setActiveHotSeatSubs] = useState<{ id: string; player_id: string; round_id: string }[]>([])
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)

  const advancingRef = useRef(false)
  const autoFinishTriggeredRef = useRef(false)
  const autoAdvanceScheduledRef = useRef<string | null>(null)

  const betweenRounds = game?.status === 'active' && !currentRound && !!lastFinishedRound
  const isBetweenLastRound = betweenRounds && (lastFinishedRound?.round_number ?? 0) >= (game?.rounds_count ?? 0)
  const nextRoundCountdown = useDeadlineCountdown(
    lastFinishedRound?.ended_at,
    ROUND_RESULTS_AUTO_ADVANCE_SECONDS,
    betweenRounds && !isBetweenLastRound
  )
  const finalRevealCountdown = useDeadlineCountdown(
    lastFinishedRound?.ended_at,
    finalResultsAutoRevealSeconds(game?.game_type),
    betweenRounds && isBetweenLastRound && !!game?.auto_reveal
  )

  useEffect(() => {
    if (!betweenRounds || !lastFinishedRound || !isHotSeat(game?.game_type)) {
      setHotSeatSubmissions([])
      return
    }
    let cancelled = false
    async function fetchHotSeatResults() {
      const res = await fetch(`/api/hot-seat?roundId=${lastFinishedRound!.id}&gameId=${gameCode}`)
      if (cancelled) return
      if (res.ok) {
        const { submissions } = await res.json()
        setHotSeatSubmissions(submissions ?? [])
      }
    }
    fetchHotSeatResults()
    return () => {
      cancelled = true
    }
  }, [betweenRounds, game?.game_type, lastFinishedRound?.id, gameCode])

  useEffect(() => {
    if (!currentRound?.id || !isHotSeat(game?.game_type)) {
      setActiveHotSeatSubs([])
      return
    }
    let cancelled = false
    async function loadActiveHotSeatSubs() {
      const { data } = await supabase
        .from('hot_seat_submissions')
        .select('id, player_id, round_id')
        .eq('round_id', currentRound!.id)
      if (!cancelled && data) setActiveHotSeatSubs(data)
    }
    loadActiveHotSeatSubs()
    return () => {
      cancelled = true
    }
  }, [currentRound?.id, game?.game_type])

  // ── Apply theme CSS variables ─────────────────────────────────────────────
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

  const filteredListParticipants = useMemo(() => {
    const q = listSearch.trim().toLowerCase()
    if (!q) return participants
    return participants.filter((p) => p.name.toLowerCase().includes(q))
  }, [participants, listSearch])

  const joinerParticipantsWithPlayers = useMemo(
    () => participants.filter((part) => players.some((p) => p.name === part.name)),
    [participants, players]
  )

  const filteredPlayers = useMemo(() => {
    const q = playersSearch.trim().toLowerCase()
    if (!q) return players
    return players.filter((p) => p.name.toLowerCase().includes(q))
  }, [players, playersSearch])

  const filteredJoinerParticipants = useMemo(() => {
    const q = playersSearch.trim().toLowerCase()
    if (!q) return joinerParticipantsWithPlayers
    return joinerParticipantsWithPlayers.filter((p) => p.name.toLowerCase().includes(q))
  }, [joinerParticipantsWithPlayers, playersSearch])

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoadError(false)
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT_MS)
      )

      try {
        await Promise.race([
          (async () => {
            const gameRes = await supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle()
            if (!supabasePollOk(gameRes)) throw new Error('unavailable')
            const gameData = gameRes.data
            if (!gameData) {
              if (!cancelled) setAuthError(true)
              return
            }
            if (gameData.host_token !== hostToken) {
              if (!cancelled) setAuthError(true)
              return
            }

            if (!cancelled) setGame(gameData)

            const [partsRes, plrsRes] = await Promise.all([
              supabase.from('participants').select(PARTICIPANT_SELECT).eq('game_id', gameCode).order('display_order'),
              supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
            ])
            if (!supabasePollOk(partsRes, plrsRes)) throw new Error('unavailable')
            if (!cancelled) {
              setParticipants(partsRes.data || [])
              setPlayers(plrsRes.data || [])
            }

            if (isWhoSaidThis(parseGameType(gameData.game_type))) {
              const [poolRes, aPoolRes] = await Promise.all([
                supabase
                  .from('wst_quote_pool')
                  .select(WST_QUOTE_POOL_SELECT)
                  .eq('game_id', gameCode)
                  .order('created_at'),
                supabase
                  .from('anime_quote_pool')
                  .select('*')
                  .eq('game_id', gameCode)
                  .eq('removed', false)
                  .order('created_at'),
              ])
              if (!supabasePollOk(poolRes, aPoolRes)) throw new Error('unavailable')
              if (!cancelled) {
                setWstPool(dedupeWstPool(poolRes.data || []))
                setAnimePool(aPoolRes.data ?? [])
              }
            }

            if (gameData.status === 'active') {
              const [roundRes, finishedRes] = await Promise.all([
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
              if (!supabasePollOk(roundRes, finishedRes)) throw new Error('unavailable')

              const roundData = roundRes.data
              const finishedRound = finishedRes.data
              const roundId = roundData?.id ?? finishedRound?.id

              if (!cancelled) {
                if (roundData) {
                  setCurrentRound(roundData)
                } else if (finishedRound) {
                  setLastFinishedRound(finishedRound)
                }
              }

              if (roundId) {
                const [votesRes, confsRes] = await Promise.all([
                  supabase.from('votes').select(VOTE_SELECT).eq('round_id', roundId),
                  supabase.from('confessions').select(CONFESSION_SELECT).eq('round_id', roundId).order('created_at'),
                ])
                if (!supabasePollOk(votesRes, confsRes)) throw new Error('unavailable')
                if (!cancelled) {
                  setVotes(votesRes.data || [])
                  setConfessions(confsRes.data || [])
                }
              }
            }

            if (gameData.status === 'finished') {
              await loadResults()
            }
          })(),
          timeout,
        ])
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameCode, hostToken])

  async function loadResults() {
    const [roundsRes, vsRes, confsRes, subsRes] = await Promise.all([
      supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      supabase.from('votes').select(VOTE_SELECT).eq('game_id', gameCode),
      supabase.from('confessions').select(CONFESSION_SELECT).eq('game_id', gameCode).order('created_at'),
      supabase.from('hot_seat_submissions').select('id, round_id, text, submission_type').eq('game_id', gameCode),
    ])
    setAllRounds(roundsRes.data || [])
    setVotes(vsRes.data || [])
    setConfessions(confsRes.data || [])
    setAllHotSeatSubmissions(subsRes.data ?? [])
  }

  function resetHostLobbyState() {
    setCurrentRound(null)
    setLastFinishedRound(null)
    setAllRounds([])
    setAllHotSeatSubmissions([])
    setVotes([])
    setConfessions([])
    setWstPool([])
    setActiveHotSeatSubs([])
    autoFinishTriggeredRef.current = false
    autoAdvanceScheduledRef.current = null
    advancingRef.current = false
    setEnding(false)
    setAdvancing(false)
    setFinishing(false)
  }

  function mergeVote(prev: Vote[], vote: Vote) {
    const idx = prev.findIndex(
      (v) => v.id === vote.id || (v.player_id === vote.player_id && v.round_id === vote.round_id)
    )
    if (idx >= 0) {
      const next = [...prev]
      next[idx] = vote
      return next
    }
    return [...prev, vote]
  }

  function mergeHotSeatSub(
    prev: { id: string; player_id: string; round_id: string }[],
    sub: { id: string; player_id: string; round_id: string }
  ) {
    const idx = prev.findIndex((s) => s.id === sub.id || (s.player_id === sub.player_id && s.round_id === sub.round_id))
    if (idx >= 0) {
      const next = [...prev]
      next[idx] = sub
      return next
    }
    return [...prev, sub]
  }

  async function syncGameState(): Promise<boolean> {
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
    const roundId = activeRound?.id ?? finishedRound?.id

    let votesRes = { data: null as Vote[] | null, error: null as unknown }
    let confsRes = { data: null as Confession[] | null, error: null as unknown }
    if (roundId) {
      ;[votesRes, confsRes] = await Promise.all([
        supabase.from('votes').select(VOTE_SELECT).eq('round_id', roundId),
        supabase.from('confessions').select(CONFESSION_SELECT).eq('round_id', roundId).order('created_at'),
      ])
      if (!supabasePollOk(votesRes, confsRes)) return false
    }

    if (gameData) setGame(gameData)
    if (votesRes.data && roundId) {
      setVotes((prev) => {
        const other = prev.filter((v) => v.round_id !== roundId)
        return [...other, ...votesRes.data!]
      })
    }
    if (confsRes.data && roundId) {
      setConfessions((prev) => {
        const other = prev.filter((c) => c.round_id !== roundId)
        return [...other, ...confsRes.data!]
      })
    }

    if (gameData?.status === 'finished') {
      await loadResults()
      advancingRef.current = false
      setEnding(false)
      setAdvancing(false)
      return true
    }

    if (activeRound) {
      setCurrentRound((prev) => mergeActiveRound(prev, activeRound))
      setLastFinishedRound(null)
      if (isHotSeat(parseGameType(gameData?.game_type))) {
        const subsRes = await supabase
          .from('hot_seat_submissions')
          .select('id, player_id, round_id')
          .eq('round_id', activeRound.id)
        if (!supabasePollOk(subsRes)) return false
        if (subsRes.data) setActiveHotSeatSubs(subsRes.data)
      }
      return true
    }

    if (finishedRound) {
      setCurrentRound(null)
      setLastFinishedRound(finishedRound)
      setActiveHotSeatSubs([])
      advancingRef.current = false
      setEnding(false)
      setAdvancing(false)
    }
    return true
  }

  // ── Realtime ──────────────────────────────────────────────────────────────
  useGameChannel(
    gameCode,
    `host-${gameCode}`,
    {
      setGame,
      setPlayers,
      setParticipants,
      setWstPool,
      setConfessions,
    },
    {
      onGameUpdate: async (g) => {
        if (g.status === 'active') {
          const roundRes = await supabase
            .from('rounds')
            .select(ROUND_SELECT)
            .eq('game_id', gameCode)
            .eq('status', 'active')
            .maybeSingle()
          if (roundRes.data) {
            setCurrentRound((prev) => mergeActiveRound(prev, roundRes.data!))
            advancingRef.current = false
          }
        }
        if (g.status === 'finished') {
          await loadResults()
        }
        if (g.status === 'waiting') {
          resetHostLobbyState()
        }
      },
      onRoundUpdate: (r) => {
        if (r.status === 'active') {
          setCurrentRound((prev) => mergeActiveRound(prev, r))
          setLastFinishedRound(null)
          advancingRef.current = false
          setAdvancing(false)
        }
        if (r.status === 'finished') {
          setCurrentRound(null)
          setLastFinishedRound(r)
          advancingRef.current = false
          setEnding(false)
        }
      },
      onVoteInsert: (vote) => setVotes((prev) => mergeVote(prev, vote)),
      onVoteUpdate: (vote) => setVotes((prev) => mergeVote(prev, vote)),
      onHotSeatSubInsert: (sub) => setActiveHotSeatSubs((prev) => mergeHotSeatSub(prev, sub)),
      onHotSeatSubUpdate: (sub) => setActiveHotSeatSubs((prev) => mergeHotSeatSub(prev, sub)),
    }
  )

  // Poll lobby while waiting — slow fallback; Realtime is primary
  usePolling(
    async () => {
      const gameType = parseGameType(game?.game_type)
      const fetchPlayerQuestions = isBinaryChoiceGame(gameType) || isNeverHaveIEver(gameType) || isPickANumber(gameType) || isMostLikelyTo(gameType)
      const fetchPlayerNames = isPeoplePollGame(gameType) && game?.participant_mode === 'voters'
      const [plrsRes, partsRes, poolRes, pqRes, pnRes] = await Promise.all([
        supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
        supabase.from('participants').select(PARTICIPANT_SELECT).eq('game_id', gameCode).order('display_order'),
        isWhoSaidThis(gameType)
          ? supabase.from('wst_quote_pool').select(WST_QUOTE_POOL_SELECT).eq('game_id', gameCode).order('created_at')
          : Promise.resolve({ data: null, error: null }),
        fetchPlayerQuestions
          ? supabase.from('player_questions').select('id', { count: 'exact', head: true }).eq('game_id', gameCode)
          : Promise.resolve({ count: 0, error: null }),
        fetchPlayerNames
          ? supabase
              .from('participants')
              .select('id', { count: 'exact', head: true })
              .eq('game_id', gameCode)
              .not('submitted_by_player_id', 'is', null)
          : Promise.resolve({ count: 0, error: null }),
      ])
      if (!supabasePollOk(plrsRes, partsRes, poolRes, pqRes, pnRes)) return false
      if (plrsRes.data) setPlayers(plrsRes.data)
      if (partsRes.data) setParticipants(partsRes.data)
      if (poolRes.data) setWstPool(dedupeWstPool(poolRes.data))
      if (fetchPlayerQuestions) setPlayerQuestionCount(pqRes.count ?? 0)
      if (fetchPlayerNames) setPlayerNameSubmissionCount(pnRes.count ?? 0)
      return true
    },
    [gameCode, game?.game_type, game?.participant_mode],
    { intervalMs: POLL_INTERVALS.lobby, enabled: game?.status === 'waiting' }
  )

  // Poll during active game — slow fallback when realtime misses updates
  usePolling(
    () => syncGameState(),
    [gameCode, currentRound?.id, lastFinishedRound?.id],
    { intervalMs: POLL_INTERVALS.activeGame, enabled: game?.status === 'active' }
  )

  // Auto-reveal: after the final round results, show the leaderboard automatically
  useEffect(() => {
    if (game?.status !== 'active' || currentRound || !lastFinishedRound) return
    if (lastFinishedRound.round_number < (game?.rounds_count ?? 0)) return
    if (!game.auto_reveal || autoFinishTriggeredRef.current) return

    autoFinishTriggeredRef.current = true
    const delay = msUntilDeadline(lastFinishedRound.ended_at, finalResultsAutoRevealSeconds(game.game_type))
    const timer = setTimeout(() => {
      handleFinishGame()
    }, delay)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status, game?.auto_reveal, game?.rounds_count, game?.game_type, currentRound?.id, lastFinishedRound?.id])

  useEffect(() => {
    if (!lastFinishedRound || lastFinishedRound.round_number < (game?.rounds_count ?? 0)) {
      autoFinishTriggeredRef.current = false
    }
  }, [lastFinishedRound?.id, game?.rounds_count])

  // Auto-advance: start the next round if the host doesn't within 30s
  useEffect(() => {
    if (currentRound) {
      autoAdvanceScheduledRef.current = null
      return
    }
    if (game?.status !== 'active' || !lastFinishedRound || advancingRef.current) return
    const isLastRound = lastFinishedRound.round_number >= (game?.rounds_count ?? 0)
    if (isLastRound) return

    const roundKey = lastFinishedRound.id
    if (autoAdvanceScheduledRef.current === roundKey) return
    autoAdvanceScheduledRef.current = roundKey

    const delay = msUntilDeadline(lastFinishedRound.ended_at, ROUND_RESULTS_AUTO_ADVANCE_SECONDS)
    const timer = setTimeout(() => {
      handleNextRound()
    }, delay)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status, game?.rounds_count, currentRound?.id, lastFinishedRound?.id, lastFinishedRound?.ended_at])

  // Auto-end round as soon as every eligible voter has voted; timer is the fallback
  useEffect(() => {
    if (!currentRound || !game || game.status !== 'active' || players.length === 0) return

    const gameType = parseGameType(game.game_type)

    if (isWhoSaidThis(gameType)) {
      if (!currentRound.quote_text) return
      const submitterId = currentRound.submitter_player_id
      const voters = players.filter((p) => p.id !== submitterId)
      if (voters.length === 0) return
      const roundVotes = votes.filter((v) => v.round_id === currentRound.id && v.player_id !== submitterId)
      if (roundVotes.length >= voters.length) {
        handleEndRound()
      }
      return
    }

    if (isHotSeat(gameType)) {
      const hotSeatPlayerId = currentRound.submitter_player_id
      const joined = hotSeatJoinedPlayers(players, participants, game.participant_mode)
      const eligible = joined.filter((p) => p.id !== hotSeatPlayerId)
      if (eligible.length === 0) return
      const eligibleIds = new Set(eligible.map((p) => p.id))
      const roundSubs = activeHotSeatSubs.filter((s) => s.round_id === currentRound.id && eligibleIds.has(s.player_id))
      if (roundSubs.length >= eligible.length) {
        handleEndRound()
      }
      return
    }

    const roundGender = getRoundParticipantGender(currentRound.participant_ids, participants)
    const eligible = eligibleVotersForRound(roundGender, players, game?.game_type, game)
    if (eligible.length === 0) return

    const eligibleIds = new Set(eligible.map((p) => p.id))
    const roundVotes = votes.filter((v) => v.round_id === currentRound.id && eligibleIds.has(v.player_id))
    if (roundVotes.length >= eligible.length) {
      handleEndRound()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRound?.id, currentRound?.quote_text, votes, players, participants, game?.status, activeHotSeatSubs])

  const handleStart = async () => {
    if (starting) return
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error || 'Failed to start')
        return
      }

      const [{ data: gameData }, { data: roundData }] = await Promise.all([
        supabase.from('games').select('*').eq('id', gameCode).maybeSingle(),
        supabase.from('rounds').select('*').eq('game_id', gameCode).eq('status', 'active').maybeSingle(),
      ])
      if (gameData) setGame(gameData)
      if (roundData) setCurrentRound(roundData)
    } finally {
      setStarting(false)
    }
  }

  const handleEndRound = async () => {
    if (advancingRef.current || ending) return
    advancingRef.current = true
    setEnding(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/end-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error || 'Failed to end round')
        advancingRef.current = false
        setEnding(false)
        return
      }
      await syncGameState()
      advancingRef.current = false
      setEnding(false)
    } catch {
      advancingRef.current = false
      setEnding(false)
    }
  }

  const timeLeft = useRoundTimer({
    game,
    currentRound,
    active: game?.status === 'active' && !!currentRound,
    onExpire: handleEndRound,
  })

  useTimerTickSound(timeLeft, game?.status === 'active' && !!currentRound)

  const handleNextRound = async () => {
    if (advancingRef.current) return
    advancingRef.current = true
    setAdvancing(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/next-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = typeof data.error === 'string' ? data.error : 'Failed to start next round'
        if (res.status === 400 && msg.includes('must be ended')) {
          await syncGameState()
        } else {
          toast.error(msg)
          autoAdvanceScheduledRef.current = null
        }
        advancingRef.current = false
        setAdvancing(false)
        return
      }
      await syncGameState()
      autoAdvanceScheduledRef.current = null
      advancingRef.current = false
      setAdvancing(false)
    } catch {
      autoAdvanceScheduledRef.current = null
      advancingRef.current = false
      setAdvancing(false)
    }
  }

  const handleFinishGame = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/finish-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error || 'Failed to show final results')
        setFinishing(false)
        return
      }
      await syncGameState()
      setFinishing(false)
    } catch {
      setFinishing(false)
    }
  }

  const handlePlayAgain = async (payload: PlayAgainPayload = {}) => {
    if (playingAgain) return
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, ...payload }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to reset for another game')
        return
      }
      setPoolSetup((prev) => ({ ...prev, open: false }))
      resetHostLobbyState()
      if (data.game) setGame(data.game)
      await refreshLobbyLists()
    } catch {
      toast.error('Failed to reset for another game')
    } finally {
      setPlayingAgain(false)
    }
  }

  const handleLobbyPoolSave = async (payload: PlayAgainPayload = {}) => {
    if (savingLobbyPool) return
    if (!payload.custom_questions && !payload.participants) {
      setPoolSetup((prev) => ({ ...prev, open: false }))
      return
    }
    setSavingLobbyPool(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/lobby-pool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, ...payload }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to save changes')
        return
      }
      setPoolSetup((prev) => ({ ...prev, open: false }))
      if (data.game) setGame(data.game)
      await refreshLobbyLists()
      toast.success('List updated')
    } catch {
      toast.error('Failed to save changes')
    } finally {
      setSavingLobbyPool(false)
    }
  }

  const openPoolSetup = (variant: PoolSetupVariant) => {
    if (!game || (variant === 'play-again' && playingAgain) || (variant === 'lobby' && savingLobbyPool)) return
    setPoolSetup({ open: true, variant })
  }

  const openPlayAgain = () => {
    if (!game || playingAgain) return
    if (playAgainNeedsSetup(game)) {
      openPoolSetup('play-again')
      return
    }
    void handlePlayAgain()
  }

  const handlePoolSetupConfirm = (payload: PlayAgainPayload) => {
    if (poolSetup.variant === 'lobby') return handleLobbyPoolSave(payload)
    return handlePlayAgain(payload)
  }

  const playerLinkUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/game/${gameCode}` : `/game/${gameCode}`

  async function refreshLobbyLists() {
    const [{ data: plrs }, { data: parts }, { data: pool }] = await Promise.all([
      supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
      supabase.from('participants').select('*').eq('game_id', gameCode).order('display_order'),
      game && isWhoSaidThis(parseGameType(game.game_type))
        ? supabase.from('wst_quote_pool').select('*').eq('game_id', gameCode).order('created_at')
        : Promise.resolve({ data: null }),
    ])
    if (plrs) setPlayers(plrs)
    if (parts) setParticipants(parts)
    if (pool) setWstPool(dedupeWstPool(pool))
  }

  const handleSubmitHostQuote = async () => {
    if (hostQuoteSubmitting || !hostToken) return
    const text = hostQuoteInput.trim()
    if (!text || !hostQuoteAuthorId) return
    setHostQuoteSubmitting(true)
    try {
      const res = await fetch('/api/wst-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostToken,
          gameId: gameCode,
          quoteText: text,
          authorParticipantId: hostQuoteAuthorId,
          ...(hostEditingQuoteId ? { quoteId: hostEditingQuoteId } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to add quote')
        return
      }
      if (data.entry) {
        setWstPool((prev) => mergeWstPoolEntry(prev, data.entry as WstQuotePoolEntry))
      }
      setHostQuoteInput('')
      setHostQuoteAuthorId(null)
      setHostEditingQuoteId(null)
    } catch {
      toast.error('Could not add quote — try again')
    } finally {
      setHostQuoteSubmitting(false)
    }
  }

  const handleDeleteHostQuote = async (quoteId: string) => {
    if (hostQuoteSubmitting || !hostToken) return
    setHostQuoteSubmitting(true)
    try {
      const res = await fetch('/api/wst-quotes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, gameId: gameCode, quoteId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to remove quote')
        return
      }
      setWstPool((prev) => prev.filter((e) => e.id !== quoteId))
      if (hostEditingQuoteId === quoteId) {
        setHostQuoteInput('')
        setHostQuoteAuthorId(null)
        setHostEditingQuoteId(null)
      }
    } catch {
      toast.error('Could not remove quote — try again')
    } finally {
      setHostQuoteSubmitting(false)
    }
  }

  const fetchAnimeQuotes = async (count: number) => {
    if (!game || animeFetching) return
    setAnimeFetching(true)
    setAnimeError(null)
    try {
      const res = await fetch('/api/anime-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, gameId: game.id, hostToken }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAnimeError(data.error || 'Failed to fetch quotes')
        return
      }
      setAnimePool(data.quotes)
    } catch {
      setAnimeError('Network error — try again')
    } finally {
      setAnimeFetching(false)
    }
  }

  const rerollAnimeQuote = async (quoteId: string) => {
    if (!game) return
    try {
      const res = await fetch('/api/anime-quotes/reroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id, quoteId, hostToken }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to reroll')
        return
      }
      setAnimePool(data.quotes)
    } catch {
      toast.error('Network error — try again')
    }
  }

  const removeAnimeQuote = async (quoteId: string) => {
    if (!game) return
    const { error } = await supabase.from('anime_quote_pool').update({ removed: true }).eq('id', quoteId)
    if (!error) {
      setAnimePool((prev) => prev.filter((q) => q.id !== quoteId))
    }
  }

  async function hostUpdatePlayerQuestions(patch: {
    player_questions_enabled?: boolean
    player_questions_order?: PlayerQuestionsOrder
  }) {
    if (savingPlayerQuestions || !game) return
    const previous = {
      player_questions_enabled: game.player_questions_enabled,
      player_questions_order: game.player_questions_order,
    }
    setSavingPlayerQuestions(true)
    setGame((g) => (g ? { ...g, ...patch } : g))
    try {
      const res = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, ...patch }),
      })
      const data = await res.json()
      if (!res.ok) {
        setGame((g) => (g ? { ...g, ...previous } : g))
        toast.error(data.error || 'Failed to save question settings')
        return
      }
      if (data.game) setGame(data.game)
    } finally {
      setSavingPlayerQuestions(false)
    }
  }

  async function hostUpdateRounds(roundsCount: number) {
    if (updatingRounds || game?.rounds_count === roundsCount) return
    const previousCount = game!.rounds_count
    setGame((g) => (g ? { ...g, rounds_count: roundsCount } : g))
    setUpdatingRounds(true)
    try {
      const res = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, rounds_count: roundsCount }),
      })
      const data = await res.json()
      if (!res.ok) {
        setGame((g) => (g ? { ...g, rounds_count: previousCount } : g))
        toast.error(data.error || 'Failed to update rounds')
        return
      }
      if (data.game) setGame(data.game)
    } finally {
      setUpdatingRounds(false)
    }
  }

  async function hostUpdateTimer(timerSeconds: number) {
    if (updatingTimer || game?.timer_seconds === timerSeconds) return
    const previous = game!.timer_seconds
    setGame((g) => (g ? { ...g, timer_seconds: timerSeconds } : g))
    setUpdatingTimer(true)
    try {
      const res = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, timer_seconds: timerSeconds }),
      })
      const data = await res.json()
      if (!res.ok) {
        setGame((g) => (g ? { ...g, timer_seconds: previous } : g))
        toast.error(data.error || 'Failed to update timer')
        return
      }
      if (data.game) setGame(data.game)
    } finally {
      setUpdatingTimer(false)
    }
  }

  async function hostUpdateLateJoinPolicy(next: LateJoinPolicy) {
    if (updatingViewers || !game || lateJoinPolicyFromGame(game) === next) return
    const previous = lateJoinPolicyFromGame(game)
    setGame((g) =>
      g
        ? {
            ...g,
            allow_viewers: next !== 'lobby_only',
            allow_late_players: next === 'viewers_and_players',
          }
        : g
    )
    setUpdatingViewers(true)
    try {
      const res = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, late_join_policy: next }),
      })
      const data = await res.json()
      if (!res.ok) {
        setGame((g) =>
          g
            ? {
                ...g,
                allow_viewers: previous !== 'lobby_only',
                allow_late_players: previous === 'viewers_and_players',
              }
            : g
        )
        toast.error(data.error || 'Failed to update late join setting')
        return
      }
      if (data.game) setGame(data.game)
    } finally {
      setUpdatingViewers(false)
    }
  }

  const timerControl = (
    <div className="space-y-2">
      <p className="text-muted text-[10px] uppercase tracking-wider">Time per round</p>
      <SegmentedControl
        value={String(game?.timer_seconds ?? 30)}
        onChange={(v) => hostUpdateTimer(Number(v))}
        options={ROUND_TIMER_OPTIONS.map((n) => ({ value: String(n), label: `${n}s` }))}
      />
    </div>
  )

  useEffect(() => {
    if (!game || game.status !== 'waiting') return
    const gameType = parseGameType(game.game_type)
    if (isBinaryChoiceGame(gameType) || isNeverHaveIEver(gameType) || isMostLikelyTo(gameType)) {
      const max = questionPoolCap(game, playerQuestionCount)
      if (max > 0 && game.rounds_count > max) {
        hostUpdateRounds(max)
      }
      return
    }
    if (!isWhoSaidThis(gameType)) return
    const count = wstPool.length
    if (count === 0) return
    const autoRounds = wstAutoRoundCount(count)
    if (game.rounds_count !== autoRounds) {
      hostUpdateRounds(autoRounds)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status, game?.rounds_count, game?.game_type, wstPool.length, playerQuestionCount])

  async function hostAddParticipant() {
    const name = addName.trim()
    if (!name || adding) return
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch('/api/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, hostToken, name, gender: addGender }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error || 'Failed to add')
        return
      }
      setAddName('')
      await refreshLobbyLists()
    } finally {
      setAdding(false)
    }
  }

  async function hostUpdateParticipant(participantId: string, gender: ParticipantGender) {
    setAdminBusy(participantId)
    try {
      const res = await fetch('/api/participants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, hostToken, participantId, gender }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Failed to update')
        return
      }
      await refreshLobbyLists()
    } finally {
      setAdminBusy(null)
    }
  }

  async function hostRemoveParticipant(participantId: string, name: string) {
    if (
      !(await confirm({
        title: `Remove ${name} from the list?`,
        confirmLabel: 'Remove',
        destructive: true,
      }))
    )
      return
    setAdminBusy(participantId)
    try {
      const res = await fetch('/api/participants', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, hostToken, participantId }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Failed to remove')
        return
      }
      await refreshLobbyLists()
    } finally {
      setAdminBusy(null)
    }
  }

  async function hostUpdatePlayerIdentity(playerId: string, identityGender: ParticipantGender) {
    setAdminBusy(playerId)
    try {
      const res = await fetch('/api/players', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameCode,
          hostToken,
          playerId,
          identityGender,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Failed to update')
        return
      }
      await refreshLobbyLists()
    } finally {
      setAdminBusy(null)
    }
  }

  async function hostRemovePlayer(playerId: string, name: string) {
    if (
      !(await confirm({
        title: `Remove ${name}?`,
        confirmLabel: 'Remove',
        destructive: true,
      }))
    )
      return
    setAdminBusy(playerId)
    try {
      const res = await fetch('/api/players', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, hostToken, playerId }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Failed to remove')
        return
      }
      await refreshLobbyLists()
    } finally {
      setAdminBusy(null)
    }
  }

  const activePlayerManagePanel =
    game?.status === 'active' ? (
      <div className="glass-card p-4 space-y-3">
        <p className="text-muted text-xs uppercase tracking-wider">Manage players</p>
        <HostPlayerManageList
          players={players}
          removingPlayerId={adminBusy}
          onRemovePlayer={hostRemovePlayer}
          compact
          highlightPlayerId={hostPlayerId}
        />
      </div>
    ) : null

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-wrap flex items-center justify-center">
        <div className="w-11 h-11 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="page-wrap flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-6xl">⚠️</p>
          <h1 className="text-2xl font-black text-body">Can&apos;t reach the server</h1>
          <p className="text-muted">
            The database is slow or temporarily unavailable. Wait a moment, then try again.
          </p>
          <button type="button" onClick={() => window.location.reload()} className="btn-primary px-6 py-3">
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (authError) {
    return (
      <div className="page-wrap flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-6xl">🔒</p>
          <h1 className="text-2xl font-black text-body">Access Denied</h1>
          <p className="text-muted">Invalid or missing host token</p>
          <button onClick={() => router.push('/')} className="btn-secondary px-6 py-3">
            Go Home
          </button>
        </div>
      </div>
    )
  }

  if (game && isSecretMessageGame(game.game_type)) {
    return <SecretMessageHostView gameCode={gameCode} hostToken={hostToken} />
  }

  if (game && isBingoGame(game.game_type)) {
    return <BingoHostView gameCode={gameCode} hostToken={hostToken} />
  }

  if (game && isCodewordsGame(game.game_type)) {
    return <CodewordsHostView gameCode={gameCode} hostToken={hostToken} />
  }

  if (game && isTriviaGame(game.game_type)) {
    return <TriviaHostView gameCode={gameCode} hostToken={hostToken} />
  }

  if (game && isTwoTruthsGame(game.game_type)) {
    return <TwoTruthsHostView gameCode={gameCode} hostToken={hostToken} />
  }

  if (game && isICallOnGame(game.game_type)) {
    return <NpatHostView gameCode={gameCode} hostToken={hostToken} />
  }

  if (game && isMonopolyGame(game.game_type)) {
    return <MonopolyHostView gameCode={gameCode} hostToken={hostToken} />
  }

  if (game && isYahtzeeGame(game.game_type)) {
    return <YahtzeeHostView gameCode={gameCode} hostToken={hostToken} />
  }

  if (game && isWhotGame(game.game_type)) {
    return <WhotHostView gameCode={gameCode} hostToken={hostToken} />
  }

  if (game && isLudoGame(game.game_type)) {
    return <LudoHostView gameCode={gameCode} hostToken={hostToken} />
  }

  if (game && isAnonymousMessagesGame(game.game_type)) {
    return <AnonymousMessagesHostView gameCode={gameCode} hostToken={hostToken} />
  }

  // ── WAITING ───────────────────────────────────────────────────────────────
  if (game?.status === 'waiting') {
    const gameType = parseGameType(game.game_type)
    const isWyr = isWouldYouRather(gameType)
    const isNhie = isNeverHaveIEver(gameType)
    const isPan = isPickANumber(gameType)
    const isTot = isThisOrThat(gameType)
    const isBinaryLobby = isWyr || isTot || isNhie
    const isMlt = isMostLikelyTo(gameType)
    const isPeoplePoll = isPeoplePollGame(gameType)
    const isWst = isWhoSaidThis(gameType)
    const isHotSeatGame = isHotSeat(gameType)
    const isMltImport = isMltImportGame(game)
    const isVoterOnly = isVoterOnlyMode(game)
    const isPeoplePollVoters = isPeoplePoll && isVoterOnly
    const lobbyOpts = { participantMode: game.participant_mode, participantCount: participants.length }
    const playerOnlyLobby = isPlayerOnlyJoinLobby(gameType, lobbyOpts)
    const hotSeatLobby = isHotSeatLobbyGame(gameType, lobbyOpts)
    const panLobby = isPan
    const participantOpts = game ? { game } : undefined
    const minPool = minPoolForGame(gameType, participantOpts)
    const gameGenderBased = game ? isGameGenderBased(game) : false
    const supportsGender = supportsGenderToggle(gameType)
    const isPair = isPairGame(gameType)
    const isCustomTwoSlot = isCustomTwoSlotGame(game)
    const showPairVoting = isPair || isCustomTwoSlot
    const pairVoteMode = parsePairVoteMode(game.pair_vote_mode)
    const isJoinersMode = (game.participant_mode ?? 'import') === 'joiners'
    const hotSeatLegacyJoiners = isHotSeatGame && isJoinersMode
    const panLegacyJoiners = isPan && isJoinersMode
    const wstSubmitters = wstEligibleSubmitters(players)
    const wstPoolStatus = isWst ? wstQuotePoolStatus(players, wstPool) : null
    const hostPoolQuotes = isWst ? wstHostPoolEntries(wstPool) : []
    const wstTargets = isWst ? wstVoteTargets(participants) : []
    const roundParticipants = isPeoplePoll
      ? buildPeoplePollParticipantPool(game, participants, players)
      : isHotSeatGame && !hotSeatLegacyJoiners
        ? participantsWhoJoined(participants, players)
        : isJoinersMode
          ? participants
          : isVoterOnly
            ? participants
            : game.participant_filter === 'all'
              ? participants
              : participantsWhoJoined(participants, players)
    const participantInputs = hotSeatLegacyJoiners || panLegacyJoiners
      ? players.map((p) => ({ name: p.name, gender: 'female' as ParticipantGender }))
      : roundParticipants.map((p) => ({
          name: p.name,
          gender: parseParticipantGenderFromDb(String(p.gender)) ?? ('female' as ParticipantGender),
        }))
    const genderCounts = countByGender(participantInputs)
    const hotSeatJoinedCount = hotSeatLegacyJoiners ? players.length : roundParticipants.length
    const hotSeatCapUpper = hotSeatLobby
      ? hotSeatMaxCapUpperBound(hotSeatJoinedCount, participants.length)
      : HOT_SEAT_MAX_ROUNDS_CAP
    const lobbyQuestionMax =
      isBinaryLobby || isMlt || isNhie || isPan
        ? questionPoolCap(game, playerQuestionCount)
        : isWst
          ? wstAutoRoundCount(wstPool.length || wstSubmitters.length)
          : isHotSeatGame
            ? hotSeatCapUpper
            : maxRecommendedRounds(participantInputs, gameType, gameGenderBased, participantOpts)
    const maxRounds =
      isPan
        ? PAN_MAX_ROUNDS
        : isBinaryLobby || isMlt || isNhie
        ? lobbyQuestionMax
        : isWst
          ? lobbyQuestionMax
          : isHotSeatGame
            ? hotSeatCapUpper
            : maxRecommendedRounds(participantInputs, gameType, gameGenderBased, participantOpts)
    const roundsHint = isWst
      ? wstPool.length >= 2
        ? `${wstPool.length} quotes in the pool → ${wstAutoRoundCount(wstPool.length)} rounds`
        : wstPool.length === 1
          ? '1 quote in the pool — need at least 2 to start'
          : wstSubmitters.length >= 1
            ? `${wstSubmitters.length} players joined — waiting for quotes in the lobby`
            : 'Players claim a name and submit a quote before start'
      : isBinaryLobby || isMlt || isPan
        ? (() => {
            const uploaded = customQuestionCount(game)
            const useCustom = parseQuestionSource(game.question_source, gameType) === 'custom' && uploaded > 0
            const parts: string[] = []
            if (useCustom) parts.push(`${uploaded} uploaded`)
            else if (isTot) parts.push(`${uploaded} custom questions loaded`)
            else if (isWyr) parts.push('Platform pool')
            else if (isNhie) parts.push('Platform prompts')
            else if (isPan) parts.push('Hidden numbered list')
            else parts.push('Platform prompts')
            if (playerQuestionCount > 0 && lobbyAllowsPlayerQuestions(game)) {
              parts.push(`${playerQuestionCount} from players`)
            }
            if (isPan) {
              return `${parts.join(' · ')} — hidden numbered question list`
            }
            return `${parts.join(' · ')} → up to ${lobbyQuestionMax} rounds`
          })()
        : isPeoplePollVoters
          ? (() => {
              const hostCount = participants.filter((p) => !p.submitted_by_player_id).length
              const parts = [`${hostCount} on list`]
              if (playerNameSubmissionCount > 0 && lobbyAllowsPlayerNameSubmissions(game)) {
                parts.push(`${playerNameSubmissionCount} from players`)
              }
              return `${parts.join(' · ')} → up to ${maxRounds} rounds`
            })()
          : roundLimitHint(participantInputs, gameType, gameGenderBased, participantOpts)
    const hotSeatEffective = hotSeatLobby ? hotSeatEffectiveRounds(hotSeatJoinedCount, game.rounds_count) : 0
    const roundsTooHigh = hotSeatLobby ? false : maxRounds > 0 && game.rounds_count > maxRounds
    const roundOptions =
      isPan
        ? panRoundPickerOptions(PAN_MAX_ROUNDS)
        : isBinaryLobby || isMlt || isNhie
        ? questionRoundPickerOptions(lobbyQuestionMax)
        : isWst
          ? questionRoundPickerOptions(lobbyQuestionMax)
          : kmkRoundPickerOptions(maxRounds)
    const voterCheck = hasVotersForPolls(roundParticipants, players)
    const wstSource = game?.wst_quote_source ?? 'player'
    const animeQuoteCount = animePool.length
    const playerQuoteCount = wstPool.length
    const totalQuotes = (wstSource === 'player' ? 0 : animeQuoteCount) + (wstSource === 'anime' ? 0 : playerQuoteCount)
    const canStart = isWst
      ? wstSource === 'anime'
        ? animeQuoteCount >= 2
        : wstSource === 'both'
          ? totalQuotes >= 2
          : participants.length >= 2 && wstSubmitters.length >= 2 && wstPool.length >= 2
      : panLobby
        ? players.length >= PAN_MIN_PLAYERS && !roundsTooHigh
        : hotSeatLobby
        ? hotSeatEffective >= HOT_SEAT_MIN_PLAYERS
        : isVoterOnly
          ? participants.length >= minPool &&
            players.length > 0 &&
            !roundsTooHigh &&
            (gameGenderBased ? voterCheck.ok : true)
          : isMlt
            ? players.length >= 2 && !roundsTooHigh
            : isBinaryLobby
              ? players.length > 0 && !roundsTooHigh && questionPoolCap(game, playerQuestionCount) > 0
              : isJoinersMode
                ? players.length > 0 &&
                  participants.length >= minPool &&
                  hasEnoughForRounds(participantInputs, gameType, participantOpts) &&
                  !roundsTooHigh &&
                  (gameGenderBased ? voterCheck.ok : true)
                : players.length > 0 &&
                  roundParticipants.length >= minPool &&
                  hasEnoughForRounds(participantInputs, gameType, participantOpts) &&
                  !roundsTooHigh &&
                  (gameGenderBased ? voterCheck.ok : true)

    const startDisabledHint = !canStart
      ? isWst && wstSource === 'anime' && animeQuoteCount < 2
        ? `Need 2+ anime quotes (${animeQuoteCount} loaded)`
        : isWst && wstSource === 'both' && totalQuotes < 2
          ? `Need 2+ total quotes (${totalQuotes} ready)`
          : isWst && wstSource === 'player' && participants.length < 2
            ? `Need at least 2 names on the list (${participants.length}/2)`
            : isWst && wstSource === 'player' && wstSubmitters.length < 2
              ? `Need 2+ players who claimed a name (${wstSubmitters.length} ready)`
              : isWst && wstSource === 'player' && wstPool.length < 2
                ? `Need 2+ quotes in the pool (${wstPool.length} submitted)`
                : isVoterOnly && participants.length < minPool
                  ? `Need at least ${minPool} names on the list (${participants.length}/${minPool})`
                  : isVoterOnly && players.length === 0
                    ? 'Waiting for voters to join…'
                    : isMlt && !isVoterOnly && players.length < 2
                      ? `Need at least 2 players (${players.length}/2)`
                      : panLobby && players.length < PAN_MIN_PLAYERS
                        ? `Need at least ${PAN_MIN_PLAYERS} players (${players.length}/${PAN_MIN_PLAYERS})`
                        : hotSeatLobby && hotSeatLegacyJoiners && players.length < HOT_SEAT_MIN_PLAYERS
                          ? `Need at least ${HOT_SEAT_MIN_PLAYERS} players (${players.length}/${HOT_SEAT_MIN_PLAYERS})`
                          : hotSeatLobby && !hotSeatLegacyJoiners && roundParticipants.length < HOT_SEAT_MIN_PLAYERS
                            ? `Need ${HOT_SEAT_MIN_PLAYERS}+ players who claimed a name (${roundParticipants.length}/${HOT_SEAT_MIN_PLAYERS})`
                            : hotSeatLobby && !hotSeatLegacyJoiners && participants.length < HOT_SEAT_MIN_PLAYERS
                              ? `Need at least ${HOT_SEAT_MIN_PLAYERS} names on the list (${participants.length}/${HOT_SEAT_MIN_PLAYERS})`
                              : isNhie && players.length === 0
                                ? 'Need at least 2 players to start'
                                : isWyr && players.length === 0
                                  ? 'Waiting for players…'
                                  : isJoinersMode
                                    ? participants.length < minPool
                                      ? `Need ${minPool - participants.length} more to start`
                                      : roundsTooHigh
                                        ? `Lower to ${maxRounds} rounds max`
                                        : gameGenderBased
                                          ? `Need ${minPool}+ of one gender to start`
                                          : `Need ${minPool}+ people to start`
                                    : players.length === 0
                                      ? 'Waiting for players…'
                                      : roundParticipants.length < minPool
                                        ? `Need ${minPool - roundParticipants.length} more to join (${roundParticipants.length}/${minPool})`
                                        : roundsTooHigh
                                          ? `Lower to ${maxRounds} rounds max`
                                          : !voterCheck.ok
                                            ? 'Need voters for each list'
                                            : gameGenderBased
                                              ? `Need ${minPool}+ joined of one gender`
                                              : `Need ${minPool}+ names joined`
      : null

    return (
      <HostPageShell gameCode={gameCode}>
        <PollHostPlayShell
          gameCode={gameCode}
          game={game}
          playerCount={players.length}
          onHostPlayerId={setHostPlayerId}
        >
        <HostGameHeader game={game} />
        <div className="text-center space-y-2 -mt-2">
            <p className="text-muted text-sm">
              {hotSeatLobby && hotSeatEffective > 0
                ? `${hotSeatEffective} rounds · ${game.timer_seconds}s each`
                : `${game.rounds_count} rounds · ${game.timer_seconds}s each`}
            </p>
            {(isBinaryLobby || isMlt || isNhie || isPan) &&
              ((parseQuestionSource(game.question_source, gameType) === 'custom' && customQuestionCount(game) > 0) ||
                (isTot && playerQuestionCount > 0)) && (
                <p className="text-faint text-xs">
                  {isTot && playerQuestionCount > 0
                    ? `${customQuestionCount(game)} uploaded · ${playerQuestionCount} from players`
                    : `${customQuestionCount(game)} custom questions loaded`}
                </p>
              )}
            <p className="text-[var(--primary)] text-xs font-medium">
              {isVoterOnly
                ? 'Import list — everyone on the list is in the poll; players join to vote'
                : isMlt
                  ? 'Most Likely To — players join and vote for a friend each round'
                  : isWst
                    ? 'Who Said This — players submit quotes in the lobby, then guess who said each one'
                    : isTot
                      ? 'This or That — your custom prompts, players pick A or B each round'
                      : isWyr
                        ? 'Would You Rather — players join and pick A or B each round'
                        : isPan
                          ? 'Pick a Number — take turns picking a hidden number, then answer the question it reveals'
                        : hotSeatLobby
                          ? 'Hot Seat — upload names, players claim theirs, then take turns in the spotlight'
                          : isJoinersMode
                            ? 'Join & play — joiners are the names in the poll'
                            : 'Pre-set roster — players claim their name from the list'}
            </p>
            <GameRulesLink gameType={gameType} />
        </div>

        <div className="glass-card p-4 space-y-3">
          <p className="text-muted text-xs uppercase tracking-wider">Rounds</p>
          {isWst ? (
            <>
              <p className="font-bold text-body text-2xl">{game.rounds_count}</p>
              <p className="text-faint text-xs">{roundsHint}</p>
            </>
          ) : isPan ? (
            <>
              {roundsHint && <p className="text-faint text-xs">{roundsHint}</p>}
              <p className="text-faint text-xs">{panRoundsHint(game.rounds_count, players.length)}</p>
              <div className="space-y-2">
                <p className="text-muted text-[10px] uppercase tracking-wider">Rounds</p>
                <input
                  type="number"
                  min={1}
                  max={PAN_MAX_ROUNDS}
                  step={1}
                  defaultValue={game.rounds_count}
                  key={`${game.rounds_count}-pan`}
                  disabled={updatingRounds}
                  onBlur={(e) => {
                    const n = clampPanRounds(e.target.value)
                    e.target.value = String(n)
                    if (n !== game.rounds_count) hostUpdateRounds(n)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                  className="input-field w-28 py-2 text-sm disabled:opacity-50"
                />
              </div>
              {roundOptions.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {roundOptions.map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={updatingRounds}
                      onClick={() => hostUpdateRounds(n)}
                      className={`min-w-[2.5rem] px-3 py-2 rounded-xl border text-sm font-semibold disabled:opacity-40 ${
                        game.rounds_count === n ? 'chip-active' : 'chip'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : hotSeatLobby ? (
            <>
              <p className="font-bold text-body text-2xl">{hotSeatEffective > 0 ? hotSeatEffective : '—'}</p>
              <p className="text-faint text-xs">
                {hotSeatLobbyRoundsHint(hotSeatJoinedCount, game.rounds_count, game.participant_mode)}
              </p>
              <div className="space-y-2 pt-2">
                <p className="text-muted text-[10px] uppercase tracking-wider">Max rounds (cap)</p>
                <input
                  type="number"
                  min={HOT_SEAT_MIN_PLAYERS}
                  max={hotSeatCapUpper}
                  step={1}
                  defaultValue={game.rounds_count}
                  key={`${game.rounds_count}-${hotSeatCapUpper}`}
                  disabled={updatingRounds}
                  onBlur={(e) => {
                    const n = clampHotSeatMaxCap(e.target.value, hotSeatCapUpper)
                    e.target.value = String(n)
                    if (n !== game.rounds_count) hostUpdateRounds(n)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                  className="input-field w-28 py-2 text-sm disabled:opacity-50"
                />
              </div>
            </>
          ) : isBinaryLobby || isMlt || isNhie ? (
            <>
              {roundsHint && <p className="text-faint text-xs">{roundsHint}</p>}
              <div className="space-y-2">
                <p className="text-muted text-[10px] uppercase tracking-wider">Rounds</p>
                <input
                  type="number"
                  min={1}
                  max={Math.max(lobbyQuestionMax, 1)}
                  step={1}
                  defaultValue={game.rounds_count}
                  key={`${game.rounds_count}-${lobbyQuestionMax}`}
                  disabled={updatingRounds || lobbyQuestionMax < 1}
                  onBlur={(e) => {
                    const n = clampLobbyQuestionRounds(e.target.value, lobbyQuestionMax)
                    e.target.value = String(n)
                    if (n !== game.rounds_count) hostUpdateRounds(n)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                  className="input-field w-28 py-2 text-sm disabled:opacity-50"
                />
              </div>
              {roundOptions.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {roundOptions.map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={n > maxRounds || updatingRounds}
                      onClick={() => hostUpdateRounds(n)}
                      className={`min-w-[2.5rem] px-3 py-2 rounded-xl border text-sm font-semibold disabled:opacity-40 ${
                        game.rounds_count === n ? 'chip-active' : 'chip'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
              {roundsTooHigh && (
                <p className="callout-warning">
                  {game.rounds_count} rounds is too many — pick {maxRounds} or fewer
                </p>
              )}
            </>
          ) : (
              isJoinersMode
                ? participants.length >= minPool && hasEnoughForRounds(participantInputs, gameType, participantOpts)
                : roundParticipants.length >= minPool &&
                  hasEnoughForRounds(participantInputs, gameType, participantOpts)
            ) ? (
            <>
              {roundsHint && <p className="text-faint text-xs">{roundsHint}</p>}
              <div className="flex gap-2 flex-wrap">
                {(roundOptions.length > 0 ? roundOptions : [1, 2, 3]).map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={n > maxRounds}
                    onClick={() => hostUpdateRounds(n)}
                    className={`min-w-[2.5rem] px-3 py-2 rounded-xl border text-sm font-semibold disabled:opacity-40 ${
                      game.rounds_count === n ? 'chip-active' : 'chip'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {roundsTooHigh && (
                <p className="callout-warning">
                  {game.rounds_count} rounds is too many for{' '}
                  {hotSeatLobby
                    ? hotSeatLegacyJoiners
                      ? players.length
                      : roundParticipants.length
                    : roundParticipants.length}{' '}
                  in the game — pick {maxRounds} or fewer
                </p>
              )}
            </>
          ) : (
            <p className="text-faint text-xs">
              {isBinaryLobby || isMlt
                ? 'Set how many questions to play'
                : hotSeatLobby
                  ? hotSeatLegacyJoiners
                    ? 'Need at least 3 players before you can set rounds'
                    : participants.length >= 3
                      ? 'Need at least 3 players to claim a name before you can set rounds'
                      : 'Need at least 3 names on the list before you can set rounds'
                  : isJoinersMode
                    ? gameGenderBased
                      ? `Need at least ${minPool} joined people of one gender before you can set rounds`
                      : `Need at least ${minPool} people to join before you can set rounds`
                    : supportsGender && !gameGenderBased
                      ? `Need at least ${minPool} names on the list before you can set rounds`
                      : supportsGender && gameGenderBased
                        ? `Need at least ${minPool} joined people of one gender before you can set rounds`
                        : `Need at least ${minPool} joined people of one gender before you can set rounds`}
            </p>
          )}
          <div className="pt-3 border-t border-theme">{timerControl}</div>
        </div>

        {gameSupportsViewerSetting(gameType) && (
          <div className="glass-card p-4 space-y-3">
            <p className="text-muted text-xs uppercase tracking-wider">Late joiners</p>
            <LateJoinPolicyToggle
              value={lateJoinPolicyFromGame(game)}
              onChange={hostUpdateLateJoinPolicy}
              disabled={updatingViewers}
              gameType={gameType}
            />
          </div>
        )}

        {playAgainNeedsSetup(game) && (() => {
          const poolLabels = hostPoolSetupLabels(game)
          const hostListCount = participants.filter((p) => !p.submitted_by_player_id).length
          return (
            <div className="glass-card p-4 space-y-3">
              <p className="text-muted text-xs uppercase tracking-wider">{poolLabels.title}</p>
              <p className="text-faint text-xs">
                {poolLabels.hasQuestions && poolLabels.hasParticipants
                  ? 'Keep your current lists or upload a new CSV before you start.'
                  : poolLabels.hasQuestions
                    ? 'Keep your loaded questions or upload a new CSV before you start.'
                    : 'Keep your current name list or upload a new CSV before you start.'}
              </p>
              {poolLabels.hasQuestions && (
                <p className="text-body text-sm">
                  {customQuestionCount(game)} question{customQuestionCount(game) === 1 ? '' : 's'} loaded
                </p>
              )}
              {poolLabels.hasParticipants && (
                <p className="text-body text-sm">
                  {hostListCount} name{hostListCount === 1 ? '' : 's'} on your list
                </p>
              )}
              <button
                type="button"
                onClick={() => openPoolSetup('lobby')}
                disabled={savingLobbyPool}
                className="btn-secondary w-full py-3"
              >
                {poolLabels.hasQuestions && poolLabels.hasParticipants
                  ? 'Change list or upload CSV'
                  : poolLabels.hasQuestions
                    ? 'Change questions or upload CSV'
                    : 'Change names or upload CSV'}
              </button>
            </div>
          )
        })()}

        {isWst && wstPoolStatus && (game?.wst_quote_source ?? 'player') !== 'anime' && (
          <div className="glass-card p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted text-xs uppercase tracking-wider">Quote pool</p>
              <span className="text-sm font-bold text-body">
                {wstPool.length} quote{wstPool.length === 1 ? '' : 's'} · {wstPoolStatus.submitted.length} /{' '}
                {wstPoolStatus.eligible.length} players ready
              </span>
            </div>
            <p className="text-faint text-xs">
              Remind anyone still waiting — each submitted quote becomes a round.
            </p>

            {wstPoolStatus.submitted.length > 0 && (
              <div className="space-y-2">
                <p className="text-muted text-[10px] uppercase tracking-wider">Submitted</p>
                <div className="flex flex-wrap gap-2">
                  {wstPoolStatus.submitted.map((p) => {
                    const count = wstPoolStatus.quoteCounts.get(p.id) ?? 0
                    return (
                      <span key={p.id} className="chip text-xs py-1 px-2 border-emerald-500/40 text-emerald-300">
                        ✓ {p.name}
                        {count > 1 ? ` (${count})` : ''}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {wstPoolStatus.awaitingQuote.length > 0 && (
              <div className="space-y-2">
                <p className="text-amber-400/90 text-[10px] uppercase tracking-wider font-semibold">
                  Waiting for quote ({wstPoolStatus.awaitingQuote.length})
                </p>
                <div className="space-y-1.5">
                  {wstPoolStatus.awaitingQuote.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2"
                    >
                      <span className="text-amber-300 text-sm shrink-0">⏳</span>
                      <span className="text-body text-sm font-medium flex-1 min-w-0 truncate">{p.name}</span>
                      <span className="text-faint text-[10px] uppercase tracking-wider shrink-0">No quote yet</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {wstPoolStatus.notClaimed.length > 0 && (
              <div className="space-y-2">
                <p className="text-muted text-[10px] uppercase tracking-wider">
                  Hasn&apos;t claimed a name ({wstPoolStatus.notClaimed.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {wstPoolStatus.notClaimed.map((p) => (
                    <span key={p.id} className="chip text-xs py-1 px-2 opacity-70">
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {wstPoolStatus.eligible.length === 0 && wstPoolStatus.notClaimed.length === 0 && (
              <p className="text-faint text-xs text-center py-2">No players joined yet</p>
            )}

            {wstPoolStatus.eligible.length > 0 &&
              wstPoolStatus.awaitingQuote.length === 0 &&
              wstPoolStatus.submitted.length >= 2 && (
                <p className="text-green-400 text-sm text-center">
                  Everyone who claimed a name has submitted — ready to start
                </p>
              )}

            {participants.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-theme">
                <div className="space-y-1">
                  <p className="text-muted text-[10px] uppercase tracking-wider">Host quotes ({hostPoolQuotes.length})</p>
                  <p className="text-faint text-xs">Add quotes yourself — each one becomes a round, same as player submissions.</p>
                </div>

                {hostPoolQuotes.length > 0 && (
                  <div className="space-y-2">
                    {hostPoolQuotes.map((entry) => {
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
                              disabled={hostQuoteSubmitting}
                              onClick={() => {
                                setHostEditingQuoteId(entry.id)
                                setHostQuoteInput(entry.quote_text)
                                setHostQuoteAuthorId(entry.author_participant_id)
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-faint hover:text-red-400 text-xs px-1"
                              disabled={hostQuoteSubmitting}
                              onClick={() => void handleDeleteHostQuote(entry.id)}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-body">
                    {hostEditingQuoteId
                      ? 'Edit host quote'
                      : hostPoolQuotes.length > 0
                        ? 'Add another host quote'
                        : 'Add a host quote'}
                  </p>
                  <textarea
                    value={hostQuoteInput}
                    onChange={(e) => setHostQuoteInput(e.target.value)}
                    placeholder="e.g. Roses are red"
                    maxLength={500}
                    rows={3}
                    className="input-field resize-none w-full"
                    disabled={hostQuoteSubmitting}
                  />
                  <div className="space-y-2">
                    <p className="text-faint text-xs uppercase tracking-wider">Who said this?</p>
                    <NameSearchPicker
                      options={wstTargets.map((p) => ({ id: p.id, name: p.name }))}
                      valueId={hostQuoteAuthorId}
                      onChange={setHostQuoteAuthorId}
                      searchPlaceholder="Search names…"
                      emptyMessage="No names match"
                      disabled={hostQuoteSubmitting}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSubmitHostQuote()}
                      disabled={!hostQuoteInput.trim() || !hostQuoteAuthorId || hostQuoteSubmitting}
                      className={
                        hostQuoteInput.trim() && hostQuoteAuthorId
                          ? 'btn-primary w-full'
                          : 'btn-secondary w-full opacity-60 cursor-not-allowed'
                      }
                    >
                      {hostQuoteSubmitting ? 'Saving…' : hostEditingQuoteId ? 'Save changes' : 'Add to Pool →'}
                    </button>
                    {hostEditingQuoteId && (
                      <button
                        type="button"
                        onClick={() => {
                          setHostEditingQuoteId(null)
                          setHostQuoteInput('')
                          setHostQuoteAuthorId(null)
                        }}
                        className="btn-secondary text-sm w-full"
                        disabled={hostQuoteSubmitting}
                      >
                        Cancel edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {isWst && (game?.wst_quote_source === 'anime' || game?.wst_quote_source === 'both') && (
          <div className="glass-card p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted text-xs uppercase tracking-wider">Anime quotes</p>
              <span className="text-sm font-bold text-body">{animePool.length} loaded</span>
            </div>

            {animePool.length === 0 && !animeFetching && (
              <button onClick={() => fetchAnimeQuotes(10)} className="btn-primary w-full">
                Fetch Anime Quotes
              </button>
            )}

            {animeFetching && (
              <div className="text-center py-6 space-y-2">
                <div className="animate-spin h-6 w-6 border-2 border-teal-400 border-t-transparent rounded-full mx-auto" />
                <p className="text-muted text-sm">Fetching quotes & characters...</p>
                <p className="text-faint text-xs">This can take 15-20 seconds</p>
              </div>
            )}

            {animeError && (
              <div className="text-red-400 text-sm text-center py-2">
                {animeError}
                <button onClick={() => fetchAnimeQuotes(10)} className="block mx-auto mt-2 text-xs underline">
                  Try again
                </button>
              </div>
            )}

            {animePool.length > 0 && (
              <div className="space-y-2">
                {animePool.map((q) => (
                  <div key={q.id} className="surface-inset rounded-xl px-3 py-2.5 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-body text-sm italic truncate">&ldquo;{q.quote_text}&rdquo;</p>
                        <p className="text-faint text-xs mt-0.5">{q.anime_name}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => rerollAnimeQuote(q.id)}
                          className="text-xs text-muted hover:text-body px-1.5 py-0.5 rounded-lg hover:bg-white/5"
                          title="Replace with a different quote"
                        >
                          ↻
                        </button>
                        <button
                          onClick={() => removeAnimeQuote(q.id)}
                          className="text-xs text-muted hover:text-red-400 px-1.5 py-0.5 rounded-lg hover:bg-white/5"
                          title="Remove this quote"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => fetchAnimeQuotes(5)}
                  disabled={animeFetching}
                  className="w-full text-center text-sm font-semibold text-[var(--primary)] hover:opacity-80 transition-opacity pt-1"
                >
                  {animeFetching ? 'Fetching...' : 'Fetch more quotes'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Players / in-the-game list */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-muted text-xs uppercase tracking-wider">
              {isVoterOnly ? 'Voters joined' : isJoinersMode ? 'In the game' : 'Players joined'}
            </p>
            <span className="bg-[var(--primary-strong)] text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {players.length}
            </span>
          </div>
          {!isJoinersMode && !isVoterOnly && !isWyr && !isNhie && !isMlt && !isWst && (
            <div className="space-y-1">
              <p className="text-muted text-xs uppercase tracking-wider">Rounds include:</p>
              <SegmentedControl
                value={game.participant_filter ?? 'all'}
                onChange={async (v) => {
                  const nextFilter = v as 'all' | 'joined'
                  setSavingParticipantFilter(true)
                  setGame((prev) => (prev ? { ...prev, participant_filter: nextFilter } : prev))
                  try {
                    const res = await fetch(`/api/games/${game.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ hostToken, participant_filter: nextFilter }),
                    })
                    const data = await res.json()
                    if (!res.ok) {
                      toast.error(data.error || 'Failed to save rounds setting')
                      const { data: gameData } = await supabase
                        .from('games')
                        .select('*')
                        .eq('id', gameCode)
                        .maybeSingle()
                      if (gameData) setGame(gameData)
                      return
                    }
                    if (data.game) setGame(data.game)
                  } finally {
                    setSavingParticipantFilter(false)
                  }
                }}
                options={[
                  { value: 'all', label: 'Everyone' },
                  { value: 'joined', label: 'Joined only' },
                ]}
              />
              {savingParticipantFilter && <p className="text-faint text-xs px-0.5">Saving…</p>}
              <p className="text-faint text-xs">
                {game.participant_filter === 'all'
                  ? `All ${participants.length} names will appear in rounds`
                  : `${roundParticipants.length} of ${participants.length} on the list have joined — only joined names appear in rounds`}
              </p>
            </div>
          )}
          {supportsGender && (
            <div className="space-y-1">
              <p className="text-muted text-xs uppercase tracking-wider">Who&apos;s in each round?</p>
              <p className="text-body text-sm font-semibold">{gameGenderBased ? 'Gender-based' : 'Names only'}</p>
              <p className="text-faint text-xs">
                {gameGenderBased
                  ? 'Same-gender groups each round — set when you created the game.'
                  : 'Anyone can appear in any round — set when you created the game.'}
              </p>
            </div>
          )}
          {showPairVoting && (
            <div className="space-y-1">
              <p className="text-muted text-xs uppercase tracking-wider">Pair voting</p>
              <SegmentedControl
                value={pairVoteMode}
                onChange={async (v) => {
                  const nextMode = v as PairVoteMode
                  setSavingPairVoteMode(true)
                  setGame((prev) => (prev ? { ...prev, pair_vote_mode: nextMode } : prev))
                  try {
                    const res = await fetch(`/api/games/${game.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ hostToken, pair_vote_mode: nextMode }),
                    })
                    const data = await res.json()
                    if (!res.ok) {
                      toast.error(data.error || 'Failed to save pair voting')
                      const { data: gameData } = await supabase
                        .from('games')
                        .select('*')
                        .eq('id', gameCode)
                        .maybeSingle()
                      if (gameData) setGame(gameData)
                      return
                    }
                    if (data.game) setGame(data.game)
                  } finally {
                    setSavingPairVoteMode(false)
                  }
                }}
                options={
                  isCustomTwoSlot ? customPairVoteModeOptions(getCustomSlots(game)) : pairVoteModeOptions(gameType)
                }
              />
              {savingPairVoteMode && <p className="text-faint text-xs px-0.5">Saving…</p>}
            </div>
          )}
          {(isBinaryLobby || isMlt || isNhie || isPan || isPeoplePollVoters) && (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-muted text-xs uppercase tracking-wider">Player submissions</p>
                <SegmentedControl
                  value={
                    (isPeoplePollVoters ? lobbyAllowsPlayerNameSubmissions(game) : lobbyAllowsPlayerQuestions(game))
                      ? 'on'
                      : 'off'
                  }
                  onChange={(v) => {
                    hostUpdatePlayerQuestions({ player_questions_enabled: v === 'on' })
                  }}
                  options={[
                    { value: 'on', label: 'Allowed' },
                    { value: 'off', label: 'Disabled' },
                  ]}
                />
                <p className="text-faint text-xs">
                  {isPeoplePollVoters
                    ? lobbyAllowsPlayerNameSubmissions(game)
                      ? playerNameSubmissionHint()
                      : 'Only names from your list will appear in rounds.'
                    : lobbyAllowsPlayerQuestions(game)
                      ? 'Players can submit their own questions in the lobby before start.'
                      : 'Only your uploaded or platform questions will be used.'}
                </p>
              </div>
              {(isPeoplePollVoters ? lobbyAllowsPlayerNameSubmissions(game) : lobbyAllowsPlayerQuestions(game)) && (
                <div className="space-y-1">
                  <p className="text-muted text-xs uppercase tracking-wider">
                    {isPeoplePollVoters ? 'Name mix' : 'Question mix'}
                  </p>
                  <SegmentedControl
                    value={parsePlayerQuestionsOrder(game.player_questions_order)}
                    onChange={(v) => {
                      hostUpdatePlayerQuestions({ player_questions_order: v as PlayerQuestionsOrder })
                    }}
                    options={playerQuestionsOrderOptions(game).map((opt) => ({
                      value: opt.value,
                      label: opt.label,
                    }))}
                  />
                  <p className="text-faint text-xs">
                    {
                      playerQuestionsOrderOptions(game).find(
                        (opt) => opt.value === parsePlayerQuestionsOrder(game.player_questions_order)
                      )?.hint
                    }
                  </p>
                </div>
              )}
              {savingPlayerQuestions && <p className="text-faint text-xs px-0.5">Saving…</p>}
            </div>
          )}
          {!isJoinersMode && !hotSeatLobby && isVoterOnly && (
            <p className="text-faint text-xs">
              {players.length} voter{players.length === 1 ? '' : 's'} joined — all {participants.length} names on the
              list appear in rounds
            </p>
          )}
          {hotSeatLobby && !hotSeatLegacyJoiners && (
            <p className="text-faint text-xs">
              {roundParticipants.length} of {participants.length} on the list have joined — only joined players take
              turns in the hot seat
            </p>
          )}
          {hotSeatLobby && hotSeatLegacyJoiners && (
            <p className="text-faint text-xs">
              {players.length} player{players.length === 1 ? '' : 's'} joined — everyone who joins takes a turn in the
              hot seat
            </p>
          )}
          {!isJoinersMode && gameGenderBased && (
            <p className="text-faint text-xs">Tap Male/Female to fix identity · Remove to kick someone out</p>
          )}
          {!isJoinersMode && !gameGenderBased && supportsGender && (
            <p className="text-faint text-xs">Remove to kick someone out</p>
          )}
          {isJoinersMode && participants.length > 0 && !hotSeatLobby && gameGenderBased && (
            <p className="text-faint text-xs">Tap to fix poll placement or gender · Remove to kick out</p>
          )}
          {isJoinersMode && participants.length > 0 && !hotSeatLobby && !gameGenderBased && (
            <p className="text-faint text-xs">Remove to kick someone out</p>
          )}
          {(playerOnlyLobby || hotSeatLegacyJoiners || !isJoinersMode
            ? players.length
            : joinerParticipantsWithPlayers.length) > 8 && (
            <div className="space-y-1">
              <div className="relative">
                <input
                  type="search"
                  value={playersSearch}
                  onChange={(e) => setPlayersSearch(e.target.value)}
                  placeholder={isJoinersMode ? 'Search in the game…' : 'Search players…'}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="input-field py-2 text-sm pr-9"
                />
                {playersSearch && (
                  <button
                    type="button"
                    onClick={() => setPlayersSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-body text-sm"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
              {playersSearch.trim() && (
                <p className="text-faint text-[10px] uppercase tracking-wider px-0.5">
                  {playerOnlyLobby || hotSeatLegacyJoiners || !isJoinersMode
                    ? filteredPlayers.length
                    : filteredJoinerParticipants.length}{' '}
                  of{' '}
                  {playerOnlyLobby || hotSeatLegacyJoiners || !isJoinersMode
                    ? players.length
                    : joinerParticipantsWithPlayers.length}{' '}
                  shown
                </p>
              )}
            </div>
          )}
          {playerOnlyLobby || hotSeatLegacyJoiners ? (
            filteredPlayers.length === 0 ? (
              <p className="text-faint text-sm">Waiting for people to join...</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {filteredPlayers.map((player) => (
                  <div
                    key={player.id}
                    className="surface-inset border border-theme rounded-xl px-3 py-2 flex items-center gap-2"
                  >
                    <Avatar name={player.name} size="sm" />
                    <span className="text-body text-sm font-medium truncate flex-1">{player.name}</span>
                  </div>
                ))}
              </div>
            )
          ) : isJoinersMode ? (
            participants.length === 0 ? (
              <p className="text-faint text-sm">Waiting for people to join...</p>
            ) : filteredJoinerParticipants.length === 0 ? (
              <p className="text-faint text-sm text-center py-4">No names match your search</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {filteredJoinerParticipants.map((part) => {
                  const player = players.find((p) => p.name === part.name)
                  if (!player) return null
                  const busy = adminBusy === part.id || adminBusy === player.id
                  const identity = resolvePlayerIdentity(player, participants)
                  return (
                    <div key={part.id} className="surface-inset border border-theme rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar name={part.name} photoUrl={part.photo_url} size="sm" />
                        <span className="text-body text-sm font-medium truncate flex-1">{part.name}</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => hostRemoveParticipant(part.id, part.name)}
                          className="text-red-400/80 text-xs shrink-0 hover:text-red-300 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                      {gameGenderBased && (
                        <>
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-[10px] uppercase text-faint w-10 shrink-0">Poll</span>
                            {(['female', 'male'] as const).map((g) => (
                              <button
                                key={g}
                                type="button"
                                disabled={busy}
                                onClick={() => hostUpdateParticipant(part.id, g)}
                                className={`text-[10px] px-2 py-1 rounded-lg border transition-colors ${
                                  part.gender === g ? 'chip-active' : 'chip'
                                }`}
                              >
                                {g === 'male' ? 'Men' : 'Women'}
                              </button>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-[10px] uppercase text-faint w-10 shrink-0">Gender</span>
                            {(['female', 'male'] as const).map((g) => (
                              <button
                                key={g}
                                type="button"
                                disabled={busy}
                                onClick={() => hostUpdatePlayerIdentity(player.id, g)}
                                className={`text-[10px] px-2 py-1 rounded-lg border transition-colors ${
                                  identity === g ? 'chip-active' : 'chip'
                                }`}
                              >
                                {genderLabel(g)}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          ) : players.length === 0 ? (
            <p className="text-faint text-sm">Waiting for players to join...</p>
          ) : filteredPlayers.length === 0 ? (
            <p className="text-faint text-sm text-center py-4">No names match your search</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {filteredPlayers.map((p) => {
                const identity = resolvePlayerIdentity(p, participants)
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 min-w-0 surface-inset border border-theme rounded-xl px-3 py-2"
                  >
                    <Avatar name={p.name} size="sm" />
                    <span className="text-body-muted text-sm truncate flex-1">{p.name}</span>
                    {gameGenderBased && (
                      <div className="flex gap-1 shrink-0">
                        {(['female', 'male'] as const).map((g) => (
                          <button
                            key={g}
                            type="button"
                            disabled={adminBusy === p.id}
                            onClick={() => hostUpdatePlayerIdentity(p.id, g)}
                            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                              identity === g ? 'chip-active' : 'chip'
                            }`}
                          >
                            {g === 'male' ? 'M' : 'F'}
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={adminBusy === p.id}
                      onClick={() => hostRemovePlayer(p.id, p.name)}
                      className="text-red-400/80 text-xs shrink-0 hover:text-red-300 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          {isJoinersMode && !isWyr && !isNhie && !isMlt && !isPan && !hotSeatLobby && participants.length > 0 && gameGenderBased && (
            <p className="text-faint text-xs text-center">
              {genderCounts.female} female · {genderCounts.male} male
            </p>
          )}
          {isJoinersMode &&
            !isWyr &&
            !isNhie &&
            !isMlt &&
            !hotSeatLobby &&
            participants.length > 0 &&
            !hasEnoughForRounds(participantInputs, gameType, participantOpts) && (
              <p className="callout-warning text-center">
                {gameGenderBased
                  ? `Need at least ${minPool} people of the same gender to start`
                  : `Need at least ${minPool} names to start`}
              </p>
            )}
          {!hotSeatLobby &&
            gameGenderBased &&
            !voterCheck.ok &&
            players.length > 0 &&
            roundParticipants.length >= minPool && <p className="callout-warning text-center">{voterCheck.message}</p>}
          {!isJoinersMode && !isVoterOnly && roundParticipants.length < minPool && players.length > 0 && (
            <p className="callout-warning text-center">
              Need at least {minPool} people to join before starting ({roundParticipants.length}/{minPool} joined)
            </p>
          )}
          {isVoterOnly && participants.length < minPool && (
            <p className="callout-warning text-center">
              Need at least {minPool} names on the list ({participants.length}/{minPool})
            </p>
          )}
        </div>

        {/* Participants preview (import mode only) */}
        {!isJoinersMode && (
          <div className="glass-card p-4 space-y-3">
            <p className="text-muted text-xs uppercase tracking-wider">On the list ({participants.length})</p>
            <div className="surface-inset border border-theme rounded-xl p-3 space-y-2">
              <p className="text-faint text-xs">Add someone to the list</p>
              <div className="flex gap-2">
                <input
                  value={addName}
                  onChange={(e) => {
                    setAddName(e.target.value)
                    if (addError) setAddError(null)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && hostAddParticipant()}
                  placeholder="Name"
                  className="input-field flex-1 py-2 text-sm"
                />
                {!isMltImport && gameGenderBased && (
                  <div className="flex gap-1 shrink-0">
                    {(['female', 'male'] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setAddGender(g)}
                        className={`text-[10px] px-2.5 py-2 rounded-lg border transition-colors ${
                          addGender === g ? 'chip-active' : 'chip'
                        }`}
                      >
                        {g === 'male' ? 'M' : 'F'}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={hostAddParticipant}
                  disabled={!addName.trim() || adding}
                  className="btn-secondary text-sm px-4 py-2 shrink-0 disabled:opacity-40"
                >
                  {adding ? '…' : 'Add'}
                </button>
              </div>
              {addError && <p className="text-red-300/90 text-xs">{addError}</p>}
            </div>
            <p className="text-faint text-xs">
              {isVoterOnly
                ? 'Everyone on the list can be voted for — players join separately to vote'
                : gameGenderBased
                  ? "Tap gender to correct · Remove if someone shouldn't be in the poll"
                  : 'Remove if someone should not be in the poll'}
            </p>
            {isVoterOnly && (
              <p className="text-faint text-xs text-center">
                {participants.length} on the list · {players.length} voter{players.length === 1 ? '' : 's'} joined
              </p>
            )}
            {participants.length > 8 && (
              <div className="space-y-1">
                <div className="relative">
                  <input
                    type="search"
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    placeholder="Search the list…"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="input-field py-2 text-sm pr-9"
                  />
                  {listSearch && (
                    <button
                      type="button"
                      onClick={() => setListSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-body text-sm"
                      aria-label="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {listSearch.trim() && (
                  <p className="text-faint text-[10px] uppercase tracking-wider px-0.5">
                    {filteredListParticipants.length} of {participants.length} shown
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredListParticipants.length === 0 ? (
                <p className="text-faint text-sm text-center py-6">
                  {listSearch.trim() ? 'No names match your search' : 'No one on the list yet'}
                </p>
              ) : (
                filteredListParticipants.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 min-w-0 surface-inset border border-theme rounded-xl px-3 py-2"
                  >
                    <span className="text-body-muted text-sm truncate flex-1">{p.name}</span>
                    {!isMltImport && gameGenderBased && (
                      <div className="flex gap-1 shrink-0">
                        {(['female', 'male'] as const).map((g) => (
                          <button
                            key={g}
                            type="button"
                            disabled={adminBusy === p.id}
                            onClick={() => hostUpdateParticipant(p.id, g)}
                            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                              p.gender === g ? 'chip-active' : 'chip'
                            }`}
                          >
                            {g === 'male' ? 'M' : 'F'}
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={adminBusy === p.id}
                      onClick={() => hostRemoveParticipant(p.id, p.name)}
                      className="text-red-400/80 text-xs shrink-0 hover:text-red-300 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <HostLobbyStartButton
          onClick={handleStart}
          disabled={!canStart || starting || savingPairVoteMode || savingPlayerQuestions}
          starting={starting}
          disabledHint={startDisabledHint}
          className="btn-primary w-full"
        />

        <HostEndGameButton
          gameCode={gameCode}
          hostToken={hostToken}
          onEnded={syncGameState}
          label="End lobby"
          confirmTitle="Close this lobby?"
          confirmMessage="Players will be disconnected. You can start a new game from Play again afterward."
          className="btn-secondary w-full text-muted"
        />

        </PollHostPlayShell>

        {game && (
          <PlayAgainSetup
            open={poolSetup.open}
            onClose={() => setPoolSetup((prev) => ({ ...prev, open: false }))}
            game={game}
            participants={participants}
            onConfirm={handlePoolSetupConfirm}
            loading={poolSetup.variant === 'lobby' ? savingLobbyPool : playingAgain}
            variant={poolSetup.variant}
          />
        )}
      </HostPageShell>
    )
  }

  // ── ACTIVE ────────────────────────────────────────────────────────────────
  if (game?.status === 'active' && currentRound) {
    const gameType = parseGameType(game.game_type)
    const isNameOnly = isNameOnlyPlayerJoin(gameType)
    const isMlt = isMostLikelyTo(gameType)
    const isNhie = isNeverHaveIEver(gameType)
    const isPan = isPickANumber(gameType)
    const isWst = isWhoSaidThis(gameType)
    const isTot = isThisOrThat(gameType)
    const isBinaryGame = isBinaryChoiceGame(gameType)
    const isHotSeatGame = isHotSeat(gameType)
    const roundVotes = votes.filter((v) => v.round_id === currentRound.id)
    const roundParts = participants.filter((p) => currentRound.participant_ids.includes(p.id))
    const roundParticipantGender = getRoundParticipantGender(currentRound.participant_ids, participants)
    const genderFreeVoting = isGenderFreeVoting(game)
    const roundGender = genderFreeVoting ? null : roundGenderLabel(roundParts.map((p) => p.gender))
    const voterHint = genderFreeVoting ? null : roundVoterLabel(roundParticipantGender)
    const eligible = eligibleVotersForRound(roundParticipantGender, players, gameType, game)
    const eligibleIds = new Set(eligible.map((p) => p.id))
    const eligibleVotes =
      isNameOnly || genderFreeVoting ? roundVotes : roundVotes.filter((v) => eligibleIds.has(v.player_id))
    const voteDenominator = isNameOnly || genderFreeVoting ? players.length : eligible.length
    const allVoted = eligibleVotes.length >= voteDenominator && voteDenominator > 0

    if (isWst) {
      const submitterName = wstSubmitterName(currentRound.submitter_player_id, players)
      const quote = currentRound.quote_text
      const voterTotal = Math.max(players.length - 1, 0)
      const voterVotes = quote ? roundVotes.filter((v) => v.player_id !== currentRound.submitter_player_id) : []
      const allVotedWst = voterVotes.length >= voterTotal && voterTotal > 0

      return (
        <HostPageShell gameCode={gameCode}>
          <PollHostPlayShell
            gameCode={gameCode}
            game={game}
            playerCount={players.length}
            onHostPlayerId={setHostPlayerId}
          >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-muted text-xs uppercase tracking-wider">Round</p>
              <p className="font-black text-body text-3xl">
                {currentRound.round_number}
                <span className="text-faint font-normal text-lg"> / {game.rounds_count}</span>
              </p>
              <p className="label-teal text-sm mt-1">Guess who said it</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <TimerDisplay seconds={timeLeft} total={game.timer_seconds} />
            </div>
          </div>

          <div className="glass-card p-5 space-y-3">
            {quote ? (
              <>
                <p className="text-muted text-xs uppercase tracking-wider text-center">Current quote</p>
                <p className="text-body text-base leading-snug text-center font-medium italic">&ldquo;{quote}&rdquo;</p>
              </>
            ) : (
              <p className="text-muted text-sm text-center">
                Waiting for {submitterName ?? 'writer'} to submit a quote…
              </p>
            )}
            {!quote && timeLeft === 0 && (
              <p className="callout-warning text-sm text-center">
                Writer didn&apos;t submit in time — skipping to the next round…
              </p>
            )}
          </div>

          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-muted text-xs uppercase tracking-wider">Guesses In</p>
              <span className={`text-sm font-bold ${allVotedWst ? 'text-green-400' : 'text-body-muted'}`}>
                {quote ? `${voterVotes.length} / ${voterTotal}` : '—'}
                {allVotedWst && ' · ending round...'}
              </span>
            </div>
            {quote && (
              <div className="h-2 bg-[var(--border-strong)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${allVotedWst ? 'bg-emerald-500' : 'bg-[var(--primary-strong)]'}`}
                  style={{ width: voterTotal > 0 ? `${(voterVotes.length / voterTotal) * 100}%` : '0%' }}
                />
              </div>
            )}
          </div>

          {activePlayerManagePanel}

          <button
            onClick={handleEndRound}
            disabled={ending || (quote ? voterVotes.length === 0 : timeLeft > 0)}
            className="btn-secondary"
          >
            {ending
              ? 'Ending...'
              : quote
                ? 'End Round Early'
                : timeLeft === 0
                  ? 'Skip Round (no quote)'
                  : 'End Round Early'}
          </button>
          </PollHostPlayShell>
        </HostPageShell>
      )
    }

    if (isNhie) {
      return (
        <HostPageShell gameCode={gameCode}>
          <PollHostPlayShell
            gameCode={gameCode}
            game={game}
            playerCount={players.length}
            onHostPlayerId={setHostPlayerId}
          >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted text-xs uppercase tracking-wider">Round</p>
              <p className="font-black text-body text-3xl">
                {currentRound.round_number}
                <span className="text-faint font-normal text-lg"> / {game.rounds_count}</span>
              </p>
            </div>
            <TimerDisplay seconds={timeLeft} total={game.timer_seconds} />
          </div>

          <div className="glass-card p-5 space-y-3">
            <p className="text-muted text-xs uppercase tracking-wider text-center">Never have I ever…</p>
            <p className="text-body text-base leading-snug text-center font-medium">{currentRound.mlt_question}</p>
          </div>

          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-muted text-xs uppercase tracking-wider">Votes In</p>
              <span className={`text-sm font-bold ${allVoted ? 'text-green-400' : 'text-body-muted'}`}>
                {eligibleVotes.length} / {players.length}
                {allVoted && ' · ending round...'}
              </span>
            </div>
            <div className="h-2 bg-[var(--border-strong)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${allVoted ? 'bg-emerald-500' : 'bg-[var(--primary-strong)]'}`}
                style={{ width: players.length > 0 ? `${(eligibleVotes.length / players.length) * 100}%` : '0%' }}
              />
            </div>
            <p className="text-faint text-xs text-center">Votes are anonymous — only totals are shown after the round</p>
          </div>

          {activePlayerManagePanel}

          <button onClick={handleEndRound} disabled={ending || eligibleVotes.length === 0} className="btn-secondary">
            {ending ? 'Ending...' : 'End Round Early'}
          </button>
          </PollHostPlayShell>
        </HostPageShell>
      )
    }

    if (isPan) {
      const pickerId = currentRound.submitter_player_id
      const pickerName = hotSeatPlayerDisplayName(pickerId, players, participants)
      const pickerVote = roundVotes.find((v) => v.player_id === pickerId)
      const poolSize = pickANumberPoolSize(game)
      const revealed = panRoundRevealed(currentRound)
      const timedOut = timeLeft === 0 && !revealed
      const panUsedNumbers = panUsedNumbersFromVotes(votes, currentRound.id)
      const panAvailableCount = poolSize - panUsedNumbers.size

      return (
        <HostPageShell gameCode={gameCode}>
          <PollHostPlayShell
            gameCode={gameCode}
            game={game}
            playerCount={players.length}
            onHostPlayerId={setHostPlayerId}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted text-xs uppercase tracking-wider">Round</p>
                <p className="font-black text-body text-3xl">
                  {currentRound.round_number}
                  <span className="text-faint font-normal text-lg"> / {game.rounds_count}</span>
                </p>
              </div>
              <TimerDisplay seconds={timeLeft} total={game.timer_seconds} />
            </div>

            <div className="glass-card p-5 space-y-3">
              <p className="text-violet-400 text-xs uppercase tracking-wider text-center">Picker this round</p>
              <p className="text-2xl font-black text-body text-center">{pickerName}</p>
              {!revealed ? (
                <p className="text-muted text-sm text-center">
                  {timedOut
                    ? 'Time ran out — advance to the next picker or wait for a late lock-in'
                    : panUsedNumbers.size > 0
                      ? `Waiting for a pick — ${panAvailableCount} of ${poolSize} numbers still available`
                      : `Waiting for a pick — list has ${poolSize} hidden questions (1–${poolSize})`}
                </p>
              ) : (
                <PanRoundResults
                  pickerName={pickerName}
                  pickedNumber={pickerVote?.picked_number}
                  question={currentRound.mlt_question ?? ''}
                />
              )}
            </div>

            {activePlayerManagePanel}

            <button
              onClick={handleEndRound}
              disabled={ending || (!revealed && !timedOut && eligibleVotes.length === 0)}
              className="btn-secondary"
            >
              {ending ? 'Ending...' : revealed ? 'Next picker' : timedOut ? 'Skip round' : 'End Round Early'}
            </button>
          </PollHostPlayShell>
        </HostPageShell>
      )
    }

    if (isMlt) {
      return (
        <HostPageShell gameCode={gameCode}>
          <PollHostPlayShell
            gameCode={gameCode}
            game={game}
            playerCount={players.length}
            onHostPlayerId={setHostPlayerId}
          >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted text-xs uppercase tracking-wider">Round</p>
              <p className="font-black text-body text-3xl">
                {currentRound.round_number}
                <span className="text-faint font-normal text-lg"> / {game.rounds_count}</span>
              </p>
            </div>
            <TimerDisplay seconds={timeLeft} total={game.timer_seconds} />
          </div>

          <div className="glass-card p-5 space-y-3">
            <p className="text-muted text-xs uppercase tracking-wider text-center">Most likely to…</p>
            <p className="text-body text-base leading-snug text-center font-medium">{currentRound.mlt_question}</p>
          </div>

          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-muted text-xs uppercase tracking-wider">Votes In</p>
              <span className={`text-sm font-bold ${allVoted ? 'text-green-400' : 'text-body-muted'}`}>
                {eligibleVotes.length} / {players.length}
                {allVoted && ' · ending round...'}
              </span>
            </div>
            <div className="h-2 bg-[var(--border-strong)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${allVoted ? 'bg-emerald-500' : 'bg-[var(--primary-strong)]'}`}
                style={{ width: players.length > 0 ? `${(eligibleVotes.length / players.length) * 100}%` : '0%' }}
              />
            </div>
            <p className="text-faint text-xs text-center">Votes are anonymous — winner is shown after the round</p>
          </div>

          {activePlayerManagePanel}

          <button onClick={handleEndRound} disabled={ending || eligibleVotes.length === 0} className="btn-secondary">
            {ending ? 'Ending...' : 'End Round Early'}
          </button>
          </PollHostPlayShell>
        </HostPageShell>
      )
    }

    if (isBinaryGame) {
      return (
        <HostPageShell gameCode={gameCode}>
          <PollHostPlayShell
            gameCode={gameCode}
            game={game}
            playerCount={players.length}
            onHostPlayerId={setHostPlayerId}
          >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted text-xs uppercase tracking-wider">Round</p>
              <p className="font-black text-body text-3xl">
                {currentRound.round_number}
                <span className="text-faint font-normal text-lg"> / {game.rounds_count}</span>
              </p>
            </div>
            <TimerDisplay seconds={timeLeft} total={game.timer_seconds} />
          </div>

          <div className="glass-card p-5 space-y-3">
            <p className="text-muted text-xs uppercase tracking-wider text-center">
              {isTot ? 'This or that…' : 'Would you rather…'}
            </p>
            <p className="text-body text-sm leading-relaxed text-center">
              <span className="label-violet font-medium">{currentRound.wyr_option_a}</span> or{' '}
              <span className="label-sky font-medium">{currentRound.wyr_option_b}</span>?
            </p>
          </div>

          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-muted text-xs uppercase tracking-wider">Votes In</p>
              <span className={`text-sm font-bold ${allVoted ? 'text-green-400' : 'text-body-muted'}`}>
                {eligibleVotes.length} / {players.length}
                {allVoted && ' · ending round...'}
              </span>
            </div>
            <div className="h-2 bg-[var(--border-strong)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${allVoted ? 'bg-emerald-500' : 'bg-[var(--primary-strong)]'}`}
                style={{ width: players.length > 0 ? `${(eligibleVotes.length / players.length) * 100}%` : '0%' }}
              />
            </div>
            <p className="text-faint text-xs text-center">
              Votes are anonymous — only totals are shown after the round
            </p>
          </div>

          {activePlayerManagePanel}

          <button onClick={handleEndRound} disabled={ending || eligibleVotes.length === 0} className="btn-secondary">
            {ending ? 'Ending...' : 'End Round Early'}
          </button>
          </PollHostPlayShell>
        </HostPageShell>
      )
    }

    if (isHotSeatGame) {
      const hotSeatPlayerId = currentRound.submitter_player_id
      const hotSeatPlayerName = hotSeatPlayerDisplayName(hotSeatPlayerId, players, participants)
      const joinedPlayers = hotSeatJoinedPlayers(players, participants, game.participant_mode)
      const submitters = joinedPlayers.filter((p) => p.id !== hotSeatPlayerId)
      const submitterIds = new Set(submitters.map((p) => p.id))
      const roundSubs = activeHotSeatSubs.filter((s) => s.round_id === currentRound.id && submitterIds.has(s.player_id))
      const submissionCount = roundSubs.length
      const submittedPlayerIds = new Set(roundSubs.map((s) => s.player_id))
      const allSubmitted = submissionCount >= submitters.length && submitters.length > 0

      return (
        <HostPageShell gameCode={gameCode}>
          <PollHostPlayShell
            gameCode={gameCode}
            game={game}
            playerCount={players.length}
            onHostPlayerId={setHostPlayerId}
          >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted text-xs uppercase tracking-wider">Round</p>
              <p className="font-black text-body text-3xl">
                {currentRound.round_number}
                <span className="text-faint font-normal text-lg"> / {game.rounds_count}</span>
              </p>
              <p className="text-amber-400/90 text-sm mt-1">Hot Seat</p>
            </div>
            <TimerDisplay seconds={timeLeft} total={game.timer_seconds} />
          </div>

          <div className="glass-card border-2 border-amber-500/40 rounded-2xl p-6 text-center">
            <div className="text-4xl mb-2">🪑🔥</div>
            <p className="text-amber-400 text-xs uppercase tracking-wider mb-1">In the hot seat</p>
            <p className="text-2xl font-black text-body">{hotSeatPlayerName}</p>
          </div>

          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-muted text-xs uppercase tracking-wider">Submissions In</p>
              <span className={`text-sm font-bold ${allSubmitted ? 'text-green-400' : 'text-body-muted'}`}>
                {submissionCount} / {submitters.length}
                {allSubmitted && ' · ending round...'}
              </span>
            </div>
            <div className="h-2 bg-[var(--border-strong)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${allSubmitted ? 'bg-emerald-500' : 'bg-[var(--primary-strong)]'}`}
                style={{
                  width: submitters.length > 0 ? `${(submissionCount / submitters.length) * 100}%` : '0%',
                }}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {submitters.map((p) => {
                const submitted = submittedPlayerIds.has(p.id)
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-1.5 text-xs ${submitted ? 'text-green-400' : 'text-faint'}`}
                  >
                    <span>{submitted ? '✓' : '○'}</span>
                    <span className="truncate">{p.name}</span>
                  </div>
                )
              })}
            </div>
            <p className="text-faint text-xs text-center">
              Answers stay anonymous — only who has submitted is shown here
            </p>
          </div>

          {activePlayerManagePanel}

          <button
            onClick={handleEndRound}
            disabled={ending}
            className={allSubmitted || timeLeft === 0 ? 'btn-primary animate-pulse' : 'btn-secondary'}
          >
            {ending
              ? 'Ending...'
              : allSubmitted
                ? '✓ End Round & Show Results'
                : submissionCount > 0
                  ? `End Round (${submissionCount}/${submitters.length} submitted)`
                  : 'End Round Early'}
          </button>
          </PollHostPlayShell>
        </HostPageShell>
      )
    }

    return (
      <HostPageShell gameCode={gameCode}>
        <PollHostPlayShell
          gameCode={gameCode}
          game={game}
          playerCount={players.length}
          onHostPlayerId={setHostPlayerId}
        >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted text-xs uppercase tracking-wider">Round</p>
            <p className="font-black text-body text-3xl">
              {currentRound.round_number}
              <span className="text-faint font-normal text-lg"> / {game.rounds_count}</span>
            </p>
          </div>
          <TimerDisplay seconds={timeLeft} total={game.timer_seconds} />
        </div>

        {/* Current trio */}
        <div>
          <p className="text-muted text-xs uppercase tracking-wider mb-2">
            This Round{roundGender ? ` · ${roundGender}` : ''}
          </p>
          {voterHint && <p className="text-[var(--primary)] text-xs mb-2">{voterHint}</p>}
          <div className="flex gap-2">
            {roundParts.map((p) => (
              <div key={p.id} className="flex-1 glass-card p-3 text-center">
                <Avatar name={p.name} photoUrl={p.photo_url} className="mx-auto mb-1" />
                <p className="text-body text-sm font-semibold truncate">{p.name}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Vote progress */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-muted text-xs uppercase tracking-wider">Votes In</p>
            <span className={`text-sm font-bold ${allVoted ? 'text-green-400' : 'text-body-muted'}`}>
              {eligibleVotes.length} / {eligible.length || 0}
              {allVoted && ' · ending round...'}
            </span>
          </div>
          <div className="h-2 bg-[var(--border-strong)] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${allVoted ? 'bg-emerald-500' : 'bg-[var(--primary-strong)]'}`}
              style={{ width: eligible.length > 0 ? `${(eligibleVotes.length / eligible.length) * 100}%` : '0%' }}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {!game.anonymous &&
              players.map((pl) => {
                const canVote = eligibleIds.has(pl.id)
                const voted = roundVotes.some((v) => v.player_id === pl.id)
                return (
                  <div
                    key={pl.id}
                    className={`flex items-center gap-1.5 text-xs ${
                      !canVote ? 'text-faint' : voted ? 'text-green-400' : 'text-faint'
                    }`}
                  >
                    <span>{!canVote ? '—' : voted ? '✓' : '○'}</span>
                    <span className="truncate">{pl.name}</span>
                    {!canVote && <span className="text-[10px] shrink-0">watch</span>}
                  </div>
                )
              })}
          </div>
        </div>

        {/* Live vote counts (if not anonymous) */}
        {isCustomGame(gameType) && game && !game.anonymous && roundVotes.length > 0 && (
          <div>
            <p className="text-muted text-xs uppercase tracking-wider mb-2">Live Tally</p>
            <div className="space-y-2">
              {roundParts.map((p) => {
                const slots = getCustomSlots(game)
                const counts = slots.map((slot) => ({
                  slot,
                  count: roundVotes.filter((v) => {
                    const assignments = v.pair_assignments as Record<string, string> | null
                    return assignments?.[p.id] === slot.key
                  }).length,
                }))
                return (
                  <div key={p.id} className="glass-card px-4 py-3 flex items-center gap-4">
                    <p className="font-semibold text-body w-24 truncate">{p.name}</p>
                    <div className="flex gap-3 text-sm">
                      {counts.map(({ slot, count }) => (
                        <span key={slot.key} style={{ color: slot.color }}>
                          {slot.emoji} {count}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {!isCustomGame(gameType) && !game.anonymous && roundVotes.length > 0 && (
          <div>
            <p className="text-muted text-xs uppercase tracking-wider mb-2">Live Tally</p>
            <div className="space-y-2">
              {roundParts.map((p) => {
                const counts = getVoteCategories(gameType).map((category) => {
                  const field =
                    category === 'kiss'
                      ? 'kiss_participant_id'
                      : category === 'marry'
                        ? 'marry_participant_id'
                        : 'kill_participant_id'
                  return {
                    meta: getCategoryMeta(gameType, category),
                    count: roundVotes.filter((v) => v[field] === p.id).length,
                  }
                })
                return (
                  <div key={p.id} className="glass-card px-4 py-3 flex items-center gap-4">
                    <p className="font-semibold text-body w-24 truncate">{p.name}</p>
                    <div className="flex gap-3 text-sm">
                      {counts.map(({ meta, count }) => (
                        <span key={meta.label} style={{ color: meta.color }}>
                          {meta.emoji} {count}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {activePlayerManagePanel}

        {/* End round button */}
        <button
          onClick={handleEndRound}
          disabled={ending}
          className={allVoted || timeLeft === 0 ? 'btn-primary animate-pulse' : 'btn-secondary text-muted'}
        >
          {ending
            ? 'Ending round...'
            : currentRound.round_number >= game.rounds_count
              ? allVoted
                ? '🏁 End Round & Show Results'
                : `End Round (${eligibleVotes.length}/${eligible.length} voted)`
              : allVoted
                ? '✓ End Round & Show Results'
                : `End Round (${eligibleVotes.length}/${eligible.length} voted)`}
        </button>
        <HostEndGameButton
          gameCode={gameCode}
          hostToken={hostToken}
          onEnded={syncGameState}
          className="btn-secondary w-full text-muted"
        />
        </PollHostPlayShell>
      </HostPageShell>
    )
  }

  // ── BETWEEN ROUNDS (results) ──────────────────────────────────────────────
  if (game?.status === 'active' && !currentRound && lastFinishedRound) {
    const gameType = parseGameType(game.game_type)
    const isTot = isThisOrThat(gameType)
    const isBinaryGame = isBinaryChoiceGame(gameType)
    const isMlt = isMostLikelyTo(gameType)
    const isNhie = isNeverHaveIEver(gameType)
    const isPan = isPickANumber(gameType)
    const isWst = isWhoSaidThis(gameType)
    const isHotSeatGame = isHotSeat(gameType)
    const isMltImport = isMltImportGame(game)
    const roundVotes = votes.filter((v) => v.round_id === lastFinishedRound.id)
    const roundParts = participants.filter((p) => lastFinishedRound.participant_ids.includes(p.id))
    const roundConfessions = confessions.filter((c) => c.round_id === lastFinishedRound.id)
    const roundGender = isGenderFreeVoting(game) ? null : roundGenderLabel(roundParts.map((p) => p.gender))
    const isLastRound = lastFinishedRound.round_number >= game.rounds_count
    const hotSeatPlayerName = isHotSeatGame
      ? hotSeatPlayerDisplayName(lastFinishedRound.submitter_player_id, players, participants)
      : ''
    const { countA, countB, voterCount } = tallyWyrVotes(roundVotes)
    const mltKind = isMltImport ? 'participant' : 'player'
    const mltTargets = mltVoteTargets(game, participants, players)
    const mltTally = tallyMltVotes(roundVotes, mltTargets, mltKind)

    return (
      <HostPageShell gameCode={gameCode}>
        <PollHostPlayShell
          gameCode={gameCode}
          game={game}
          playerCount={players.length}
          onHostPlayerId={setHostPlayerId}
        >
        <div className="text-center">
          <p className="text-muted text-xs uppercase tracking-wider">
            Round {lastFinishedRound.round_number} of {game.rounds_count}
            {!isBinaryGame && !isNhie && !isMlt && !isHotSeatGame && roundGender ? ` · ${roundGender}` : ''}
          </p>
          <h1 className="text-3xl font-black tracking-tight mt-1">
            {isHotSeatGame ? 'Hot Seat Reveal! 🪑🔥' : 'Results are in! 🗳️'}
          </h1>
          <p className="text-muted text-sm mt-1">
            {isHotSeatGame
              ? `Anonymous answers about ${hotSeatPlayerName}`
              : 'Players can see these results on their screens'}
          </p>
        </div>

        <RoundResultsShareBlock
          game={game}
          round={lastFinishedRound}
          votes={roundVotes}
          participants={participants}
          players={players}
        >
          {isHotSeatGame ? (
            <HotSeatRoundResults hotSeatPlayerName={hotSeatPlayerName} submissions={hotSeatSubmissions} />
          ) : isWst ? (
          (() => {
            if (isAnimeRound(lastFinishedRound)) {
              const meta = lastFinishedRound.anime_metadata as {
                anime_name: string
                correct_character: string
                choices: string[]
              }
              const animeTally = tallyAnimeWstVotes(roundVotes, meta.choices, meta.correct_character)
              return (
                <AnimeWstRoundResults
                  quote={lastFinishedRound.quote_text ?? '(no quote)'}
                  animeName={meta.anime_name}
                  rows={animeTally.rows}
                  voterCount={animeTally.voterCount}
                  maxCount={animeTally.maxCount}
                  topGuesses={animeTally.topGuesses}
                  correctCharacter={meta.correct_character}
                  correctCount={animeTally.correctCount}
                />
              )
            }
            const targets = wstVoteTargets(participants)
            const correctName = wstCorrectNameFromRound(lastFinishedRound, players, participants)
            const correctId = wstCorrectParticipantIdFromRound(lastFinishedRound, players)
            const wstTally = tallyWstVotes(roundVotes, targets, correctId)
            return (
              <WstRoundResults
                quote={lastFinishedRound.quote_text ?? '(no quote submitted)'}
                rows={wstTally.rows}
                voterCount={wstTally.voterCount}
                maxCount={wstTally.maxCount}
                topGuesses={wstTally.topGuesses}
                correctName={correctName}
                correctCount={wstTally.correctCount}
              />
            )
          })()
        ) : isNhie ? (
          <WyrRoundResults
            optionA={lastFinishedRound.mlt_question ?? ''}
            optionB=""
            countA={countA}
            countB={countB}
            voterCount={voterCount}
            mode="nhie"
          />
        ) : isPan ? (
          (() => {
            const pickerId = lastFinishedRound.submitter_player_id
            const pickerVote = roundVotes.find((v) => v.player_id === pickerId)
            const pickerName = hotSeatPlayerDisplayName(pickerId, players, participants)
            return pickerVote?.picked_number ? (
              <PanRoundResults
                pickerName={pickerName}
                pickedNumber={pickerVote.picked_number}
                question={lastFinishedRound.mlt_question ?? ''}
              />
            ) : (
              <p className="text-body text-center">{lastFinishedRound.mlt_question}</p>
            )
          })()
        ) : isMlt ? (
          <MltRoundResults
            question={lastFinishedRound.mlt_question ?? ''}
            rows={mltTally.rows}
            voterCount={mltTally.voterCount}
            maxCount={mltTally.maxCount}
            winnerNames={mltTally.winnerNames}
          />
        ) : isBinaryGame ? (
          <WyrRoundResults
            optionA={lastFinishedRound.wyr_option_a ?? ''}
            optionB={lastFinishedRound.wyr_option_b ?? ''}
            countA={countA}
            countB={countB}
            voterCount={voterCount}
            mode={isTot ? 'tot' : 'wyr'}
          />
        ) : isCustomGame(gameType) && game ? (
          (() => {
            const slots = getCustomSlots(game)
            const slotKeys = slots.map((s) => s.key)
            const nameMap = new Map(participants.map((p) => [p.id, p.name]))
            const tally = tallyCustomVotes(roundVotes, lastFinishedRound.participant_ids, nameMap, slotKeys)
            return <CustomRoundResults tally={tally} slots={slots} />
          })()
        ) : (
          (() => {
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
                          <div className="flex items-center gap-3 mb-3">
                            <Avatar name={name} size="sm" />
                            <p className="font-bold text-body text-lg">{name}</p>
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
          })()
          )}
        </RoundResultsShareBlock>

        {roundConfessions.length > 0 && (
          <div>
            <h2 className="text-muted text-xs uppercase tracking-wider mb-3">
              🔥 Hot Takes ({roundConfessions.length})
            </h2>
            <div className="space-y-2">
              {roundConfessions.map((c) => (
                <div key={c.id} className="glass-card px-4 py-3">
                  <p className="text-body-muted text-sm italic">&ldquo;{c.text}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activePlayerManagePanel}

        {isLastRound ? (
          game.auto_reveal ? (
            <p className="text-[var(--primary)] text-sm text-center animate-pulse">
              {finalRevealCountdown > 0
                ? isHotSeatGame
                  ? `Final results in ${finalRevealCountdown}s…`
                  : `Final leaderboard in ${finalRevealCountdown}s…`
                : isHotSeatGame
                  ? 'Final results in a few seconds...'
                  : 'Final leaderboard in a few seconds...'}
            </p>
          ) : (
            <button onClick={handleFinishGame} disabled={finishing} className="btn-primary">
              {finishing ? 'Loading...' : isHotSeatGame ? '🏆 Show Final Results' : '🏆 Show Final Leaderboard'}
            </button>
          )
        ) : (
          <>
            <button onClick={handleNextRound} disabled={advancing} className="btn-primary">
              {advancing ? 'Starting...' : `→ Start Round ${lastFinishedRound.round_number + 1}`}
            </button>
            {!advancing && nextRoundCountdown > 0 && (
              <p className="text-faint text-sm text-center">
                Auto-starting in {nextRoundCountdown}s unless you tap above
              </p>
            )}
            <HostEndGameButton
              gameCode={gameCode}
              hostToken={hostToken}
              onEnded={syncGameState}
              className="btn-secondary w-full text-muted"
            />
          </>
        )}
        </PollHostPlayShell>
      </HostPageShell>
    )
  }

  // ── FINISHED ──────────────────────────────────────────────────────────────
  if (game?.status === 'finished') {
    const gameType = parseGameType(game.game_type)
    const isTot = isThisOrThat(gameType)
    const isWyr = isWouldYouRather(gameType)
    const isBinaryGame = isBinaryChoiceGame(gameType)
    const isMlt = isMostLikelyTo(gameType)
    const isNhie = isNeverHaveIEver(gameType)
    const isWst = isWhoSaidThis(gameType)
    const isHotSeatGame = isHotSeat(gameType)
    const isMltImport = isMltImportGame(game)
    const showPollLeaderboards = !isBinaryGame && !isNhie && !isMlt && !isWst && !isCustomGame(gameType) && !isHotSeatGame
    const genderBasedLeaderboards = showPollLeaderboards && isGameGenderBased(game)
    const namesOnlyLeaderboards = showPollLeaderboards && isGenderFreeVoting(game)
    const playedParticipants = filterParticipantsInRounds(participants, allRounds)
    const pollCount = mltVoteTargets(game, participants, players).length
    const wstScores = isWst ? tallyWstPlayerScores(allRounds, votes, players) : []
    const achievements = computeAchievements(game, participants, allRounds, votes, players)
    const hasFinalLeaderboardSnapshot =
      (isWst && wstScores.length > 0) ||
      isCustomGame(gameType) ||
      genderBasedLeaderboards ||
      namesOnlyLeaderboards
    const showFinalShareResults = !isTot && !isWyr && !isNhie && !isMlt && !isHotSeatGame

    return (
      <HostPageShell gameCode={gameCode}>
        <PollHostPlayShell
          gameCode={gameCode}
          game={game}
          playerCount={players.length}
          onHostPlayerId={setHostPlayerId}
        >
        <div className="text-center">
          <div className="text-4xl mb-2">🏆</div>
          <h1 className="text-3xl font-black text-body">{game.title}</h1>
          <p className="text-muted">
            {players.length} players · {allRounds.length} rounds
            {isMltImport
              ? ` · ${pollCount} in poll`
              : isWst
                ? ` · ${participants.length} names`
                : !isBinaryGame && !isNhie && !isMlt
                  ? ` · ${playedParticipants.length} in game`
                  : ''}
          </p>
        </div>

        <div className="glass-card p-4 space-y-3">
          <p className="text-muted text-xs uppercase tracking-wider text-center">What&apos;s next?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={openPlayAgain}
              disabled={playingAgain}
              className="btn-primary py-3 flex flex-col items-center gap-0.5 min-h-[3.25rem]"
            >
              <span>{playingAgain ? 'Resetting…' : '↻ Play Again'}</span>
              <span className="text-[10px] font-normal opacity-80 leading-tight">Same room & link</span>
            </button>
            <button
              type="button"
              onClick={() => router.push('/games')}
              className="btn-secondary py-3 flex flex-col items-center gap-0.5 min-h-[3.25rem]"
            >
              <span>Create a new game</span>
              <span className="text-[10px] font-normal text-faint leading-tight">Browse all games</span>
            </button>
          </div>
        </div>

        {hasFinalLeaderboardSnapshot ? (
          <FinalResultsShareBlock
            game={game}
            participants={participants}
            votes={votes}
            rounds={allRounds}
            players={players}
            showCreateNewGame={false}
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
              />
            )}

            {isCustomGame(gameType) && game
              ? (() => {
                  const slots = getCustomSlots(game)
                  const leaderboard = buildCustomLeaderboard(votes, participants, slots)
                  return (
                    <div className="glass-card border border-theme-strong p-4 space-y-4">
                      <p className="text-muted text-xs uppercase tracking-wider text-center">Final Leaderboard</p>
                      {leaderboard.map((entry) => (
                        <div key={entry.slot.key} className="space-y-1">
                          <p className="text-sm font-semibold" style={{ color: entry.slot.color }}>
                            {entry.slot.emoji} Most {entry.slot.label}
                          </p>
                          {entry.entries.slice(0, 3).map((e, i) => (
                            <p key={e.name} className="text-body text-sm pl-6">
                              {i === 0 ? '\u{1F3C6}' : `${i + 1}.`} {e.name} ({e.count} votes)
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                })()
              : null}

            {genderBasedLeaderboards && (
              <FinalGenderLeaderboards
                gameType={gameType}
                participants={participants}
                rounds={allRounds}
                votes={votes}
                TopCard={StatCard}
              />
            )}

            {namesOnlyLeaderboards && (
              <FinalOverallLeaderboards
                gameType={gameType}
                participants={participants}
                rounds={allRounds}
                votes={votes}
                TopCard={StatCard}
              />
            )}
          </FinalResultsShareBlock>
        ) : showFinalShareResults ? (
          <ShareResults game={game} participants={participants} votes={votes} rounds={allRounds} players={players} />
        ) : null}

        <AchievementsShareBlock achievements={achievements} gameTitle={game.title} />

        {isNhie ? (
          <div className="space-y-8">
            {allRounds.map((round) => {
              const roundVotes = votes.filter((v) => v.round_id === round.id)
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
                    mode="nhie"
                  />
                </div>
              )
            })}
          </div>
        ) : isBinaryGame ? (
          <div className="space-y-8">
            {allRounds.map((round) => {
              const roundVotes = votes.filter((v) => v.round_id === round.id)
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
                    mode={isTot ? 'tot' : 'wyr'}
                  />
                </div>
              )
            })}
          </div>
        ) : isWst ? (
          <div className="space-y-8">
            {allRounds.map((round) => {
              const roundVotes = votes.filter((v) => v.round_id === round.id)
              if (isAnimeRound(round)) {
                const meta = round.anime_metadata as {
                  anime_name: string
                  correct_character: string
                  choices: string[]
                }
                const animeTally = tallyAnimeWstVotes(roundVotes, meta.choices, meta.correct_character)
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
                  />
                </div>
              )
            })}
          </div>
        ) : isMlt ? (
          <div className="space-y-8">
            {allRounds.map((round) => {
              const roundVotes = votes.filter((v) => v.round_id === round.id)
              const mltKind = isMltImport ? 'participant' : 'player'
              const mltTargets = mltVoteTargets(game, participants, players)
              const { rows, voterCount, maxCount, winnerNames } = tallyMltVotes(roundVotes, mltTargets, mltKind)
              return (
                <div key={round.id}>
                  <h2 className="text-muted text-xs uppercase tracking-wider mb-3">Round {round.round_number}</h2>
                  <MltRoundResults
                    question={round.mlt_question ?? ''}
                    rows={rows}
                    voterCount={voterCount}
                    maxCount={maxCount}
                    winnerNames={winnerNames}
                  />
                </div>
              )
            })}
          </div>
        ) : isHotSeatGame ? (
          <div className="space-y-8">
            <h2 className="text-muted text-xs uppercase tracking-wider">All round results</h2>
            {allRounds.map((round) => {
              const hotSeatPlayerName = hotSeatPlayerDisplayName(round.submitter_player_id, players, participants)
              const roundSubs = allHotSeatSubmissions.filter((s) => s.round_id === round.id)
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
        ) : isCustomGame(gameType) && game ? (
          <div className="space-y-8">
            <h2 className="text-muted text-xs uppercase tracking-wider">All round results</h2>
            {allRounds.map((round) => {
              const roundVotesForRound = votes.filter((v) => v.round_id === round.id)
              const slots = getCustomSlots(game)
              const slotKeys = slots.map((s) => s.key)
              const nameMap = new Map(participants.map((p) => [p.id, p.name]))
              const tally = tallyCustomVotes(roundVotesForRound, round.participant_ids, nameMap, slotKeys)
              return (
                <div key={round.id}>
                  <h2 className="text-muted text-xs uppercase tracking-wider mb-3">Round {round.round_number}</h2>
                  <CustomRoundResults tally={tally} slots={slots} />
                </div>
              )
            })}
          </div>
        ) : genderBasedLeaderboards ? (
          <FinalGenderBreakdown gameType={gameType} participants={participants} rounds={allRounds} votes={votes} />
        ) : namesOnlyLeaderboards ? (
          <FinalOverallBreakdown gameType={gameType} participants={participants} rounds={allRounds} votes={votes} />
        ) : null}

        {/* Confessions / hot takes */}
        {confessions.length > 0 && (
          <div>
            <h2 className="text-muted text-xs uppercase tracking-wider mb-3">🔥 Hot Takes ({confessions.length})</h2>
            <div className="space-y-2">
              {confessions.map((c) => (
                <div key={c.id} className="glass-card px-4 py-3">
                  <p className="text-body-muted text-sm italic">&ldquo;{c.text}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        )}
        </PollHostPlayShell>
        {game && (
          <PlayAgainSetup
            open={poolSetup.open}
            onClose={() => setPoolSetup((prev) => ({ ...prev, open: false }))}
            game={game}
            participants={participants}
            onConfirm={handlePoolSetupConfirm}
            loading={poolSetup.variant === 'lobby' ? savingLobbyPool : playingAgain}
            variant={poolSetup.variant}
          />
        )}
      </HostPageShell>
    )
  }

  return null
}

// ── Sub-components ────────────────────────────────────────────────────────

function TimerDisplay({ seconds, total }: { seconds: number; total: number }) {
  const color = seconds <= 5 ? 'text-red-400' : seconds <= 10 ? 'text-amber-400' : 'text-green-400'
  return (
    <div className="text-right">
      <p className={`text-4xl font-black tabular-nums ${color} ${seconds <= 5 ? 'animate-pulse' : ''}`}>{seconds}</p>
      <div className="w-20 h-1.5 progress-track mt-1 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${seconds <= 5 ? 'bg-red-500' : seconds <= 10 ? 'bg-amber-500' : 'bg-green-500'}`}
          style={{ width: total > 0 ? `${(seconds / total) * 100}%` : '0%' }}
        />
      </div>
    </div>
  )
}

function StatCard({
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
      {count !== undefined && <p className="text-muted text-xs">{count}v</p>}
    </div>
  )
}
