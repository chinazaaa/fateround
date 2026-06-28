'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTournamentRealtime } from '@/hooks/useTournamentRealtime'
import type { Tournament, TournamentPlayer, TournamentGame } from '@/types/tournament'
import { TOURNAMENT_ELIGIBLE_TYPES } from '@/lib/tournament-validation'

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
      <main className="min-h-dvh flex items-center justify-center">
        <p className="text-muted">Loading tournament...</p>
      </main>
    )
  }

  if (error && !tournament) {
    return (
      <main className="min-h-dvh flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </main>
    )
  }

  if (!tournament) return null

  const activeGame = games.find((g) => g.status === 'active')
  const finishedGames = games.filter((g) => g.status === 'finished')
  const isFinished = tournament.status === 'finished'

  return (
    <main className="min-h-dvh p-6 space-y-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-black text-heading">{tournament.title}</h1>
        <p className="text-faint text-sm">
          Code: <span className="font-mono font-bold text-accent">{tournament.id}</span>
          {tournament.target_game_count && (
            <span>
              {' '}
              &middot; {finishedGames.length}/{tournament.target_game_count} games
            </span>
          )}
        </p>
        {isFinished && (
          <span className="inline-block mt-2 rounded-full bg-green-500/20 px-3 py-1 text-xs font-bold text-green-400">
            Tournament Complete
          </span>
        )}
      </div>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      {/* Join Form */}
      {!joined && !isHost && !isFinished && (
        <div className="glass-card p-4 space-y-3">
          <p className="text-sm font-medium text-body">Join Tournament</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Your name"
              maxLength={50}
              className="flex-1 rounded-xl border border-theme bg-surface px-4 py-2 text-body placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent"
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button onClick={handleJoin} className="rounded-xl bg-accent px-4 py-2 font-bold text-white">
              Join
            </button>
          </div>
          {joinError && <p className="text-red-400 text-xs">{joinError}</p>}
        </div>
      )}

      {/* Active Game Banner */}
      {activeGame && (
        <div className="glass-card border-2 border-accent p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-accent">Game In Progress</p>
            <span className="text-xs text-faint">Game {activeGame.game_order}</span>
          </div>
          {joined && (
            <button
              onClick={() => handleJoinGame(activeGame.game_id)}
              className="w-full rounded-xl bg-accent px-4 py-3 font-bold text-white transition hover:brightness-110"
            >
              Join Game
            </button>
          )}
          {isHost && (
            <button
              onClick={() => router.push(`/host/${activeGame.game_id}`)}
              className="w-full rounded-xl bg-accent/20 px-4 py-2 text-sm font-bold text-accent"
            >
              Host Dashboard
            </button>
          )}
        </div>
      )}

      {/* Leaderboard */}
      <div className="glass-card p-4 space-y-3">
        <p className="text-sm font-bold text-body uppercase tracking-wider">Leaderboard</p>
        {players.length === 0 ? (
          <p className="text-faint text-sm">No players yet</p>
        ) : (
          <div className="space-y-2">
            {players.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl bg-surface px-4 py-2">
                <div className="flex items-center gap-3">
                  <span
                    className={`text-lg font-black ${
                      i === 0
                        ? 'text-yellow-400'
                        : i === 1
                          ? 'text-gray-300'
                          : i === 2
                            ? 'text-amber-600'
                            : 'text-faint'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="font-medium text-body">{p.player_name}</span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-accent">{p.total_points}pts</span>
                  <span className="text-faint text-xs ml-2">{p.games_played}g</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Game History */}
      {finishedGames.length > 0 && (
        <div className="glass-card p-4 space-y-3">
          <p className="text-sm font-bold text-body uppercase tracking-wider">Game History</p>
          <div className="space-y-2">
            {finishedGames.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-xl bg-surface px-4 py-2">
                <span className="text-sm text-body">Game {g.game_order}</span>
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
        <div className="glass-card p-4 space-y-4">
          <p className="text-sm font-bold text-body uppercase tracking-wider">Start Next Game</p>

          <div>
            <label className="block text-xs text-muted mb-1">Game Type</label>
            <select
              value={selectedGameType}
              onChange={(e) => setSelectedGameType(e.target.value)}
              className="w-full rounded-xl border border-theme bg-surface px-4 py-2 text-body focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {TOURNAMENT_ELIGIBLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {GAME_TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Rounds</label>
              <input
                type="number"
                value={roundsCount}
                onChange={(e) => setRoundsCount(e.target.value)}
                min={1}
                max={100}
                className="w-full rounded-xl border border-theme bg-surface px-4 py-2 text-body focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Timer (s)</label>
              <input
                type="number"
                value={timerSeconds}
                onChange={(e) => setTimerSeconds(e.target.value)}
                min={5}
                max={300}
                className="w-full rounded-xl border border-theme bg-surface px-4 py-2 text-body focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          <button
            onClick={handleStartGame}
            disabled={actionLoading}
            className="w-full rounded-2xl bg-accent px-6 py-3 font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
          >
            {actionLoading ? 'Starting...' : 'Start Game'}
          </button>

          <button
            onClick={handleEndTournament}
            disabled={actionLoading}
            className="w-full rounded-2xl border border-red-500/50 px-6 py-2 text-sm font-bold text-red-400 transition hover:bg-red-500/10"
          >
            End Tournament
          </button>
        </div>
      )}
    </main>
  )
}
