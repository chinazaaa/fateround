'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { GameHostChrome } from '@/components/GameHostChrome'
import { SudokuBoard } from '@/components/sudoku/SudokuBoard'
import { SudokuPlayerView } from '@/components/sudoku/SudokuPlayerView'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { parseSudokuMetadata, tallySudokuScores } from '@/lib/sudoku'
import { GAME_SELECT, PLAYER_SELECT, ROUND_SELECT, SUDOKU_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { markGameFinished } from '@/lib/game-finish'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import type { Game, Player } from '@/types'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useToast } from '@/components/ui/Toast'

type SudokuHostMode = 'spectator' | 'player'
type HostTab = 'manage' | 'play'

const HOST_MODE_KEY = (code: string) => `sudoku_host_mode_${code.toUpperCase()}`

function getSudokuHostMode(gameCode: string): SudokuHostMode {
  if (typeof window === 'undefined') return 'spectator'
  return (localStorage.getItem(HOST_MODE_KEY(gameCode)) as SudokuHostMode) ?? 'spectator'
}
function setSudokuHostMode(gameCode: string, mode: SudokuHostMode) {
  localStorage.setItem(HOST_MODE_KEY(gameCode), mode)
}

interface SudokuSubmission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  block_index: number
  is_correct: boolean
  points_awarded: number
  submitted_at: string
}

export function SudokuHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [solution, setSolution] = useState<number[][] | null>(null)
  const [puzzle, setPuzzle] = useState<number[][] | null>(null)
  const [submissions, setSubmissions] = useState<SudokuSubmission[]>([])
  const [ending, setEnding] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [starting, setStarting] = useState(false)

  // Host mode
  const [hostMode, setHostModeState] = useState<SudokuHostMode>('spectator')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')

  const load = useCallback(async () => {
    const [{ data: gameData }, { data: playersData }] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])

    if (!gameData) return
    setGame(gameData as Game)
    setPlayers((playersData ?? []) as Player[])

    if (gameData.status === 'active') {
      const { data: roundData } = await supabase
        .from('rounds')
        .select(ROUND_SELECT)
        .eq('game_id', gameCode)
        .eq('round_number', 1)
        .maybeSingle()
      if (roundData) {
        const meta = parseSudokuMetadata((roundData as Record<string, unknown>).sudoku_metadata)
        if (meta) {
          setPuzzle(meta.puzzle)
          setSolution(meta.solution)
        }
        setRoundId(roundData.id as string)

        const { data: subs } = await supabase
          .from('sudoku_submissions')
          .select(SUDOKU_SUBMISSION_SELECT)
          .eq('round_id', roundData.id)
        setSubmissions((subs ?? []) as SudokuSubmission[])
      }
    } else if (gameData.status === 'finished') {
      const { data: subs } = await supabase
        .from('sudoku_submissions')
        .select(SUDOKU_SUBMISSION_SELECT)
        .eq('game_id', gameCode)
      setSubmissions((subs ?? []) as SudokuSubmission[])
    }
  }, [gameCode])

  useEffect(() => {
    load()
    setHostModeState(getSudokuHostMode(gameCode))
    const stored = getPlayerSession(gameCode)
    if (stored) {
      setHostPlayerId(stored.playerId)
      setHostPlayerName(stored.playerName)
    }
  }, [gameCode, load])

  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  useEffect(() => {
    if (hostMode === 'player' && hostPlayerId && game?.status === 'active') {
      setTab('play')
    }
  }, [hostMode, hostPlayerId, game?.status])

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  // Real-time: game changes
  useEffect(() => {
    const ch = supabase
      .channel(`sudoku_host_game_${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          setGame(payload.new as Game)
          load()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode, load])

  // Real-time: submissions
  useEffect(() => {
    if (!roundId) return
    const ch = supabase
      .channel(`sudoku_host_subs_${roundId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sudoku_submissions', filter: `round_id=eq.${roundId}` },
        (payload) => {
          setSubmissions((prev) => {
            const exists = prev.some((s) => s.id === (payload.new as SudokuSubmission).id)
            return exists ? prev : [...prev, payload.new as SudokuSubmission]
          })
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [roundId])

  // Real-time: players
  useEffect(() => {
    const ch = supabase
      .channel(`sudoku_host_players_${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        () => {
          supabase
            .from('players')
            .select(PLAYER_SELECT)
            .eq('game_id', gameCode)
            .order('joined_at')
            .then(({ data }) => {
              if (data) setPlayers(data as Player[])
            })
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode])

  const changeHostMode = (mode: SudokuHostMode) => {
    if (game?.status !== 'waiting') return
    setHostModeState(mode)
    setSudokuHostMode(gameCode, mode)
    if (mode === 'spectator') setTab('manage')
  }

  const hostJoinGame = async () => {
    if (!hostJoinName.trim()) return
    setHostJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerName: hostJoinName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      setPlayerSession(gameCode, data.playerId, data.playerName, 'both', data.resumeToken)
      setHostPlayerId(data.playerId)
      setHostPlayerName(data.playerName)
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
    }
  }

  async function handleStart() {
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
        toastError(d.error || 'Failed to start')
        return
      }
      await load()
      if (hostMode === 'player' && hostPlayerId) setTab('play')
    } finally {
      setStarting(false)
    }
  }

  async function handleEndGame() {
    if (ending) return
    setEnding(true)
    await markGameFinished(supabase, gameCode)
    setEnding(false)
  }

  async function handlePlayAgain() {
    if (playingAgain) return
    setPlayingAgain(true)
    await fetch(`/api/games/${gameCode}/play-again`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined }),
    })
    // Reset host player session so host can re-join fresh
    clearPlayerSession(gameCode)
    setHostPlayerId(null)
    setHostPlayerName('')
    setHostJoinName('')
    setTab('manage')
    setPlayingAgain(false)
  }

  const playerNameById = Object.fromEntries(players.map((p) => [p.id, p.name]))
  const blockScorers: string[][] = Array.from({ length: 9 }, (_, i) =>
    submissions
      .filter((s) => s.block_index === i && s.is_correct)
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
      .map((s) => playerNameById[s.player_id] ?? 'Someone')
  )

  const leaderboard = tallySudokuScores(submissions, players)
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const showPlayTab = hostPlays && game?.status === 'active'

  // ── Waiting ────────────────────────────────────────────────────────────────
  if (!game || game.status === 'waiting') {
    const readyCount = players.filter((p) => p.spectator !== true).length
    const showReady = players.some((p) => p.spectator === true)

    return (
      <div className="min-h-screen flex flex-col">
        <GameHostChrome />
        <main className="pt-16 flex-1 px-4 py-8 max-w-xl mx-auto w-full space-y-6">
          <div className="text-center space-y-1">
            <p className="text-4xl">🔢</p>
            <h1 className="text-2xl font-black">{game?.title ?? 'Sudoku'}</h1>
            <p className="text-muted text-sm">
              Join at{' '}
              <span className="font-mono font-bold text-[var(--foreground)]">fateround.com/game/{gameCode}</span>
            </p>
          </div>

          {/* Host mode selector */}
          <div className="glass-card-strong p-5 space-y-3">
            <p className="label-caps">Host mode</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => changeHostMode('spectator')}
                className={[
                  'rounded-2xl border-2 px-4 py-4 text-left',
                  hostMode === 'spectator'
                    ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                    : 'border-[var(--border-strong)] text-muted',
                ].join(' ')}
              >
                <span className="font-bold block text-base">Host only</span>
                <span className="text-faint text-xs">Watch from Manage</span>
              </button>
              <button
                type="button"
                onClick={() => changeHostMode('player')}
                className={[
                  'rounded-2xl border-2 px-4 py-4 text-left',
                  hostMode === 'player'
                    ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                    : 'border-[var(--border-strong)] text-muted',
                ].join(' ')}
              >
                <span className="font-bold block text-base">Host + play</span>
                <span className="text-faint text-xs">Play tab + Manage tab</span>
              </button>
            </div>
            {hostMode === 'player' && !hostPlayerId && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={hostJoinName}
                  onChange={(e) => setHostJoinName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void hostJoinGame()}
                  placeholder="Your name"
                  className="input-field flex-1"
                  maxLength={40}
                />
                <button
                  type="button"
                  onClick={() => void hostJoinGame()}
                  disabled={!hostJoinName.trim() || hostJoining}
                  className="btn-primary btn-fit shrink-0 px-4 py-2.5 text-sm whitespace-nowrap"
                >
                  {hostJoining ? 'Joining…' : 'Join'}
                </button>
              </div>
            )}
            {hostMode === 'player' && hostPlayerId && (
              <p className="text-sm text-muted">
                Playing as <span className="font-semibold text-[var(--foreground)]">{hostPlayerName}</span>
              </p>
            )}
          </div>

          <HostLobbyPlayersSection players={players} label={showReady ? `Players — ${readyCount} ready` : 'Players'} />

          <button
            type="button"
            disabled={players.filter((p) => p.spectator !== true).length < 2 || starting}
            onClick={handleStart}
            className="btn-primary w-full py-4 text-lg font-bold disabled:opacity-50"
          >
            {starting ? 'Starting…' : 'Start puzzle'}
          </button>
        </main>
      </div>
    )
  }

  // ── Active ─────────────────────────────────────────────────────────────────
  if (game.status === 'active') {
    const correctBlocks = Array.from({ length: 9 }, (_, i) =>
      submissions.some((s) => s.block_index === i && s.is_correct)
    )
    const totalSolved = correctBlocks.filter(Boolean).length

    return (
      <div className="min-h-screen flex flex-col">
        <GameHostChrome />
        <main className="pt-16 flex-1 px-4 py-6 max-w-2xl mx-auto w-full space-y-6">
          {showPlayTab && (
            <div className="flex rounded-xl border border-[var(--border-strong)] p-1 bg-[var(--surface-inset-bg)]">
              <button
                type="button"
                onClick={() => setTab('play')}
                className={`flex-1 py-2 text-sm font-bold rounded-lg ${tab === 'play' ? 'bg-[var(--background)] shadow' : 'text-muted'}`}
              >
                Play
              </button>
              <button
                type="button"
                onClick={() => setTab('manage')}
                className={`flex-1 py-2 text-sm font-bold rounded-lg ${tab === 'manage' ? 'bg-[var(--background)] shadow' : 'text-muted'}`}
              >
                Manage
              </button>
            </div>
          )}

          {tab === 'play' && showPlayTab ? (
            <SudokuPlayerView gameCode={gameCode} />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Blocks solved</p>
                  <p className="text-2xl font-black">{totalSolved}/9</p>
                </div>
                <button
                  type="button"
                  onClick={handleEndGame}
                  disabled={ending}
                  className="btn-secondary text-sm px-4 py-2 text-red-500 border-red-400"
                >
                  {ending ? 'Ending…' : 'End game'}
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {solution && puzzle && (
                  <SudokuBoard puzzle={puzzle} solution={solution} blockScorers={blockScorers} readOnly />
                )}

                <div className="space-y-3">
                  <p className="label-caps text-xs">Live scores</p>
                  {leaderboard.map((row, i) => (
                    <div key={row.player_id} className="glass-card px-3 py-2 flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {i + 1}. {row.name}
                      </span>
                      <span className="text-sm font-bold">{row.points} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    )
  }

  // ── Finished ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      <GameHostChrome />
      <main className="pt-16 flex-1 px-4 py-8 max-w-lg mx-auto w-full space-y-6">
        <div className="glass-card-strong p-8 text-center space-y-2">
          <p className="text-4xl">🏆</p>
          <p className="text-2xl font-black">{leaderboard[0]?.name ?? 'Someone'} wins!</p>
          <p className="text-muted text-base">{leaderboard[0]?.points ?? 0} points total</p>
        </div>

        <PaginatedLeaderboard
          title="Final leaderboard"
          rows={leaderboard.map((row, i) => ({ id: row.player_id, name: row.name, score: row.points, rank: i + 1 }))}
          scoreLabel={(n) => `${n} pts`}
        />

        <button
          type="button"
          onClick={handlePlayAgain}
          disabled={playingAgain}
          className="btn-primary w-full py-3 font-bold"
        >
          {playingAgain ? 'Resetting…' : 'Play again'}
        </button>
      </main>
    </div>
  )
}
