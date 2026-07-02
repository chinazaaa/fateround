'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTournamentRealtime } from '@/hooks/useTournamentRealtime'
import type { Tournament, TournamentPlayer, TournamentGame } from '@/types/tournament'
import type { TriviaQuestion } from '@/types'
import { TOURNAMENT_ELIGIBLE_TYPES } from '@/lib/tournament-validation'
import { roundLabel } from '@/lib/tournament-bracket'
import {
  parseTriviaQuestionImport,
  parseExcelTriviaQuestionImport,
  formatTriviaImportSummary,
  questionSampleFile,
} from '@/lib/custom-questions'
import { PageShell, Field, PrimaryBtn } from '@/components/ui/PageShell'
import { TournamentShareLeaderboard } from '@/components/tournament/TournamentShareLeaderboard'
import { TournamentBracketBoard } from '@/components/tournament/TournamentBracketBoard'

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

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [players, setPlayers] = useState<TournamentPlayer[]>([])
  const [games, setGames] = useState<TournamentGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [playerName, setPlayerName] = useState('')
  const [joined, setJoined] = useState(false)
  const [joinError, setJoinError] = useState('')
  // Visitor chose "just watching" — opts out of playing (no roster slot) and gets
  // auto-forwarded into each game as a viewer.
  const [spectating, setSpectating] = useState(false)
  const watchedGameRef = useRef<string | null>(null)

  const [selectedGameType, setSelectedGameType] = useState('trivia')
  const [roundsCount, setRoundsCount] = useState('10')
  const [timerSeconds, setTimerSeconds] = useState('30')
  // Head-to-head: shared per-player chess clock for a round's matches.
  const [h2hTimer, setH2hTimer] = useState('600')
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

  useEffect(() => {
    const savedName = localStorage.getItem(`tournament_player_${tournamentId}`)
    if (savedName) {
      setPlayerName(savedName)
      setJoined(true)
    }
    if (localStorage.getItem(`tournament_spectator_${tournamentId}`) === '1') {
      setSpectating(true)
    }
  }, [tournamentId])

  // Auto-forward opted-in spectators into each game as a viewer when it starts.
  // (Head-to-head runs many simultaneous matches — spectators pick one from the
  // bracket board rather than being pulled into a single game.)
  useEffect(() => {
    if (joined || isHost || !spectating || tournament?.status === 'finished') return
    if (tournament?.format === 'head-to-head') return
    const active = games.find((g) => g.status === 'active')
    if (!active || watchedGameRef.current === active.game_id) return
    watchedGameRef.current = active.game_id
    router.push(`/game/${active.game_id}?tournament=${tournamentId}&watch=1`)
  }, [joined, isHost, spectating, tournament?.status, games, tournamentId, router])

  // Auto-forward joined players into a game as soon as the host starts it, so
  // they don't have to find it themselves. The host stays on the lobby to manage.
  useEffect(() => {
    if (!joined || isHost || tournament?.status === 'finished') return
    if (tournament?.format === 'head-to-head') return
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

  // Head-to-head: forward each joined player to their own match room for the
  // current round (once it's staged or live). Bye players and eliminated players
  // stay on the lobby.
  useEffect(() => {
    if (!joined || isHost || tournament?.format !== 'head-to-head' || tournament?.status === 'finished') return
    const name = localStorage.getItem(`tournament_player_${tournamentId}`)
    const me = name ? players.find((p) => p.player_name.toLowerCase() === name.toLowerCase()) : null
    if (!me || me.is_eliminated) return
    const roundNums = games.map((g) => g.round_number ?? 0)
    const currentRound = roundNums.length ? Math.max(...roundNums) : 0
    if (!currentRound) return
    const myMatch = games.find(
      (g) =>
        g.round_number === currentRound &&
        !g.is_bye &&
        g.game_id &&
        (g.player_a_id === me.id || g.player_b_id === me.id)
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
      setJoined(true)
      fetchState()
    } catch {
      setJoinError('Something went wrong')
    }
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
    // Lives can only be edited before the first game starts.
    if (tournament.status === 'waiting') {
      body.eliminationConfig = editLives
        ? {
            mode: 'lives',
            startingLives: editStartingLives,
            livesLostRule: 'bottom-n',
            eliminateCount: editEliminate,
          }
        : null
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
      // Stay on the lobby (it now shows the active-game banner); the host opens the
      // dashboard from there in a new tab to actually start the game.
      fetchState()
    } catch {
      setError('Something went wrong')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleEndTournament() {
    if (!hostToken) return
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
  async function handleStartRound() {
    if (!hostToken) return
    setActionLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, timerSeconds: parseInt(h2hTimer, 10) || 0 }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'Failed to start round')
      else fetchState()
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
        if (data.waiting > 0) {
          setError(`${data.started} started, ${data.waiting} still waiting for both players — try again once they join.`)
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

  // Head-to-head derived state
  const h2h = tournament.format === 'head-to-head'
  const playerNameById = (id: string | null) => (id ? (players.find((p) => p.id === id)?.player_name ?? '—') : '—')
  const h2hMatches = h2h ? games.filter((g) => g.round_number != null) : []
  const currentRoundNumber = h2hMatches.length ? Math.max(...h2hMatches.map((g) => g.round_number ?? 0)) : 0
  const currentRoundMatches = h2hMatches.filter((g) => g.round_number === currentRoundNumber)
  const currentRoundEntrants = currentRoundMatches.reduce((n, m) => n + (m.is_bye ? 1 : 2), 0)
  const stagedMatches = currentRoundMatches.filter((g) => !g.is_bye && g.status === 'pending')
  const roundInProgress = currentRoundMatches.some(
    (g) => !g.is_bye && (g.status === 'pending' || g.status === 'active')
  )
  const survivingCount = players.filter((p) => !p.is_eliminated).length
  // In a finished head-to-head bracket the lone survivor is the champion.
  const h2hChampion = h2h && isFinished ? (players.find((p) => !p.is_eliminated) ?? null) : null

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
          <span className="chip text-xs">{h2h ? '♟ Chess' : '🎮 Trivia'}</span>
          <span className="chip text-xs">
            {h2h
              ? '🏆 Head-to-Head'
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
              <button onClick={openEditSettings} className="btn-secondary btn-fit text-sm">
                ⚙️ Edit settings
              </button>
            )}
          </div>
        )}
      </div>

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

          {editError && <p className="text-red-400 text-sm">{editError}</p>}

          <PrimaryBtn onClick={handleSaveSettings} disabled={savingEdit}>
            {savingEdit ? 'Saving…' : 'Save settings'}
          </PrimaryBtn>
        </div>
      )}

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      {/* Head-to-head bracket board — the spectator view of the current round.
          Watch a match, then use its "Back to Tournament" button to switch. */}
      {h2h && currentRoundMatches.length > 0 && (
        <TournamentBracketBoard
          matches={currentRoundMatches}
          roundNumber={currentRoundNumber}
          roundLabel={roundLabel(currentRoundEntrants)}
          nameOf={playerNameById}
          onWatch={handleWatchGame}
        />
      )}

      {/* Join Form */}
      {!joined && !isHost && !isFinished && hasStarted && !spectating && (
        <div className="glass-card-strong p-5 text-center space-y-2">
          <p className="font-bold text-body">Tournament already started</p>
          <p className="text-muted text-sm">
            Joining is closed once the first game begins.
            {activeGame ? ' You can watch the live game below.' : ' Check back when the next game starts.'}
          </p>
          {activeGame && (
            <button
              onClick={() => handleWatchGame(activeGame.game_id)}
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
              onClick={() => handleWatchGame(activeGame.game_id)}
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
          <button onClick={startSpectating} className="btn-ghost text-xs mx-auto block">
            👁 Just here to watch — don&apos;t add me as a player
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
          <button onClick={stopSpectating} className="btn-ghost text-xs">
            Actually, let me play
          </button>
        </div>
      )}

      {/* Player waiting room */}
      {isParticipant && !activeGame && !isFinished && (
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
            Waiting for the host to start the next game. Hang tight — it&apos;ll appear here.
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
        </div>
      )}

      {/* Host how-to */}
      {isHost && !isFinished && (
        <div className="glass-card p-5 space-y-2.5">
          <p className="label-caps">How to run this tournament</p>
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
                  Pick a time control and tap <span className="text-body font-semibold">Start Round</span> — everyone is
                  paired 1-v-1 and sent to their own match room.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden>⏱️</span>
                <span>
                  Once players are in their rooms, tap <span className="text-body font-semibold">Start Matches</span> to
                  begin every game at once. You host from here — you don&apos;t play.
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
                  Tap <span className="text-body font-semibold">Start Tournament</span> to create a game, then open the
                  host dashboard (new tab) and start it there.
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
      )}

      {/* How it works */}
      {!isFinished && !isHost && (
        <div className="glass-card p-5 space-y-2.5">
          <p className="label-caps">How this tournament works</p>
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
                When the host starts a game, tap <span className="text-body font-semibold">Join Game</span> to jump in.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span aria-hidden>👑</span>
              <span>
                Most points{' '}
                {tournament.target_game_count ? `after ${tournament.target_game_count} games` : 'when the host ends it'}{' '}
                wins.
              </span>
            </li>
          </ul>
        </div>
      )}

      {/* Active Game Banner */}
      {activeGame && !h2h && (
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
              Game In Progress
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
              <PrimaryBtn onClick={() => handleJoinGame(activeGame.game_id)}>Join Game</PrimaryBtn>
            </>
          )}
          {/* Eliminated players and opted-in spectators watch instead of playing.
              This is also the re-entry path if a watcher navigated back to the
              lobby mid-game (the one-shot auto-forward won't fire again). */}
          {(iAmEliminated || (spectating && !joined && !isHost)) && (
            <button onClick={() => handleWatchGame(activeGame.game_id)} className="btn-secondary w-full">
              👁 Watch live
            </button>
          )}
          {isHost && (
            <button onClick={() => openHostDashboard(activeGame.game_id)} className="btn-secondary w-full">
              Open Host Dashboard
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

      {/* Leaderboard — with "Share results" image export */}
      <TournamentShareLeaderboard tournament={tournament} players={players} />

      {/* Game History */}
      {finishedGames.length > 0 && (
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

      {/* Host Controls — head-to-head bracket */}
      {isHost && !isFinished && tournament.format === 'head-to-head' && (
        <div className="glass-card-strong p-5 space-y-4">
          <p className="label-caps">Bracket controls</p>

          {!roundInProgress && (
            <>
              <Field label="Time per player" htmlFor="h2h-timer">
                <select
                  id="h2h-timer"
                  value={h2hTimer}
                  onChange={(e) => setH2hTimer(e.target.value)}
                  className="input-field"
                >
                  <option value="0">Untimed</option>
                  <option value="180">3 min</option>
                  <option value="300">5 min</option>
                  <option value="600">10 min</option>
                </select>
              </Field>
              <div className="space-y-1.5">
                <PrimaryBtn onClick={handleStartRound} disabled={actionLoading || survivingCount < 2}>
                  {actionLoading ? 'Pairing…' : currentRoundNumber > 0 ? 'Start Next Round' : 'Start Round'}
                </PrimaryBtn>
                <p className="text-faint text-xs text-center">
                  {survivingCount < 2
                    ? 'Waiting for players to join before you can start.'
                    : 'Pairs everyone up and sends them to their match rooms.'}
                </p>
              </div>
            </>
          )}

          {stagedMatches.length > 0 && (
            <div className="space-y-1.5">
              <PrimaryBtn onClick={handleStartMatches} disabled={actionLoading}>
                {actionLoading ? 'Starting…' : `Start ${stagedMatches.length} Match${stagedMatches.length === 1 ? '' : 'es'}`}
              </PrimaryBtn>
              <p className="text-faint text-xs text-center">
                Starts every match at once. Players must be in their rooms first.
              </p>
            </div>
          )}

          <button onClick={handleEndTournament} disabled={actionLoading} className="btn-danger-soft">
            End Tournament
          </button>
        </div>
      )}

      {/* Host Controls — round-robin */}
      {isHost && !isFinished && !activeGame && tournament.format !== 'head-to-head' && (
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
