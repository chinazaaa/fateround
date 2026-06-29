'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTournamentRealtime } from '@/hooks/useTournamentRealtime'
import type { Tournament, TournamentPlayer, TournamentGame } from '@/types/tournament'
import { TOURNAMENT_ELIGIBLE_TYPES } from '@/lib/tournament-validation'
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

  async function handleStartGame() {
    if (!hostToken) return
    setActionLoading(true)

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
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to start game')
        return
      }
      localStorage.setItem(`host_token_${data.gameCode}`, data.gameHostToken)
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
        {isFinished && (
          <span className="premium-badge" style={{ marginTop: '0.25rem' }}>
            🏆 Tournament Complete
          </span>
        )}
      </div>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      {/* Join Form */}
      {!joined && !isHost && !isFinished && (
        <div className="glass-card-strong p-5 space-y-3">
          <p className="label-caps">Join Tournament</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Your name"
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
          {joined && (
            <PrimaryBtn onClick={() => handleJoinGame(activeGame.game_id)}>Join Game</PrimaryBtn>
          )}
          {isHost && (
            <button onClick={() => router.push(`/host/${activeGame.game_id}`)} className="btn-secondary w-full">
              Host Dashboard
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

          <Field label="Game Type">
            <select
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
            <Field label="Rounds">
              <input
                type="number"
                value={roundsCount}
                onChange={(e) => setRoundsCount(e.target.value)}
                min={1}
                max={100}
                className="input-field"
              />
            </Field>
            <Field label="Timer (s)">
              <input
                type="number"
                value={timerSeconds}
                onChange={(e) => setTimerSeconds(e.target.value)}
                min={5}
                max={300}
                className="input-field"
              />
            </Field>
          </div>

          <PrimaryBtn onClick={handleStartGame} disabled={actionLoading}>
            {actionLoading ? 'Starting…' : 'Start Game'}
          </PrimaryBtn>

          <button onClick={handleEndTournament} disabled={actionLoading} className="btn-danger-soft">
            End Tournament
          </button>
        </div>
      )}
    </PageShell>
  )
}
