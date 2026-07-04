'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTournamentRealtime } from '@/hooks/useTournamentRealtime'
import type { Tournament, TournamentPlayer, TournamentGame } from '@/types/tournament'
import type { TriviaQuestion } from '@/types'
import { TOURNAMENT_ELIGIBLE_TYPES } from '@/lib/tournament-validation'
import { groupRoundLabel, resolveGroupSize, roundLabel } from '@/lib/tournament-bracket'
import { clampSchoolClassCount, hasGraduated, schoolClassLabel } from '@/lib/tournament-school'
import { gameTypeLabel } from '@/lib/game-types'
import {
  parseTriviaQuestionImport,
  parseExcelTriviaQuestionImport,
  formatTriviaImportSummary,
  questionSampleFile,
} from '@/lib/custom-questions'
import { PageShell, Field, PrimaryBtn } from '@/components/ui/PageShell'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { TournamentShareLeaderboard } from '@/components/tournament/TournamentShareLeaderboard'
import { TournamentBracketBoard } from '@/components/tournament/TournamentBracketBoard'
import { TournamentContinueCard, TournamentResumeEntry } from '@/components/tournament/TournamentPlayerCode'
import { GameLinkQrModal } from '@/components/GameLinkQrModal'
import { tournamentHostUrl, shareOrigin } from '@/lib/site'
import { copyToClipboard } from '@/lib/copy'
import {
  TournamentGameConfigFields,
  defaultGameConfigValue,
  gameConfigValueFromStored,
  gameConfigRequestBody,
  formatHasGameConfig,
  type TournamentGameConfigValue,
} from '@/components/tournament/TournamentGameConfigFields'

/**
 * Whether a tournament player is in a bracket match — a chess duel (player_a/b)
 * or a Whot/Scrabble group room (member_ids). Lets one code path serve both.
 */
function matchHasPlayer(g: TournamentGame, playerId: string): boolean {
  if (g.player_a_id === playerId || g.player_b_id === playerId) return true
  return (g.member_ids ?? []).includes(playerId)
}

/** All tournament-player ids in a match — duel pair or group room. */
function matchMemberIds(g: TournamentGame): string[] {
  if (g.member_ids?.length) return g.member_ids
  return [g.player_a_id, g.player_b_id].filter((id): id is string => Boolean(id))
}

/** How a head-to-head match was decided, for the bracket results line. */
function winReasonLabel(reason?: string | null): string {
  switch (reason) {
    case 'checkmate':
      return ' by checkmate'
    case 'timeout':
      return ' on time'
    case 'resignation':
      return ' by resignation'
    case 'walkover':
      return ' — opponent removed'
    default:
      return ''
  }
}

const GAME_TYPE_LABELS: Record<string, string> = {
  trivia: 'Trivia',
  scrabble: 'Scrabble',
  yahtzee: 'Yahtzee',
  ludo: 'Ludo',
  whot: 'Whot',
  'crazy-eights': 'Crazy Eights',
  monopoly: 'Monopoly',
  'word-hunt': 'Word Hunt',
  'i-call-on': 'I Call On',
  chess: 'Chess',
  checkers: 'Checkers',
  bingo: 'Bingo',
  'who-said-this': 'Who Said This',
  'describe-it': 'Describe It',
  codewords: 'Codewords',
}

export default function TournamentLobbyPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const tournamentId = (Array.isArray(code) ? code[0] : code).toUpperCase()
  const { confirm } = useConfirm()
  const { success, error: toastError } = useToast()

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [players, setPlayers] = useState<TournamentPlayer[]>([])
  const [games, setGames] = useState<TournamentGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [playerName, setPlayerName] = useState('')
  const [joined, setJoined] = useState(false)
  const [joinError, setJoinError] = useState('')
  // This player's private code (cross-device resume + seat reclaim), read from
  // localStorage; empty for the host or before joining.
  const [myCode, setMyCode] = useState('')
  const [hostQrOpen, setHostQrOpen] = useState(false)
  // Visitor chose "just watching" — opts out of playing (no roster slot) and gets
  // auto-forwarded into each game as a viewer.
  const [spectating, setSpectating] = useState(false)
  const watchedGameRef = useRef<string | null>(null)

  const [selectedGameType, setSelectedGameType] = useState('trivia')
  const [roundsCount, setRoundsCount] = useState('10')
  const [timerSeconds, setTimerSeconds] = useState('30')
  // Head-to-head: shared per-player chess clock for a round's matches.
  // Fallback per-player clock sent when starting a round for older chess
  // tournaments whose game_config has no stored timer (newer ones set it at
  // creation; the round route prefers that). No UI — hence no setter.
  const [h2hTimer] = useState('600')
  const [actionLoading, setActionLoading] = useState(false)

  const [questionSource, setQuestionSource] = useState<'platform' | 'custom'>('platform')
  const [customTrivia, setCustomTrivia] = useState<TriviaQuestion[]>([])
  // Size of the custom pack carried over from an earlier game (null if none). Lets the
  // lobby show the pack is still loaded after a reload/new tab, where local upload state
  // has reset. The server reuses this pack on Start unless a fresh file is uploaded.
  const [carriedCustomCount, setCarriedCustomCount] = useState<number | null>(null)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const forwardedGameRef = useRef<string | null>(null)

  // Host edit-settings panel
  const [showEdit, setShowEdit] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editTarget, setEditTarget] = useState('')
  const [editMax, setEditMax] = useState('')
  const [editLives, setEditLives] = useState(false)
  const [editStartingLives, setEditStartingLives] = useState(3)
  const [editEliminate, setEditEliminate] = useState(1)
  const [editGameConfig, setEditGameConfig] = useState<TournamentGameConfigValue>(defaultGameConfigValue())
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  const hostToken = typeof window !== 'undefined' ? localStorage.getItem(`tournament_host_${tournamentId}`) : null
  const isHost = Boolean(hostToken)

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`)
      if (!res.ok) {
        setError('Tournament not found')
        return
      }
      const data = await res.json()
      setTournament(data.tournament)
      setPlayers(data.players)
      setGames(data.games)
      setCarriedCustomCount(data.carriedCustomCount ?? null)
    } catch {
      setError('Failed to load tournament')
    } finally {
      setLoading(false)
    }
  }, [tournamentId])

  useEffect(() => {
    fetchState()
  }, [fetchState])

  useTournamentRealtime(tournamentId, fetchState)

  // The "in the room" presence dots come from each staged game's own player roster,
  // which the tournament realtime channel doesn't watch — so a player joining their
  // room fires no update here and the host would keep seeing a stale "not in the room"
  // marker. While a round is staged (pending rooms with players filing in), poll so
  // the host sees who's actually ready before starting or removing anyone.
  const hasStagedRoom = games.some((g) => g.status === 'pending' && Boolean(g.game_id))
  useEffect(() => {
    if (!isHost || !hasStagedRoom) return
    const t = setInterval(fetchState, 4000)
    return () => clearInterval(t)
  }, [isHost, hasStagedRoom, fetchState])

  useEffect(() => {
    const savedName = localStorage.getItem(`tournament_player_${tournamentId}`)
    if (savedName) {
      setPlayerName(savedName)
      setJoined(true)
    }
    setMyCode(localStorage.getItem(`tournament_ptoken_${tournamentId}`) ?? '')
    if (localStorage.getItem(`tournament_spectator_${tournamentId}`) === '1') {
      setSpectating(true)
    }
  }, [tournamentId])

  // Cross-device entry: a host or player opening their shared link carries their
  // credential in the URL — the host token (like a normal game's host link) or the
  // player's resume code (like a normal game's ?player= link). Save it to this device,
  // then strip it from the address bar so it isn't shoulder-surfed or re-shared. A
  // player code is exchanged (server-side) for their name + seat.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const host = params.get('host')
    const ptoken = params.get('player')
    if (!host && !ptoken) return

    if (host) localStorage.setItem(`tournament_host_${tournamentId}`, host)

    const strip = () => {
      const url = new URL(window.location.href)
      url.searchParams.delete('host')
      url.searchParams.delete('player')
      window.history.replaceState({}, '', url.pathname + url.search)
    }

    if (ptoken) {
      void (async () => {
        try {
          const res = await fetch(`/api/tournaments/${tournamentId}/player-resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: ptoken }),
          })
          const data = await res.json()
          if (res.ok && data.playerName) {
            localStorage.setItem(`tournament_player_${tournamentId}`, data.playerName)
            localStorage.setItem(`tournament_ptoken_${tournamentId}`, String(data.token))
            setPlayerName(data.playerName)
            setMyCode(String(data.token))
            setJoined(true)
          } else {
            setJoinError(data.error ?? 'Could not restore your player code')
          }
        } finally {
          strip()
          fetchState()
        }
      })()
    } else {
      strip()
      // Host credential is read from localStorage at render — nudge a re-render.
      fetchState()
    }
  }, [tournamentId, fetchState])

  // Auto-forward opted-in spectators into each game as a viewer when it starts.
  // (Head-to-head runs many simultaneous matches — spectators pick one from the
  // bracket board rather than being pulled into a single game.)
  useEffect(() => {
    if (joined || isHost || !spectating || tournament?.status === 'finished') return
    // Bracket-style formats run many simultaneous rooms — spectators pick one from
    // the board rather than being pulled into a single game. Scrabble knockout plays
    // in rooms too, so it's excluded here as well.
    if (
      tournament?.format === 'head-to-head' ||
      tournament?.format === 'school' ||
      (tournament?.format === 'knockout' && resolveGroupSize(tournament.game_config, tournament.game_type) > 2)
    )
      return
    const active = games.find((g) => g.status === 'active')
    if (!active || watchedGameRef.current === active.game_id) return
    watchedGameRef.current = active.game_id
    router.push(`/game/${active.game_id}?tournament=${tournamentId}&watch=1`)
  }, [joined, isHost, spectating, tournament?.status, games, tournamentId, router])

  // Auto-forward joined players into a game as soon as the host starts it, so
  // they don't have to find it themselves. The host stays on the lobby to manage.
  useEffect(() => {
    if (!joined || isHost || tournament?.status === 'finished') return
    if (tournament?.format !== 'round-robin') return
    const name = localStorage.getItem(`tournament_player_${tournamentId}`)
    // Eliminated players stay on the lobby to spectate — don't pull them into games.
    const me = name ? players.find((p) => p.player_name.toLowerCase() === name.toLowerCase()) : null
    if (me?.is_eliminated) return
    const active = games.find((g) => g.status === 'active')
    if (!active || forwardedGameRef.current === active.game_id) return
    forwardedGameRef.current = active.game_id
    const suffix = name ? `?name=${encodeURIComponent(name)}&tournament=${tournamentId}` : ''
    router.push(`/game/${active.game_id}${suffix}`)
  }, [joined, isHost, tournament?.status, tournament?.format, games, players, tournamentId, router])

  // Trivia knockout: forward every surviving player into the round's one group game
  // once it's staged (pending), so they're in the room before the host starts it.
  // Scrabble knockout runs in rooms — its players are forwarded to their own room by
  // the group-room effect below, not into a single shared game.
  useEffect(() => {
    if (!joined || isHost || tournament?.format !== 'knockout' || tournament?.status === 'finished') return
    if (resolveGroupSize(tournament.game_config, tournament.game_type) > 2) return
    const name = localStorage.getItem(`tournament_player_${tournamentId}`)
    const me = name ? players.find((p) => p.player_name.toLowerCase() === name.toLowerCase()) : null
    if (!me || me.is_eliminated) return
    const roundNums = games.map((g) => g.round_number ?? 0)
    const currentRound = roundNums.length ? Math.max(...roundNums) : 0
    if (!currentRound) return
    const roundGame = games.find(
      (g) => g.round_number === currentRound && g.game_id && (g.status === 'pending' || g.status === 'active')
    )
    if (!roundGame?.game_id || forwardedGameRef.current === roundGame.game_id) return
    forwardedGameRef.current = roundGame.game_id
    const suffix = name ? `?name=${encodeURIComponent(name)}&tournament=${tournamentId}` : ''
    router.push(`/game/${roundGame.game_id}${suffix}`)
  }, [joined, isHost, tournament?.format, tournament?.status, games, players, tournamentId, router])

  // Head-to-head / school / Scrabble knockout: forward each joined player to their
  // own match/room for the current round (once it's staged or live). Bye / sit-out
  // players and eliminated players stay on the lobby.
  useEffect(() => {
    const duel =
      tournament?.format === 'head-to-head' ||
      tournament?.format === 'school' ||
      (tournament?.format === 'knockout' && resolveGroupSize(tournament.game_config, tournament.game_type) > 2)
    if (!joined || isHost || !duel || tournament?.status === 'finished') return
    const name = localStorage.getItem(`tournament_player_${tournamentId}`)
    const me = name ? players.find((p) => p.player_name.toLowerCase() === name.toLowerCase()) : null
    if (!me || me.is_eliminated) return
    const roundNums = games.map((g) => g.round_number ?? 0)
    const currentRound = roundNums.length ? Math.max(...roundNums) : 0
    if (!currentRound) return
    const myMatch = games.find(
      (g) => g.round_number === currentRound && !g.is_bye && g.game_id && matchHasPlayer(g, me.id)
    )
    if (!myMatch?.game_id || (myMatch.status !== 'pending' && myMatch.status !== 'active')) return
    if (forwardedGameRef.current === myMatch.game_id) return
    forwardedGameRef.current = myMatch.game_id
    const suffix = name ? `?name=${encodeURIComponent(name)}&tournament=${tournamentId}` : ''
    router.push(`/game/${myMatch.game_id}${suffix}`)
  }, [joined, isHost, tournament?.format, tournament?.status, games, players, tournamentId, router])

  async function handleJoin() {
    if (!playerName.trim()) return
    setJoinError('')

    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: playerName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setJoinError(data.error ?? 'Failed to join')
        return
      }
      localStorage.setItem(`tournament_player_${tournamentId}`, playerName.trim())
      // Private player code — used to reclaim this seat and to continue on another
      // device, so nobody can take the seat by just knowing the name.
      if (data.token) {
        localStorage.setItem(`tournament_ptoken_${tournamentId}`, String(data.token))
        setMyCode(String(data.token))
      }
      setJoined(true)
      fetchState()
    } catch {
      setJoinError('Something went wrong')
    }
  }

  // Leave the tournament from the lobby (before it starts) — gives up this seat so
  // the name frees up and the slot reopens. Authenticated by the player's private
  // code, so this only ever removes the player who's actually on this device.
  async function handleLeave() {
    const ok = await confirm({
      title: 'Leave this tournament?',
      message: "You'll give up your spot and be taken off the player list. You can rejoin later if there's still room.",
      confirmLabel: 'Leave',
      destructive: true,
    })
    if (!ok) return

    const token = localStorage.getItem(`tournament_ptoken_${tournamentId}`) ?? myCode
    if (!token) {
      toastError('Could not verify your spot — try refreshing')
      return
    }

    setActionLoading(true)
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Failed to leave')
        return
      }
      localStorage.removeItem(`tournament_player_${tournamentId}`)
      localStorage.removeItem(`tournament_ptoken_${tournamentId}`)
      setJoined(false)
      setMyCode('')
      setPlayerName('')
      fetchState()
      success('You left the tournament')
    } catch {
      toastError('Something went wrong')
    } finally {
      setActionLoading(false)
    }
  }

  // Restore this player on this device from their code (entered on the join screen).
  function handleResumedByCode(name: string, code: string) {
    localStorage.setItem(`tournament_player_${tournamentId}`, name)
    localStorage.setItem(`tournament_ptoken_${tournamentId}`, code)
    setPlayerName(name)
    setMyCode(code)
    setJoined(true)
    setJoinError('')
    fetchState()
  }

  async function handleShare() {
    const url = typeof window !== 'undefined' ? `${window.location.origin}/tournament/${tournamentId}` : ''
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (e.g. non-secure context) — let the host copy manually.
      window.prompt('Copy this invite link:', url)
    }
  }

  function openEditSettings() {
    if (!tournament) return
    setEditTitle(tournament.title)
    setEditTarget(tournament.target_game_count?.toString() ?? '')
    setEditMax(tournament.max_players?.toString() ?? '')
    setEditLives(Boolean(tournament.elimination_config))
    setEditStartingLives(tournament.elimination_config?.startingLives ?? 3)
    setEditEliminate(tournament.elimination_config?.eliminateCount ?? 1)
    setEditGameConfig(gameConfigValueFromStored(tournament.format, tournament.game_type, tournament.game_config))
    setEditError('')
    setShowEdit(true)
  }

  async function handleSaveSettings() {
    if (!hostToken || !tournament) return
    if (!editTitle.trim()) {
      setEditError('Enter a tournament title')
      return
    }
    // Blank clears the setting; a non-blank value must be a valid integer in range
    // (otherwise surface an error rather than silently clearing it).
    const target = Number(editTarget)
    if (editTarget.trim() && !(Number.isInteger(target) && target >= 1 && target <= 100)) {
      setEditError('Target games must be a whole number between 1 and 100')
      return
    }
    const cap = Number(editMax)
    if (editMax.trim() && !(Number.isInteger(cap) && cap >= 2 && cap <= 100)) {
      setEditError('Max players must be a whole number between 2 and 100')
      return
    }

    setSavingEdit(true)
    setEditError('')

    const body: Record<string, unknown> = {
      hostToken,
      title: editTitle.trim(),
      targetGameCount: editTarget.trim() ? target : null,
      maxPlayers: editMax.trim() ? cap : null,
    }
    // Lives and game settings can only be edited before the first game starts.
    if (tournament.status === 'waiting') {
      body.eliminationConfig = editLives
        ? {
            mode: 'lives',
            startingLives: editStartingLives,
            livesLostRule: 'bottom-n',
            eliminateCount: editEliminate,
          }
        : null
      if (tournament.game_type && formatHasGameConfig(tournament.format)) {
        const gc = gameConfigRequestBody(tournament.format, tournament.game_type, editGameConfig)
        if (gc) body.gameConfig = gc
      }
    }

    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setEditError(data.error ?? 'Failed to save settings')
        return
      }
      setShowEdit(false)
      fetchState()
    } catch {
      setEditError('Something went wrong')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleFile(file: File) {
    setUploadMsg(null)
    // Clear any previously-loaded pack up front so a failed/invalid replacement
    // can't leave stale questions that then get used on Start.
    setCustomTrivia([])
    const ext = file.name.split('.').pop()?.toLowerCase()
    try {
      if (ext === 'csv' || ext === 'txt') {
        const text = await file.text()
        const result = parseTriviaQuestionImport(text)
        if (result.questions.length === 0) {
          setUploadMsg('No valid rows. Use question, option_a–option_d, and correct (A–D) columns.')
          return
        }
        setCustomTrivia(result.questions)
        setUploadMsg(formatTriviaImportSummary(result) ?? `${result.questions.length} questions ready`)
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer()
        const result = await parseExcelTriviaQuestionImport(buffer)
        if (result.questions.length === 0) {
          setUploadMsg('No valid rows. Use question, option_a–option_d, and correct (A–D) columns.')
          return
        }
        setCustomTrivia(result.questions)
        setUploadMsg(formatTriviaImportSummary(result) ?? `${result.questions.length} questions ready`)
      } else {
        setUploadMsg('Please upload a .csv or .xlsx file')
      }
    } catch {
      setUploadMsg('Could not read that file. Try the sample CSV.')
    }
  }

  function clearCustom() {
    setCustomTrivia([])
    setUploadMsg(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleStartGame() {
    if (!hostToken) return
    setActionLoading(true)
    setError('')

    const useCustom = selectedGameType === 'trivia' && questionSource === 'custom'

    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostToken,
          gameType: selectedGameType,
          gameSettings: {
            rounds_count: parseInt(roundsCount, 10) || 10,
            timer_seconds: parseInt(timerSeconds, 10) || 30,
          },
          questionSource: useCustom ? 'custom' : 'platform',
          customQuestions: useCustom ? customTrivia : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to start game')
        return
      }
      localStorage.setItem(`host_token_${data.gameCode}`, data.gameHostToken)
      // Stay on the lobby — players auto-join the spawned game, then the host taps
      // "Start Game" here to begin it (no host dashboard needed).
      fetchState()
    } catch {
      setError('Something went wrong')
    } finally {
      setActionLoading(false)
    }
  }

  // Start the spawned round-robin game from the lobby (server-side), so the host
  // doesn't have to open the game's host dashboard.
  async function handleStartActiveGame() {
    if (!activeGame?.game_id) return
    const token = localStorage.getItem(`host_token_${activeGame.game_id}`)
    if (!token) {
      setError('Lost this game’s host token on this device — use “Open host dashboard” to start it.')
      return
    }
    setActionLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/games/${activeGame.game_id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken: token }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'Failed to start the game')
      else fetchState()
    } catch {
      setError('Something went wrong')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRemovePlayer(playerId: string) {
    if (!hostToken) return
    const name = players.find((p) => p.id === playerId)?.player_name ?? 'this player'
    const ok = await confirm({
      title: `Remove ${name}?`,
      message: 'They’re out of the tournament. Their opponent advances (or the match is voided if both are removed).',
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (!ok) return
    setActionLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/remove-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, playerId }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'Failed to remove player')
      else fetchState()
    } catch {
      setError('Something went wrong')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleEndTournament() {
    if (!hostToken) return
    const ok = await confirm({
      title: 'End the tournament?',
      message: 'This ends it for everyone and can’t be undone.',
      confirmLabel: 'End tournament',
      destructive: true,
    })
    if (!ok) return
    setActionLoading(true)

    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to end tournament')
      }
      fetchState()
    } catch {
      setError('Something went wrong')
    } finally {
      setActionLoading(false)
    }
  }

  // Head-to-head: stage the next bracket round (pairs survivors, creates match rooms).
  // Knockout trivia also passes this round's question pack (built-in or a freshly
  // uploaded / carried-over custom CSV) so the host can vary difficulty per round.
  async function handleStartRound() {
    if (!hostToken) return
    setActionLoading(true)
    setError('')
    // For knockout, an empty local pack means "reuse the previous round's" — the
    // server carries it forward, so send null rather than blocking the request.
    const isKnockout = tournament?.format === 'knockout'
    const knockoutQuestionBody = isKnockout
      ? questionSource === 'custom'
        ? { questionSource: 'custom' as const, customQuestions: customTrivia.length > 0 ? customTrivia : null }
        : { questionSource: 'platform' as const }
      : {}
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, timerSeconds: parseInt(h2hTimer, 10) || 0, ...knockoutQuestionBody }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'Failed to start round')
      else {
        // Clear the freshly-uploaded pack so the next round shows the carried-over
        // pack and invites a new upload (to ramp difficulty) rather than silently
        // reusing the loaded file.
        if (isKnockout) clearCustom()
        fetchState()
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setActionLoading(false)
    }
  }

  // Head-to-head: start every staged match in the current round together.
  async function handleStartMatches() {
    if (!hostToken) return
    setActionLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/rounds/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'Failed to start matches')
      else {
        if (data.waiting > 0 || data.resolved > 0) {
          const parts = [`${data.started} started`]
          if (data.resolved > 0) parts.push(`${data.resolved} cleared (too few players)`)
          if (data.waiting > 0) parts.push(`${data.waiting} still waiting for everyone to join`)
          setError(
            parts.join(', ') + (data.waiting > 0 ? " — try again once they're all in, or remove a no-show." : '.')
          )
        }
        fetchState()
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setActionLoading(false)
    }
  }

  function handleJoinGame(gameCode: string) {
    const name = localStorage.getItem(`tournament_player_${tournamentId}`)
    if (name) {
      router.push(`/game/${gameCode}?name=${encodeURIComponent(name)}&tournament=${tournamentId}`)
    } else {
      router.push(`/game/${gameCode}`)
    }
  }

  function handleWatchGame(gameCode: string) {
    // Spectator entry — auto-joins as a viewer (watch-only) on the game page.
    router.push(`/game/${gameCode}?tournament=${tournamentId}&watch=1`)
  }

  function startSpectating() {
    localStorage.setItem(`tournament_spectator_${tournamentId}`, '1')
    setSpectating(true)
  }

  function stopSpectating() {
    localStorage.removeItem(`tournament_spectator_${tournamentId}`)
    setSpectating(false)
  }

  function openHostDashboard(gameCode: string) {
    const token = localStorage.getItem(`host_token_${gameCode}`) ?? ''
    // Pass the tournament so the host's game-over screen can offer "Back to Tournament".
    // Open in a new tab so the host keeps this lobby tab open across games.
    window.open(`/host/${gameCode}?token=${token}&tournament=${tournamentId}`, '_blank', 'noopener,noreferrer')
  }

  if (loading) {
    return (
      <main className="page-wrap min-h-dvh flex items-center justify-center">
        <p className="text-muted text-sm">Loading tournament…</p>
      </main>
    )
  }

  if (error && !tournament) {
    return (
      <main className="page-wrap min-h-dvh flex items-center justify-center">
        <p className="text-red-400 text-sm">{error}</p>
      </main>
    )
  }

  if (!tournament) return null

  const activeGame = games.find((g) => g.status === 'active')
  const finishedGames = games.filter((g) => g.status === 'finished')
  const isFinished = tournament.status === 'finished'
  const hasStarted = tournament.status !== 'waiting'
  const points = tournament.placement_points ?? [10, 7, 5, 3, 2, 1]
  const lives = tournament.elimination_config
  const isParticipant = joined && !isHost
  const isFull = tournament.max_players != null && players.length >= tournament.max_players
  const myName = typeof window !== 'undefined' ? localStorage.getItem(`tournament_player_${tournamentId}`) : null
  const me =
    isParticipant && myName ? (players.find((p) => p.player_name.toLowerCase() === myName.toLowerCase()) ?? null) : null
  const iAmEliminated = Boolean(me?.is_eliminated)
  // Show a personal lives readout whenever the tournament runs in lives mode and the
  // player still has a tracked life count (null means lives mode is off for them).
  const myLives = lives && me?.lives_remaining != null ? me.lives_remaining : null

  // Host-control derived state
  const rounds = parseInt(roundsCount, 10) || 10
  const isFirstGame = games.length === 0
  const isCustom = selectedGameType === 'trivia' && questionSource === 'custom'
  // Effective pack size for custom trivia: a freshly uploaded pack wins; otherwise the
  // pack carried over from an earlier game (which the server reuses on Start). After a
  // reload/new tab the local upload resets to empty, so without the carry-over fallback
  // the host would be blocked from starting the next game with their existing pack.
  const effectiveCustomCount = customTrivia.length > 0 ? customTrivia.length : (carriedCustomCount ?? 0)
  const canStartCustom = !isCustom || effectiveCustomCount >= rounds

  // Format derived state. Head-to-head (1v1 bracket), knockout (group
  // elimination), and school (class ladder) all run rounds; round-robin does not.
  const h2h = tournament.format === 'head-to-head'
  const knockout = tournament.format === 'knockout'
  const school = tournament.format === 'school'
  // Formats that run per-round match/room rows on the head-to-head board.
  const duel = h2h || school
  const bracket = h2h || knockout || school
  const roundRobin = !bracket
  // School: the class ladder length; a win climbs a class, graduating past the top wins.
  const schoolClassCount = clampSchoolClassCount(
    (tournament.game_config as { schoolClassCount?: number } | null)?.schoolClassCount
  )
  const classLabelOf = (id: string | null) => {
    const p = id ? players.find((pl) => pl.id === id) : null
    return p ? schoolClassLabel(p.school_level ?? 0, schoolClassCount) : ''
  }
  const isEliminatedById = (id: string | null) =>
    id ? players.find((pl) => pl.id === id)?.is_eliminated === true : false
  // Bracket room size: chess is a 1v1 duel (2); Whot rooms hold up to 5, Scrabble up to 4.
  const groupSize = resolveGroupSize(tournament.game_config, tournament.game_type)
  const isGroupH2h = h2h && groupSize > 2
  // Scrabble knockout plays in rooms too (up to `groupSize`), but is ranked as one
  // field and cut by score — so it uses the same room board/controls as the group
  // bracket, while trivia knockout stays a single all-in-one game per round.
  const knockoutGroup = knockout && groupSize > 2
  const knockoutTrivia = knockout && !knockoutGroup
  // Formats whose host controls / board are the group-room bracket (rooms of N).
  const groupBracket = isGroupH2h || knockoutGroup
  // Formats that render per-round room/match rows on the head-to-head board.
  const boardRounds = duel || knockoutGroup
  // Multi-player rooms vs a 1-v-1 duel — school always plays in rooms.
  const groupRooms = isGroupH2h || school || knockoutGroup
  const labelForRound = (entrants: number) => (isGroupH2h ? groupRoundLabel(entrants, groupSize) : roundLabel(entrants))
  const playerNameById = (id: string | null) => (id ? (players.find((p) => p.id === id)?.player_name ?? '—') : '—')
  const h2hMatches = boardRounds ? games.filter((g) => g.round_number != null) : []
  const currentRoundNumber = h2hMatches.length ? Math.max(...h2hMatches.map((g) => g.round_number ?? 0)) : 0
  const currentRoundMatches = h2hMatches.filter((g) => g.round_number === currentRoundNumber)
  const currentRoundEntrants = currentRoundMatches.reduce((n, m) => n + (m.is_bye ? 1 : matchMemberIds(m).length), 0)
  const stagedMatches = currentRoundMatches.filter((g) => !g.is_bye && g.status === 'pending')
  const roundInProgress = currentRoundMatches.some(
    (g) => !g.is_bye && (g.status === 'pending' || g.status === 'active')
  )
  const survivingCount = players.filter((p) => !p.is_eliminated).length
  // In a finished bracket/knockout the lone survivor is the champion. Only crown
  // one when exactly one player is left — a host can End Tournament early with
  // several still standing, and that has no winner.
  const h2hChampion =
    (h2h || knockout) && isFinished && survivingCount === 1 ? (players.find((p) => !p.is_eliminated) ?? null) : null
  // School champion: whoever reached the ladder's end, or the last player left
  // standing once everyone else was left behind and eliminated. Several players can
  // graduate from the same final room at once; prefer the one who topped a room
  // (its Whot winner), else any graduate, else the sole survivor.
  const schoolGraduates =
    school && isFinished ? players.filter((p) => hasGraduated(p.school_level ?? 0, schoolClassCount)) : []
  const schoolChampion =
    schoolGraduates.find((p) => games.some((g) => g.winner_player_id === p.id)) ??
    schoolGraduates[0] ??
    (school && isFinished && survivingCount === 1 ? (players.find((p) => !p.is_eliminated) ?? null) : null)

  // Trivia knockout derived state — one all-in-one game per round. (Scrabble
  // knockout runs on the group-room board above, so it's excluded here.)
  const knockoutGames = knockoutTrivia ? games.filter((g) => g.round_number != null) : []
  const knockoutRoundNumber = knockoutGames.length ? Math.max(...knockoutGames.map((g) => g.round_number ?? 0)) : 0
  const knockoutRoundGame = knockoutGames.find((g) => g.round_number === knockoutRoundNumber) ?? null
  const knockoutRoundStaged = knockoutRoundGame?.status === 'pending'
  const knockoutRoundInProgress = knockoutRoundGame?.status === 'pending' || knockoutRoundGame?.status === 'active'
  // Per-round question pack for knockout trivia. The host can upload a fresh CSV
  // before each round (to ramp difficulty) or reuse the previous round's pack. Uses
  // the same upload state as the round-robin "Start Next Game" panel — the two panels
  // never render together, so sharing is safe.
  const knockoutQuestionsPerRound = tournament.game_config?.roundsCount ?? 5
  const knockoutCustom = knockoutTrivia && questionSource === 'custom'
  const knockoutEffectiveCount = customTrivia.length > 0 ? customTrivia.length : (carriedCustomCount ?? 0)
  const canStartKnockoutRound = !knockoutCustom || knockoutEffectiveCount >= knockoutQuestionsPerRound
  // Finished knockout rounds, for the results list. Entrants come from the round's
  // stored placements; the top half advanced.
  const knockoutResultRounds = knockoutTrivia
    ? knockoutGames
        .filter((g) => g.status === 'finished')
        .map((g) => {
          const entrants = g.placements ? Object.keys(g.placements).length : 0
          return { round: g.round_number as number, entrants, advanced: Math.ceil(entrants / 2) }
        })
        .sort((a, b) => a.round - b.round)
    : []
  // The current player's live/staged match this round (for a "return to match" CTA).
  const myCurrentMatch =
    boardRounds && me && !me.is_eliminated
      ? (currentRoundMatches.find(
          (g) => !g.is_bye && g.game_id && matchHasPlayer(g, me.id) && (g.status === 'pending' || g.status === 'active')
        ) ?? null)
      : null

  // Decided matches grouped by round, for the on-page results view (final result
  // plus every round). Includes byes; ordered round 1 → final.
  const resultRounds = boardRounds
    ? Object.values(
        games
          .filter((g) => g.round_number != null && (g.status === 'finished' || g.is_bye))
          .reduce<Record<number, TournamentGame[]>>((acc, g) => {
            const r = g.round_number as number
            ;(acc[r] ??= []).push(g)
            return acc
          }, {})
      )
        .map((matches) => ({
          round: matches[0].round_number as number,
          entrants: matches.reduce((n, m) => n + (m.is_bye ? 1 : matchMemberIds(m).length), 0),
          matches: [...matches].sort((a, b) => (a.match_index ?? 0) - (b.match_index ?? 0)),
        }))
        .sort((a, b) => a.round - b.round)
    : []

  return (
    <PageShell>
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-black gradient-title leading-tight">{tournament.title}</h1>
        <p className="text-faint text-sm">
          Code:{' '}
          <span className="font-mono font-bold tracking-wider" style={{ color: 'var(--primary)' }}>
            {tournament.id}
          </span>
          {tournament.target_game_count && (
            <span>
              {' '}
              &middot; {finishedGames.length}/{tournament.target_game_count} games
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <span className="chip text-xs">
            {h2h
              ? `${isGroupH2h ? '🎮' : '♟'} ${gameTypeLabel(tournament.game_type) ?? 'Chess'}`
              : knockout
                ? `${knockoutGroup ? '🎮' : '🧠'} ${gameTypeLabel(tournament.game_type) ?? 'Trivia'}`
                : school
                  ? `🃏 ${gameTypeLabel(tournament.game_type) ?? 'Whot'}`
                  : '🎮 Trivia'}
          </span>
          <span className="chip text-xs">
            {h2h
              ? '🏆 Head-to-Head'
              : knockout
                ? '🏆 Knockout'
                : school
                  ? '🎓 School'
                  : tournament.target_game_count
                    ? `Best of ${tournament.target_game_count}`
                    : 'Unlimited games'}
          </span>
          {lives && (
            <span className="chip text-xs">
              ❤️ {lives.startingLives} {lives.startingLives === 1 ? 'life' : 'lives'}
            </span>
          )}
          <span className="chip text-xs">
            👥 {players.length}
            {tournament.max_players ? `/${tournament.max_players}` : ''} player{players.length === 1 ? '' : 's'}
          </span>
          {isParticipant && myName && (
            <span className="chip text-xs" style={{ color: 'var(--primary)' }}>
              🙋 You: {myName}
            </span>
          )}
        </div>
        {isFinished ? (
          <span className="premium-badge" style={{ marginTop: '0.25rem' }}>
            🏆 Tournament Complete
          </span>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button onClick={handleShare} className="btn-secondary btn-fit text-sm">
              {copied ? '✓ Link copied' : '🔗 Copy invite link'}
            </button>
            {isHost && (
              <>
                <button
                  onClick={async () => {
                    const ok = await copyToClipboard(tournamentHostUrl(tournamentId, hostToken ?? '', shareOrigin()))
                    setCopied(false)
                    if (ok) success('Host link copied — open it to manage from another device')
                    else setError('Could not copy host link')
                  }}
                  className="btn-secondary btn-fit text-sm"
                  title="Manage this tournament from another device"
                >
                  🛠 Copy host link
                </button>
                <button onClick={() => setHostQrOpen(true)} className="btn-secondary btn-fit text-sm">
                  Host QR
                </button>
                <button onClick={openEditSettings} className="btn-secondary btn-fit text-sm">
                  ⚙️ Edit settings
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {isHost && (
        <GameLinkQrModal
          open={hostQrOpen}
          onClose={() => setHostQrOpen(false)}
          url={tournamentHostUrl(tournamentId, hostToken ?? '', shareOrigin())}
          title="Scan to host on another device"
          subtitle="Opening this link makes that device the host — keep it private."
          copyLabel="Copy host link"
          copySuccessMessage="Host link copied"
        />
      )}

      {/* Edit settings (host) */}
      {isHost && showEdit && !isFinished && (
        <div className="glass-card-strong p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="label-caps">Edit Settings</p>
            <button onClick={() => setShowEdit(false)} className="btn-ghost text-xs">
              Cancel
            </button>
          </div>

          <Field label="Tournament Title" htmlFor="edit-title">
            <input
              id="edit-title"
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={100}
              className="input-field"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Target Games" htmlFor="edit-target">
              <input
                id="edit-target"
                type="number"
                value={editTarget}
                onChange={(e) => setEditTarget(e.target.value)}
                placeholder="Unlimited"
                min={1}
                max={100}
                step={1}
                className="input-field"
              />
            </Field>
            <Field label="Max Players" htmlFor="edit-max">
              <input
                id="edit-max"
                type="number"
                value={editMax}
                onChange={(e) => setEditMax(e.target.value)}
                placeholder="Unlimited"
                min={2}
                max={100}
                step={1}
                className="input-field"
              />
            </Field>
          </div>

          {tournament.status === 'waiting' ? (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-body text-sm">
                <input
                  type="checkbox"
                  checked={editLives}
                  onChange={(e) => setEditLives(e.target.checked)}
                  className="accent-[var(--primary)]"
                />
                Lives mode
              </label>
              {editLives && (
                <div className="surface-inset p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-muted text-sm" htmlFor="edit-starting-lives">
                      Starting lives
                    </label>
                    <input
                      id="edit-starting-lives"
                      type="number"
                      min={1}
                      max={10}
                      value={editStartingLives}
                      onChange={(e) => setEditStartingLives(Number(e.target.value) || 3)}
                      className="input-field w-20 text-center"
                    />
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <label className="text-muted text-sm" htmlFor="edit-eliminate">
                      Players who lose a life each game
                      <span className="block text-faint text-xs mt-0.5">
                        {editEliminate === 1
                          ? 'The bottom finisher loses 1 life'
                          : `The bottom ${editEliminate} finishers each lose 1 life`}
                      </span>
                    </label>
                    <input
                      id="edit-eliminate"
                      type="number"
                      min={1}
                      max={10}
                      value={editEliminate}
                      onChange={(e) => setEditEliminate(Number(e.target.value) || 1)}
                      className="input-field w-20 text-center"
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-faint text-xs">Lives settings are locked once the first game starts.</p>
          )}

          {tournament.game_type && formatHasGameConfig(tournament.format) && (
            <div className="space-y-3">
              <div className="divider-soft" />
              <p className="label-caps">Game settings</p>
              {tournament.status === 'waiting' ? (
                <TournamentGameConfigFields
                  format={tournament.format}
                  gameType={tournament.game_type}
                  value={editGameConfig}
                  onChange={setEditGameConfig}
                />
              ) : (
                <p className="text-faint text-xs">
                  House rules, timings{tournament.format === 'school' ? ', and the class ladder' : ''} are locked once
                  the first game starts, so a live room is never changed mid-play.
                </p>
              )}
            </div>
          )}

          {editError && <p className="text-red-400 text-sm">{editError}</p>}

          <PrimaryBtn onClick={handleSaveSettings} disabled={savingEdit}>
            {savingEdit ? 'Saving…' : 'Save settings'}
          </PrimaryBtn>
        </div>
      )}

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      {/* Return the current player to their own match as a player (the bracket
          board's Watch buttons only spectate). Covers coming back to the lobby
          mid-match, where the one-shot auto-forward won't re-fire. */}
      {myCurrentMatch?.game_id && (
        <button onClick={() => handleJoinGame(myCurrentMatch.game_id!)} className="btn-primary w-full">
          ▶ Return to your match
        </button>
      )}

      {/* Head-to-head bracket board — the spectator view of the current round.
          Watch a match, then use its "Back to Tournament" button to switch. */}
      {boardRounds && currentRoundMatches.length > 0 && (
        <TournamentBracketBoard
          matches={currentRoundMatches}
          roundNumber={currentRoundNumber}
          roundLabel={school ? 'Whot rooms' : labelForRound(currentRoundEntrants)}
          nameOf={playerNameById}
          subOf={school ? classLabelOf : undefined}
          isEliminated={isEliminatedById}
          onWatch={handleWatchGame}
          onRemovePlayer={isHost ? handleRemovePlayer : undefined}
        />
      )}

      {/* Knockout live round — status + a watch button for anyone on the lobby
          (eliminated players, spectators). Players are auto-forwarded into it. */}
      {knockoutTrivia && knockoutRoundGame && knockoutRoundInProgress && (
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="label-caps">
              Round {knockoutRoundNumber} · {roundLabel(survivingCount)}
            </p>
            <span className="chip text-xs">{survivingCount} players</span>
          </div>
          <p className="text-muted text-sm">
            {knockoutRoundStaged
              ? 'Players are joining the room — the host starts the game shortly.'
              : 'Everyone is answering now. The bottom half will be knocked out.'}
          </p>
          {/* Who's in the room vs. still on their way — so the host knows who a
              staged round is waiting on before starting. */}
          {(() => {
            const survivors = players.filter((p) => !p.is_eliminated)
            const inRoom = new Set(knockoutRoundGame.joined_member_ids ?? [])
            const inCount = survivors.filter((p) => inRoom.has(p.id)).length
            return (
              <div className="space-y-1.5">
                <p className="text-[0.6875rem] uppercase tracking-wide text-faint">
                  In the room · {inCount}/{survivors.length}
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {survivors.map((p) => {
                    const isIn = inRoom.has(p.id)
                    return (
                      <div key={p.id} className="flex items-center gap-1.5 min-w-0">
                        <span
                          title={isIn ? 'In the room' : 'Not in the room yet'}
                          aria-label={isIn ? 'In the room' : 'Not in the room yet'}
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={
                            isIn
                              ? { background: 'var(--primary)' }
                              : { border: '1px solid var(--faint)', background: 'transparent' }
                          }
                        />
                        <span className={`truncate text-sm ${isIn ? 'text-body' : 'text-faint'}`}>
                          {p.player_name}
                          {me?.id === p.id && <span className="text-faint"> (you)</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
          {knockoutRoundGame.game_id &&
            (me && !me.is_eliminated ? (
              // A surviving player who came back to the lobby rejoins as a player
              // (the one-shot auto-forward won't re-fire), not as a watcher.
              <button onClick={() => handleJoinGame(knockoutRoundGame.game_id!)} className="btn-primary w-full">
                ▶ {knockoutRoundStaged ? 'Go to the game' : 'Return to the game'}
              </button>
            ) : knockoutRoundGame.status === 'active' ? (
              <button onClick={() => handleWatchGame(knockoutRoundGame.game_id!)} className="btn-secondary w-full">
                👁 Watch live
              </button>
            ) : null)}
        </div>
      )}

      {/* Host Controls — head-to-head bracket and Scrabble knockout (both play in
          rooms). Kept high (right under the board) so the host doesn't scroll past
          the rules/results to reach Start. */}
      {isHost && !isFinished && (tournament.format === 'head-to-head' || knockoutGroup) && (
        <div className="glass-card-strong p-5 space-y-4">
          <p className="label-caps">{knockoutGroup ? 'Knockout controls' : 'Bracket controls'}</p>

          {!roundInProgress && (
            <>
              {/* Time controls (chess clock, Whot/Scrabble length + rules) are all
                  chosen once at tournament creation, so there's no per-round picker
                  here — the host just starts the round. */}
              <div className="space-y-1.5">
                <PrimaryBtn onClick={handleStartRound} disabled={actionLoading || survivingCount < 2}>
                  {actionLoading
                    ? groupBracket
                      ? 'Grouping…'
                      : 'Pairing…'
                    : currentRoundNumber > 0
                      ? 'Start Next Round'
                      : 'Start Round'}
                </PrimaryBtn>
                <p className="text-faint text-xs text-center">
                  {survivingCount < 2
                    ? 'Waiting for players to join before you can start.'
                    : knockoutGroup
                      ? `Splits everyone into rooms of up to ${groupSize}; the whole field is ranked by score and the bottom half is knocked out.`
                      : isGroupH2h
                        ? `Splits everyone into rooms of up to ${groupSize} and sends them in.`
                        : 'Pairs everyone up and sends them to their match rooms.'}
                </p>
              </div>
            </>
          )}

          {stagedMatches.length > 0 && (
            <div className="space-y-1.5">
              <PrimaryBtn onClick={handleStartMatches} disabled={actionLoading}>
                {actionLoading
                  ? 'Starting…'
                  : groupBracket
                    ? `Start ${stagedMatches.length} Room${stagedMatches.length === 1 ? '' : 's'}`
                    : `Start ${stagedMatches.length} Match${stagedMatches.length === 1 ? '' : 'es'}`}
              </PrimaryBtn>
              <p className="text-faint text-xs text-center">
                {groupBracket
                  ? 'Starts every room at once. Players must be in their rooms first.'
                  : 'Starts every match at once. Players must be in their rooms first.'}
              </p>
            </div>
          )}

          <button onClick={handleEndTournament} disabled={actionLoading} className="btn-danger-soft">
            End Tournament
          </button>
        </div>
      )}

      {/* Host Controls — trivia knockout (group elimination). One game per round;
          Start Round sends everyone in, Start Game begins it (no host dashboard). */}
      {isHost && !isFinished && knockoutTrivia && (
        <div className="glass-card-strong p-5 space-y-4">
          <p className="label-caps">Knockout controls</p>

          {!knockoutRoundInProgress && (
            <div className="space-y-3">
              {/* Per-round questions: choose the built-in pack or upload a CSV for
                  this round. Uploading a fresh CSV each round lets the host ramp up
                  difficulty (round of 16 → quarter → semi → final). */}
              {knockoutTrivia && (
                <Field
                  label={`Questions for this round${knockoutRoundNumber > 0 ? ` · ${roundLabel(survivingCount)}` : ''}`}
                >
                  <div className="flex gap-2">
                    <button
                      type="button"
                      aria-pressed={questionSource === 'platform'}
                      onClick={() => setQuestionSource('platform')}
                      className={`chip flex-1 ${questionSource === 'platform' ? 'chip-active' : ''}`}
                    >
                      Built-in pack
                    </button>
                    <button
                      type="button"
                      aria-pressed={questionSource === 'custom'}
                      onClick={() => setQuestionSource('custom')}
                      className={`chip flex-1 ${questionSource === 'custom' ? 'chip-active' : ''}`}
                    >
                      Upload CSV
                    </button>
                  </div>

                  {questionSource === 'custom' && (
                    <div className="surface-inset p-4 mt-3 space-y-3">
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) handleFile(f)
                        }}
                        className="hidden"
                      />
                      {customTrivia.length === 0 ? (
                        <div className="space-y-2">
                          {carriedCustomCount != null && (
                            <div className="surface-inset p-3 space-y-1" style={{ borderColor: 'var(--primary)' }}>
                              <p className="text-sm text-body font-medium">
                                ✓ Reusing your pack ({carriedCustomCount} question
                                {carriedCustomCount === 1 ? '' : 's'}) from the last round
                              </p>
                              <p className="text-faint text-xs">
                                Already-seen questions are skipped automatically. Upload a new file below to make this
                                round harder.
                              </p>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="btn-secondary w-full"
                          >
                            {carriedCustomCount != null ? 'Upload a different file' : 'Choose CSV or Excel file'}
                          </button>
                          <p className="text-faint text-xs">
                            Columns: question, option_a–option_d, correct (A–D).{' '}
                            <a
                              href={questionSampleFile('trivia').href}
                              download={questionSampleFile('trivia').download}
                              className="underline hover:text-body"
                              style={{ color: 'var(--primary)' }}
                            >
                              Download sample
                            </a>
                          </p>
                          <p className="text-faint text-xs">
                            Need at least {knockoutQuestionsPerRound} question
                            {knockoutQuestionsPerRound === 1 ? '' : 's'} (one per question in the round).
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm text-body font-medium">
                            ✓ {customTrivia.length} question{customTrivia.length === 1 ? '' : 's'} loaded
                          </p>
                          <button type="button" onClick={clearCustom} className="btn-ghost text-xs">
                            Clear
                          </button>
                        </div>
                      )}
                      {uploadMsg && <p className="text-faint text-xs">{uploadMsg}</p>}
                    </div>
                  )}
                </Field>
              )}

              <div className="space-y-1.5">
                <PrimaryBtn
                  onClick={handleStartRound}
                  disabled={actionLoading || survivingCount < 2 || !canStartKnockoutRound}
                >
                  {actionLoading ? 'Setting up…' : knockoutRoundNumber > 0 ? 'Start Next Round' : 'Start Round'}
                </PrimaryBtn>
                <p className="text-faint text-xs text-center">
                  {survivingCount < 2
                    ? 'Waiting for players to join before you can start.'
                    : knockoutCustom && !canStartKnockoutRound
                      ? `Upload at least ${knockoutQuestionsPerRound} question${knockoutQuestionsPerRound === 1 ? '' : 's'} to start this round.`
                      : 'Sends everyone into one trivia game for this round.'}
                </p>
              </div>
            </div>
          )}

          {knockoutRoundStaged && (
            <div className="space-y-1.5">
              <PrimaryBtn onClick={handleStartMatches} disabled={actionLoading}>
                {actionLoading ? 'Starting…' : 'Start Game'}
              </PrimaryBtn>
              <p className="text-faint text-xs text-center">Starts the trivia game once players are in the room.</p>
            </div>
          )}

          <button onClick={handleEndTournament} disabled={actionLoading} className="btn-danger-soft">
            End Tournament
          </button>
        </div>
      )}

      {/* Host Controls — school (class ladder). Same round plumbing as the group
          bracket (group → start the Whot rooms), but the room winner climbs a class
          instead of the losers being knocked out. */}
      {isHost && !isFinished && school && (
        <div className="glass-card-strong p-5 space-y-4">
          <p className="label-caps">School controls</p>

          {!roundInProgress && (
            <div className="space-y-1.5">
              <PrimaryBtn onClick={handleStartRound} disabled={actionLoading || survivingCount < 2}>
                {actionLoading ? 'Grouping…' : currentRoundNumber > 0 ? 'Start Next Round' : 'Start Round'}
              </PrimaryBtn>
              <p className="text-faint text-xs text-center">
                {survivingCount < 2
                  ? 'Waiting for players to join before you can start.'
                  : 'Groups everyone by class into Whot rooms (up to 5) and sends them in. Empty your hand to climb a class; when time’s up the player left holding the most cards repeats. A player left with no one to play — no classmate and no other straggler to pair with — is out.'}
              </p>
            </div>
          )}

          {stagedMatches.length > 0 && (
            <div className="space-y-1.5">
              <PrimaryBtn onClick={handleStartMatches} disabled={actionLoading}>
                {actionLoading
                  ? 'Starting…'
                  : `Start ${stagedMatches.length} Room${stagedMatches.length === 1 ? '' : 's'}`}
              </PrimaryBtn>
              <p className="text-faint text-xs text-center">
                Starts every room at once. Players must be in their rooms first.
              </p>
            </div>
          )}

          <button onClick={handleEndTournament} disabled={actionLoading} className="btn-danger-soft">
            End Tournament
          </button>
        </div>
      )}

      {/* Join Form */}
      {/* Reconnect — once joining is closed (tournament started or full), a player who
          lost their session or is on a new device can still get back into their seat
          with the player code they saved. (Pre-start, the same entry lives, collapsed,
          inside the Join card.) */}
      {!joined && !isHost && !isFinished && (hasStarted || isFull) && !spectating && (
        <div className="glass-card p-5 space-y-2">
          <p className="label-caps">Already in this tournament?</p>
          <p className="text-muted text-xs">
            Reconnecting, or on another device? Enter the player code you saved when you joined to get back into your
            seat — this works even after the tournament has started.
          </p>
          {joinError && <p className="text-red-400 text-xs">{joinError}</p>}
          <TournamentResumeEntry tournamentId={tournamentId} onResumed={handleResumedByCode} alwaysOpen />
        </div>
      )}

      {!joined && !isHost && !isFinished && hasStarted && !spectating && (
        <div className="glass-card-strong p-5 text-center space-y-2">
          <p className="font-bold text-body">Tournament already started</p>
          <p className="text-muted text-sm">
            Joining is closed once the first game begins.
            {activeGame ? ' You can watch the live game below.' : ' Check back when the next game starts.'}
          </p>
          {activeGame && (
            <button
              onClick={() => handleWatchGame(activeGame.game_id!)}
              className="btn-secondary btn-fit mx-auto text-sm"
            >
              👁 Watch live
            </button>
          )}
        </div>
      )}

      {!joined && !isHost && !isFinished && !hasStarted && isFull && !spectating && (
        <div className="glass-card-strong p-5 text-center space-y-2">
          <p className="font-bold text-body">Tournament full</p>
          <p className="text-muted text-sm">
            This tournament has reached its {tournament.max_players}-player limit.{' '}
            {activeGame
              ? 'You can watch the live game below.'
              : 'Stay on this page — you can watch once a game starts.'}
          </p>
          {activeGame && (
            <button
              onClick={() => handleWatchGame(activeGame.game_id!)}
              className="btn-secondary btn-fit mx-auto text-sm"
            >
              👁 Watch live
            </button>
          )}
        </div>
      )}

      {!joined && !isHost && !isFinished && !hasStarted && !isFull && !spectating && (
        <div className="glass-card-strong p-5 space-y-3">
          <p className="label-caps">Join Tournament</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Your name"
              aria-label="Your name"
              maxLength={50}
              className="input-field flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <PrimaryBtn onClick={handleJoin} className="btn-fit">
              Join
            </PrimaryBtn>
          </div>
          {joinError && <p className="text-red-400 text-xs">{joinError}</p>}
          <TournamentResumeEntry tournamentId={tournamentId} onResumed={handleResumedByCode} />
          <button onClick={startSpectating} className="btn-secondary btn-fit text-xs mx-auto flex items-center gap-1.5">
            <span aria-hidden>👁</span>
            <span className="underline underline-offset-2">Watch instead</span>
            <span className="text-muted">— don&apos;t add me as a player</span>
          </button>
        </div>
      )}

      {/* Spectator waiting room — opted out of playing, will watch each game */}
      {spectating && !joined && !isHost && !isFinished && !activeGame && (
        <div className="glass-card-strong p-5 text-center space-y-2">
          <p className="font-bold text-body">👁 You&apos;re watching</p>
          <p className="text-muted text-sm">
            You won&apos;t play — stay on this page and the game will open here for you to watch once the host starts
            it.
          </p>
          <button onClick={stopSpectating} className="btn-secondary btn-fit text-xs mx-auto flex items-center gap-1.5">
            <span aria-hidden>🎮</span>
            <span className="underline underline-offset-2">Actually, let me play</span>
          </button>
        </div>
      )}

      {/* Player waiting room */}
      {isParticipant && !activeGame && !isFinished && iAmEliminated && (
        <div className="glass-card-strong p-5 text-center space-y-2">
          <p className="font-bold text-body">You&apos;re out, {playerName}</p>
          <p className="text-muted text-sm">
            {school
              ? 'You were knocked out of the class ladder: there was no one left in your class to play — everyone still in had climbed to a higher class, so you couldn’t be matched. Thanks for playing! You can watch the rest below.'
              : h2h
                ? 'Knocked out of the bracket — thanks for playing! You can still watch the remaining matches when they start.'
                : 'You’ve been eliminated, but you can stick around and watch the rest below.'}
          </p>
        </div>
      )}

      {isParticipant && !activeGame && !isFinished && !iAmEliminated && (
        <div className="glass-card-strong p-5 text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                style={{ background: 'var(--primary)' }}
              />
              <span
                className="relative inline-flex h-2.5 w-2.5 rounded-full"
                style={{ background: 'var(--primary)' }}
              />
            </span>
            <p className="font-bold text-body">You&apos;re in, {playerName}!</p>
          </div>
          <p className="text-muted text-sm">
            Waiting for the host to start the {bracket ? 'next round' : 'next game'}. Hang tight — it&apos;ll appear
            here.
          </p>
          {myLives != null && (
            <div className="surface-inset px-4 py-2.5 inline-flex items-center justify-center gap-2 mx-auto">
              <span aria-hidden="true" className="text-base">
                {myLives > 0 ? '❤️'.repeat(myLives) : '💔'}
              </span>
              <span className="text-sm font-semibold text-body">
                You have {myLives} {myLives === 1 ? 'life' : 'lives'} left
              </span>
            </div>
          )}
          {myCode && (
            <div className="pt-1">
              <TournamentContinueCard tournamentId={tournamentId} code={myCode} />
            </div>
          )}
          {/* Bow out before it kicks off — no leaving mid-tournament (it'd break the bracket). */}
          {!hasStarted && (
            <button
              onClick={handleLeave}
              disabled={actionLoading}
              className="btn-secondary btn-fit text-xs mx-auto flex items-center gap-1.5 disabled:opacity-50"
            >
              <span aria-hidden>🚪</span>
              <span className="underline underline-offset-2">Leave tournament</span>
            </button>
          )}
        </div>
      )}

      {/* Host how-to — collapsed by default so it doesn't crowd the controls. */}
      {isHost && !isFinished && (
        <details className="glass-card group p-5">
          <summary className="label-caps flex cursor-pointer select-none items-center justify-between [&::-webkit-details-marker]:hidden">
            How to run this tournament
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 text-faint transition-transform group-open:rotate-180"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </summary>
          <div className="mt-3 space-y-2.5">
            {h2h ? (
              <ul className="space-y-2 text-sm text-muted">
                <li className="flex gap-2.5">
                  <span aria-hidden>📣</span>
                  <span>
                    Share the invite link so players join. The roster{' '}
                    <span className="text-body font-semibold">locks</span> when you start the first round, so wait until
                    everyone&apos;s in.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>▶️</span>
                  <span>
                    Pick a time control and tap <span className="text-body font-semibold">Start Round</span> — everyone
                    is paired 1-v-1 and sent to their own match room.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>⏱️</span>
                  <span>
                    Once players are in their rooms, tap <span className="text-body font-semibold">Start Matches</span>{' '}
                    to begin every game at once. You host from here — you don&apos;t play.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>🔁</span>
                  <span>
                    When every match finishes, tap <span className="text-body font-semibold">Start Next Round</span> to
                    advance the winners. A drawn game replays automatically until it&apos;s decisive.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>🏆</span>
                  <span>The last player standing wins — or tap End Tournament anytime.</span>
                </li>
              </ul>
            ) : knockoutGroup ? (
              <ul className="space-y-2 text-sm text-muted">
                <li className="flex gap-2.5">
                  <span aria-hidden>📣</span>
                  <span>
                    Share the invite link so players join. The roster{' '}
                    <span className="text-body font-semibold">locks</span> when you start the first round.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>▶️</span>
                  <span>
                    Tap <span className="text-body font-semibold">Start Round</span> — everyone is split into rooms of
                    up to {groupSize} and sent in.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>🎮</span>
                  <span>
                    Once players are in their rooms, tap <span className="text-body font-semibold">Start Rooms</span> to
                    begin every game at once. You host from here — you don&apos;t play.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>🔁</span>
                  <span>
                    When every room finishes, the whole field is ranked by score and the bottom half is knocked out — it
                    doesn&apos;t matter which room they were in. Tap{' '}
                    <span className="text-body font-semibold">Start Next Round</span> for the survivors.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>🏆</span>
                  <span>Last player standing wins — or tap End Tournament anytime.</span>
                </li>
              </ul>
            ) : knockout ? (
              <ul className="space-y-2 text-sm text-muted">
                <li className="flex gap-2.5">
                  <span aria-hidden>📣</span>
                  <span>
                    Share the invite link so players join. The roster{' '}
                    <span className="text-body font-semibold">locks</span> when you start the first round.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>▶️</span>
                  <span>
                    Tap <span className="text-body font-semibold">Start Round</span> — everyone is sent into one trivia
                    game together.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>🧠</span>
                  <span>
                    Tap <span className="text-body font-semibold">Start Game</span> to begin. Questions auto-advance —
                    you host from here, you don&apos;t play.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>🔁</span>
                  <span>
                    When the round ends, the bottom half is knocked out. Tap{' '}
                    <span className="text-body font-semibold">Start Next Round</span> for the survivors.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>🏆</span>
                  <span>Last player standing wins — or tap End Tournament anytime.</span>
                </li>
              </ul>
            ) : school ? (
              <ul className="space-y-2 text-sm text-muted">
                <li className="flex gap-2.5">
                  <span aria-hidden>📣</span>
                  <span>
                    Share the invite link so players join. The roster{' '}
                    <span className="text-body font-semibold">locks</span> when you start the first round. Everyone
                    begins in the lowest class.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>▶️</span>
                  <span>
                    Tap <span className="text-body font-semibold">Start Round</span> — players are grouped by class into
                    Whot rooms (up to 5) and sent in.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>🃏</span>
                  <span>
                    Once players are in their rooms, tap <span className="text-body font-semibold">Start Rooms</span> to
                    begin every timed match at once. You host from here — you don&apos;t play.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>🔁</span>
                  <span>
                    Empty your hand and you climb a class; when time’s up the player left holding the most cards
                    repeats. Tap <span className="text-body font-semibold">Start Next Round</span> to group the next
                    set.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>🎓</span>
                  <span>The first player to graduate past the top class wins — or tap End Tournament anytime.</span>
                </li>
              </ul>
            ) : (
              <ul className="space-y-2 text-sm text-muted">
                <li className="flex gap-2.5">
                  <span aria-hidden>📣</span>
                  <span>
                    Share the invite link so players join. The roster{' '}
                    <span className="text-body font-semibold">locks</span> when you start the first game, so wait until
                    everyone&apos;s in.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>▶️</span>
                  <span>
                    Tap <span className="text-body font-semibold">Start Tournament</span> to create a game, then open
                    the host dashboard (new tab) and start it there.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>🎮</span>
                  <span>
                    Players are pulled into each game automatically. You host from the dashboard — you don&apos;t play.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>🔁</span>
                  <span>
                    When a game ends, return to this tab —{' '}
                    <span className="text-body font-semibold">Start Next Game</span> appears here. Repeat until
                    you&apos;re done.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span aria-hidden>🏁</span>
                  <span>
                    It ends after your target games{lives ? ', or when one player is left in lives mode' : ''} — or tap
                    End Tournament anytime.
                  </span>
                </li>
              </ul>
            )}
          </div>
        </details>
      )}

      {/* How it works */}
      {!isFinished && !isHost && (
        <div className="glass-card p-5 space-y-2.5">
          <p className="label-caps">How this tournament works</p>
          {h2h ? (
            <ul className="space-y-2 text-sm text-muted">
              <li className="flex gap-2.5">
                <span aria-hidden>⚔️</span>
                <span>Each round the host pairs everyone 1-v-1. You play your match on your own device.</span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden>♟️</span>
                <span>
                  <span className="text-body font-semibold">Win to advance, lose and you&apos;re out.</span> A draw
                  replays automatically until someone wins.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden>🚀</span>
                <span>
                  When the host starts the round, you&apos;re taken straight to your match room — an odd one out gets a{' '}
                  <span className="text-body font-semibold">bye</span> to the next round.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden>👑</span>
                <span>Keep winning your matches to become champion.</span>
              </li>
            </ul>
          ) : knockoutGroup ? (
            <ul className="space-y-2 text-sm text-muted">
              <li className="flex gap-2.5">
                <span aria-hidden>⚔️</span>
                <span>
                  You play Scrabble in a room of up to {groupSize} — but you&apos;re ranked against the whole field, not
                  just your room.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden>🎯</span>
                <span>
                  <span className="text-body font-semibold">Score as high as you can.</span> The bottom half of everyone
                  is knocked out each round — it doesn&apos;t matter which room you were in.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden>🚀</span>
                <span>When the host starts a round, you&apos;re taken straight to your room.</span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden>👑</span>
                <span>Survive every round to become champion.</span>
              </li>
            </ul>
          ) : knockout ? (
            <ul className="space-y-2 text-sm text-muted">
              <li className="flex gap-2.5">
                <span aria-hidden>⚔️</span>
                <span>Everyone plays one trivia game together each round — you&apos;re up against the whole room.</span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden>🧠</span>
                <span>
                  <span className="text-body font-semibold">Answer fast and correctly.</span> The bottom half is knocked
                  out each round.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden>🚀</span>
                <span>When the host starts a round, you&apos;re taken straight into the game.</span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden>👑</span>
                <span>Survive every round to become champion.</span>
              </li>
            </ul>
          ) : school ? (
            <ul className="space-y-2 text-sm text-muted">
              <li className="flex gap-2.5">
                <span aria-hidden>🎓</span>
                <span>
                  Everyone starts in the lowest class. Each round you&apos;re grouped with your classmates into one
                  timed Whot room (up to 5).
                </span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden>🃏</span>
                <span>
                  <span className="text-body font-semibold">Empty your hand and you climb to the next class.</span> The
                  rest keep playing; when time&apos;s up the one left holding the most cards repeats the class.
                  You&apos;re only out if you&apos;re ever left with no one to play.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden>🚀</span>
                <span>When the host starts a round you&apos;re taken straight to your Whot room.</span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden>👑</span>
                <span>Be the first to graduate past the top class to win.</span>
              </li>
            </ul>
          ) : (
            <ul className="space-y-2 text-sm text-muted">
              <li className="flex gap-2.5">
                <span aria-hidden>🎮</span>
                <span>The host runs a series of games. Everyone plays each one from their own device.</span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden>🏅</span>
                <span>
                  You earn points by how you place each game —{' '}
                  <span className="text-body font-semibold">
                    1st {points[0]}pts, 2nd {points[1] ?? points[points.length - 1]}pts
                  </span>
                  , and so on.
                </span>
              </li>
              {lives && (
                <li className="flex gap-2.5">
                  <span aria-hidden>❤️</span>
                  <span>
                    Lives mode: start with <span className="text-body font-semibold">{lives.startingLives}</span>. The
                    bottom <span className="text-body font-semibold">{lives.eliminateCount}</span> each game lose one —
                    run out and you&apos;re eliminated.
                  </span>
                </li>
              )}
              <li className="flex gap-2.5">
                <span aria-hidden>🚀</span>
                <span>
                  When the host starts a game, tap <span className="text-body font-semibold">Join Game</span> to jump
                  in.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden>👑</span>
                <span>
                  Most points{' '}
                  {tournament.target_game_count
                    ? `after ${tournament.target_game_count} games`
                    : 'when the host ends it'}{' '}
                  wins.
                </span>
              </li>
            </ul>
          )}
        </div>
      )}

      {/* Active Game Banner */}
      {activeGame && roundRobin && (
        <div
          className="glass-card-strong p-5 space-y-3"
          style={{ boxShadow: '0 0 0 1px var(--primary), var(--card-shadow-glow)' }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--primary)' }}>
              <span className="relative flex h-2 w-2">
                <span
                  className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                  style={{ background: 'var(--primary)' }}
                />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: 'var(--primary)' }} />
              </span>
              {activeGame.game_status === 'waiting' ? 'Players joining' : 'Game In Progress'}
            </p>
            <span className="text-xs text-faint">Game {activeGame.game_order}</span>
          </div>
          {isParticipant && !iAmEliminated && (
            <>
              {myLives != null && (
                <p className="text-center text-sm text-body">
                  <span aria-hidden="true">{myLives > 0 ? '❤️'.repeat(myLives) : '💔'}</span>{' '}
                  <span className="font-semibold">
                    {myLives} {myLives === 1 ? 'life' : 'lives'} left
                  </span>
                </p>
              )}
              <PrimaryBtn onClick={() => handleJoinGame(activeGame.game_id!)}>Join Game</PrimaryBtn>
            </>
          )}
          {/* Eliminated players and opted-in spectators watch instead of playing.
              This is also the re-entry path if a watcher navigated back to the
              lobby mid-game (the one-shot auto-forward won't fire again). */}
          {(iAmEliminated || (spectating && !joined && !isHost)) && (
            <button onClick={() => handleWatchGame(activeGame.game_id!)} className="btn-secondary w-full">
              👁 Watch live
            </button>
          )}
          {isHost && activeGame.game_status === 'waiting' && (
            <div className="space-y-1.5">
              <PrimaryBtn onClick={handleStartActiveGame} disabled={actionLoading}>
                {actionLoading ? 'Starting…' : 'Start Game'}
              </PrimaryBtn>
              <p className="text-faint text-xs text-center">Starts it here for everyone — no host dashboard needed.</p>
            </div>
          )}
          {isHost && (
            <button onClick={() => openHostDashboard(activeGame.game_id!)} className="btn-ghost w-full text-sm">
              Open host dashboard instead
            </button>
          )}
        </div>
      )}

      {/* Head-to-head champion */}
      {h2hChampion && (
        <div
          className="glass-card-strong p-6 text-center space-y-1.5"
          style={{ boxShadow: '0 0 0 1px var(--primary), var(--card-shadow-glow)' }}
        >
          <p className="text-4xl" aria-hidden="true">
            🏆
          </p>
          <p className="label-caps">Champion</p>
          <p className="text-2xl font-black gradient-title">{h2hChampion.player_name}</p>
        </div>
      )}

      {/* School champion — the first player to graduate. */}
      {schoolChampion && (
        <div
          className="glass-card-strong p-6 text-center space-y-1.5"
          style={{ boxShadow: '0 0 0 1px var(--primary), var(--card-shadow-glow)' }}
        >
          <p className="text-4xl" aria-hidden="true">
            🎓
          </p>
          <p className="label-caps">
            {hasGraduated(schoolChampion.school_level ?? 0, schoolClassCount) ? 'Graduated — Champion' : 'Champion'}
          </p>
          <p className="text-2xl font-black gradient-title">{schoolChampion.player_name}</p>
        </div>
      )}

      {/* Manage players — host can remove anyone (e.g. a no-show blocking a match).
          The entry point for knockout / round-robin; head-to-head also has the ✕
          on the board. */}
      {isHost && !isFinished && players.length > 0 && (
        <details className="glass-card group p-5">
          <summary className="label-caps flex cursor-pointer select-none items-center justify-between [&::-webkit-details-marker]:hidden">
            Manage players ({survivingCount})
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 text-faint transition-transform group-open:rotate-180"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </summary>
          <div className="mt-3 space-y-1.5">
            {players.map((p) => (
              <div key={p.id} className="result-row flex items-center justify-between gap-3 px-4 py-2.5">
                <span className={`text-sm ${p.is_eliminated ? 'text-faint line-through' : 'text-body'}`}>
                  {p.player_name}
                </span>
                {p.is_eliminated ? (
                  <span className="text-xs text-faint">out</span>
                ) : (
                  <button
                    onClick={() => handleRemovePlayer(p.id)}
                    disabled={actionLoading}
                    className="rounded px-2 py-0.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Standings + "Share results" image export — for every format, including School
          (class ladder), so every tournament game can share its result. */}
      <TournamentShareLeaderboard
        tournament={tournament}
        players={players}
        games={games}
        highlightPlayerId={me?.id ?? null}
      />

      {/* Knockout round results — how the field narrowed each round. */}
      {knockoutTrivia && knockoutResultRounds.length > 0 && (
        <div className="glass-card p-5 space-y-3">
          <p className="label-caps">Rounds</p>
          <div className="space-y-2">
            {knockoutResultRounds.map((r) => (
              <div key={r.round} className="result-row flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm font-medium text-body">
                  Round {r.round} · {roundLabel(r.entrants)}
                </span>
                <span className="text-xs text-faint">
                  {r.advanced} of {r.entrants} advanced
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game History — round-robin: games + player counts. */}
      {roundRobin && finishedGames.length > 0 && (
        <div className="glass-card p-5 space-y-3">
          <p className="label-caps">Game History</p>
          <div className="space-y-2">
            {finishedGames.map((g) => (
              <div key={g.id} className="result-row flex items-center justify-between px-4 py-2.5">
                <span className="text-sm font-medium text-body">Game {g.game_order}</span>
                <span className="text-xs text-faint">
                  {g.placements ? `${Object.keys(g.placements).length} players` : 'No results'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bracket results — head-to-head: every decided round, newest info on page.
          The champion banner above is the final result; this is the per-round
          history, with a View button to open each match's final board. */}
      {boardRounds && resultRounds.length > 0 && (
        <div className="glass-card p-5 space-y-4">
          <p className="label-caps">{school ? 'Match results' : knockoutGroup ? 'Round results' : 'Bracket results'}</p>
          {resultRounds.map((rd) => (
            <div key={rd.round} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {school ? `Round ${rd.round}` : `Round ${rd.round} · ${labelForRound(rd.entrants)}`}
              </p>
              {rd.matches.map((g) => {
                const loserId = g.winner_player_id === g.player_a_id ? g.player_b_id : g.player_a_id
                const roomLabel = matchMemberIds(g).map(playerNameById).join(', ')
                return (
                  <div key={g.id} className="result-row flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0 truncate text-sm font-medium text-body">
                      {g.is_bye
                        ? `${playerNameById(g.player_a_id)} — bye`
                        : g.winner_player_id
                          ? groupRooms
                            ? `✓ ${playerNameById(g.winner_player_id)} won the room`
                            : `✓ ${playerNameById(g.winner_player_id)} beat ${playerNameById(loserId)}${winReasonLabel(g.win_reason)}`
                          : groupRooms
                            ? roomLabel
                            : `${playerNameById(g.player_a_id)} vs ${playerNameById(g.player_b_id)}`}
                    </span>
                    {!g.is_bye && g.game_id && (
                      <button onClick={() => handleWatchGame(g.game_id!)} className="btn-ghost shrink-0 text-xs">
                        View
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* Host Controls — round-robin */}
      {isHost && !isFinished && !activeGame && roundRobin && (
        <div className="glass-card-strong p-5 space-y-4">
          <p className="label-caps">Start Next Game</p>

          <Field label="Game Type" htmlFor="tg-game-type">
            <select
              id="tg-game-type"
              value={selectedGameType}
              onChange={(e) => setSelectedGameType(e.target.value)}
              className="input-field"
            >
              {TOURNAMENT_ELIGIBLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {GAME_TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Rounds" htmlFor="tg-rounds">
              <input
                id="tg-rounds"
                type="number"
                value={roundsCount}
                onChange={(e) => setRoundsCount(e.target.value)}
                min={1}
                max={100}
                className="input-field"
              />
            </Field>
            <Field label="Timer (s)" htmlFor="tg-timer">
              <input
                id="tg-timer"
                type="number"
                value={timerSeconds}
                onChange={(e) => setTimerSeconds(e.target.value)}
                min={5}
                max={300}
                className="input-field"
              />
            </Field>
          </div>

          {/* Trivia question source */}
          {selectedGameType === 'trivia' && (
            <Field label="Questions">
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-pressed={questionSource === 'platform'}
                  onClick={() => setQuestionSource('platform')}
                  className={`chip flex-1 ${questionSource === 'platform' ? 'chip-active' : ''}`}
                >
                  Built-in pack
                </button>
                <button
                  type="button"
                  aria-pressed={questionSource === 'custom'}
                  onClick={() => setQuestionSource('custom')}
                  className={`chip flex-1 ${questionSource === 'custom' ? 'chip-active' : ''}`}
                >
                  Upload CSV
                </button>
              </div>

              {questionSource === 'custom' && (
                <div className="surface-inset p-4 mt-3 space-y-3">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleFile(f)
                    }}
                    className="hidden"
                  />
                  {customTrivia.length === 0 ? (
                    <div className="space-y-2">
                      {carriedCustomCount != null && (
                        <div className="surface-inset p-3 space-y-1" style={{ borderColor: 'var(--primary)' }}>
                          <p className="text-sm text-body font-medium">
                            ✓ Reusing your pack ({carriedCustomCount} question
                            {carriedCustomCount === 1 ? '' : 's'}) from an earlier game
                          </p>
                          <p className="text-faint text-xs">
                            Already-seen questions are skipped automatically. Upload a new file below to replace it.
                          </p>
                        </div>
                      )}
                      <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary w-full">
                        {carriedCustomCount != null ? 'Upload a different file' : 'Choose CSV or Excel file'}
                      </button>
                      <p className="text-faint text-xs">
                        Columns: question, option_a–option_d, correct (A–D).{' '}
                        <a
                          href={questionSampleFile('trivia').href}
                          download={questionSampleFile('trivia').download}
                          className="underline hover:text-body"
                          style={{ color: 'var(--primary)' }}
                        >
                          Download sample
                        </a>
                      </p>
                      {carriedCustomCount == null && (
                        <p className="text-faint text-xs">
                          Your pack stays loaded between games — already-seen questions are skipped automatically.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-body font-medium">
                        ✓ {customTrivia.length} question{customTrivia.length === 1 ? '' : 's'} loaded
                      </p>
                      <button type="button" onClick={clearCustom} className="btn-ghost text-xs">
                        Clear
                      </button>
                    </div>
                  )}
                  {uploadMsg && <p className="text-faint text-xs">{uploadMsg}</p>}
                </div>
              )}
            </Field>
          )}

          <div className="space-y-1.5">
            <PrimaryBtn onClick={handleStartGame} disabled={actionLoading || !canStartCustom || players.length === 0}>
              {actionLoading ? 'Starting…' : isFirstGame ? 'Start Tournament' : 'Start Next Game'}
            </PrimaryBtn>
            <p className="text-faint text-xs text-center">
              {players.length === 0
                ? 'Waiting for players to join before you can start.'
                : 'Creates the game room. Open the host dashboard (new tab) to start it once players have joined.'}
            </p>
          </div>

          {isCustom && effectiveCustomCount > 0 && effectiveCustomCount < rounds && (
            <p className="text-faint text-xs text-center -mt-2">
              Need {rounds} questions for {rounds} rounds — upload more or lower the round count.
            </p>
          )}

          <button onClick={handleEndTournament} disabled={actionLoading} className="btn-danger-soft">
            End Tournament
          </button>
        </div>
      )}
    </PageShell>
  )
}
