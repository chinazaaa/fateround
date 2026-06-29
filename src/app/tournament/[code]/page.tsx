'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTournamentRealtime } from '@/hooks/useTournamentRealtime'
import type { Tournament, TournamentPlayer, TournamentGame } from '@/types/tournament'
import type { TriviaQuestion } from '@/types'
import { TOURNAMENT_ELIGIBLE_TYPES } from '@/lib/tournament-validation'
import {
  parseTriviaQuestionImport,
  parseExcelTriviaQuestionImport,
  formatTriviaImportSummary,
  questionSampleFile,
} from '@/lib/custom-questions'
import { PageShell, Field, PrimaryBtn } from '@/components/ui/PageShell'

const MEDAL = ['🥇', '🥈', '🥉']
const RANK_COLOR = ['var(--marry)', '#64748b', '#b45309']

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

  const [selectedGameType, setSelectedGameType] = useState('trivia')
  const [roundsCount, setRoundsCount] = useState('10')
  const [timerSeconds, setTimerSeconds] = useState('30')
  const [actionLoading, setActionLoading] = useState(false)

  const [questionSource, setQuestionSource] = useState<'platform' | 'custom'>('platform')
  const [customTrivia, setCustomTrivia] = useState<TriviaQuestion[]>([])
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const forwardedGameRef = useRef<string | null>(null)

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
  }, [tournamentId])

  // Auto-forward joined players into a game as soon as the host starts it, so
  // they don't have to find it themselves. The host stays on the lobby to manage.
  useEffect(() => {
    if (!joined || isHost || tournament?.status === 'finished') return
    const name = localStorage.getItem(`tournament_player_${tournamentId}`)
    // Eliminated players stay on the lobby to spectate — don't pull them into games.
    const me = name ? players.find((p) => p.player_name.toLowerCase() === name.toLowerCase()) : null
    if (me?.is_eliminated) return
    const active = games.find((g) => g.status === 'active')
    if (!active || forwardedGameRef.current === active.game_id) return
    forwardedGameRef.current = active.game_id
    const suffix = name ? `?name=${encodeURIComponent(name)}&tournament=${tournamentId}` : ''
    router.push(`/game/${active.game_id}${suffix}`)
  }, [joined, isHost, tournament?.status, games, players, tournamentId, router])

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

  function handleJoinGame(gameCode: string) {
    const name = localStorage.getItem(`tournament_player_${tournamentId}`)
    if (name) {
      router.push(`/game/${gameCode}?name=${encodeURIComponent(name)}&tournament=${tournamentId}`)
    } else {
      router.push(`/game/${gameCode}`)
    }
  }

  function openHostDashboard(gameCode: string) {
    const token = localStorage.getItem(`host_token_${gameCode}`) ?? ''
    // Open in a new tab so the host keeps this lobby tab open across games.
    window.open(`/host/${gameCode}?token=${token}`, '_blank', 'noopener,noreferrer')
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
  const points = tournament.placement_points ?? [10, 7, 5, 3, 2, 1]
  const lives = tournament.elimination_config
  const isParticipant = joined && !isHost
  const isFull = tournament.max_players != null && players.length >= tournament.max_players

  // Host-control derived state
  const rounds = parseInt(roundsCount, 10) || 10
  const isFirstGame = games.length === 0
  const isCustom = selectedGameType === 'trivia' && questionSource === 'custom'
  // Custom requires a loaded pack with enough questions. The host's uploaded pack
  // persists on the lobby between games (and the server de-dupes already-seen
  // questions across games), so reuse needs no special-casing here.
  const canStartCustom = !isCustom || customTrivia.length >= rounds

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
          <span className="chip text-xs">🎮 Trivia</span>
          <span className="chip text-xs">
            {tournament.target_game_count ? `Best of ${tournament.target_game_count}` : 'Unlimited games'}
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
          <button onClick={handleShare} className="btn-secondary btn-fit mx-auto text-sm">
            {copied ? '✓ Link copied' : '🔗 Copy invite link'}
          </button>
        )}
      </div>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      {/* Join Form */}
      {!joined && !isHost && !isFinished && isFull && (
        <div className="glass-card-strong p-5 text-center space-y-1">
          <p className="font-bold text-body">Tournament full</p>
          <p className="text-muted text-sm">This tournament has reached its {tournament.max_players}-player limit.</p>
        </div>
      )}

      {!joined && !isHost && !isFinished && !isFull && (
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
        </div>
      )}

      {/* How it works */}
      {!isFinished && (
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
      {activeGame && (
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
          {joined && <PrimaryBtn onClick={() => handleJoinGame(activeGame.game_id)}>Join Game</PrimaryBtn>}
          {isHost && (
            <button onClick={() => openHostDashboard(activeGame.game_id)} className="btn-secondary w-full">
              Open Host Dashboard
            </button>
          )}
        </div>
      )}

      {/* Leaderboard */}
      <div className="glass-card p-5 space-y-3">
        <p className="label-caps">Leaderboard</p>
        {players.length === 0 ? (
          <p className="text-faint text-sm">No players yet</p>
        ) : (
          <div className="space-y-2">
            {players.map((p, i) => (
              <div
                key={p.id}
                className={`result-row flex items-center justify-between px-4 py-2.5 ${
                  i === 0 ? 'result-row-winner-amber' : ''
                } ${p.is_eliminated ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-6 text-center text-base font-black tabular-nums shrink-0"
                    style={{ color: i < 3 ? RANK_COLOR[i] : 'var(--faint)' }}
                  >
                    {i < 3 ? MEDAL[i] : i + 1}
                  </span>
                  <span className="font-medium text-body truncate">{p.player_name}</span>
                  {p.lives_remaining != null && !p.is_eliminated && (
                    <span className="text-xs shrink-0">{'❤️'.repeat(Math.max(0, p.lives_remaining))}</span>
                  )}
                  {p.is_eliminated && <span className="text-xs text-red-400 ml-1 shrink-0">Eliminated</span>}
                </div>
                <div className="text-right shrink-0">
                  <span className="font-bold tabular-nums" style={{ color: 'var(--primary)' }}>
                    {p.total_points}
                    <span className="text-xs font-semibold">pts</span>
                  </span>
                  <span className="text-faint text-xs ml-2">{p.games_played}g</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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

      {/* Host Controls */}
      {isHost && !isFinished && !activeGame && (
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
                      <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary w-full">
                        Choose CSV or Excel file
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
                        Your pack stays loaded between games — already-seen questions are skipped automatically.
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
            <PrimaryBtn onClick={handleStartGame} disabled={actionLoading || !canStartCustom || players.length === 0}>
              {actionLoading ? 'Starting…' : isFirstGame ? 'Start Tournament' : 'Start Next Game'}
            </PrimaryBtn>
            <p className="text-faint text-xs text-center">
              {players.length === 0
                ? 'Waiting for players to join before you can start.'
                : 'Creates the game room. Open the host dashboard (new tab) to start it once players have joined.'}
            </p>
          </div>

          {isCustom && customTrivia.length > 0 && customTrivia.length < rounds && (
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
