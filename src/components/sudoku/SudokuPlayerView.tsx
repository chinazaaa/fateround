'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { GamePlayerChrome } from '@/components/GamePlayerChrome'
import { SudokuBoard, type BlockStatus } from '@/components/sudoku/SudokuBoard'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { parseSudokuMetadata, tallySudokuScores, SUDOKU_SCORING, SUDOKU_WRONG_PENALTY } from '@/lib/sudoku'
import { GAME_SELECT, PLAYER_SELECT, ROUND_SELECT, SUDOKU_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { getPlayerSession, setPlayerSession } from '@/lib/utils'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import type { Game, Player } from '@/types'

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

// Persist the player's entered cells so a mid-game refresh doesn't wipe them —
// including blocks already solved (which lock their inputs and can't be retyped).
// Keyed by round so a play-again / new round starts from a clean grid.
const GRID_KEY = (roundId: string, playerId: string) => `sudoku_grid_${roundId}_${playerId}`

function loadSavedGrid(roundId: string, playerId: string): number[][] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(GRID_KEY(roundId, playerId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      Array.isArray(parsed) &&
      parsed.length === 9 &&
      parsed.every((r) => Array.isArray(r) && r.length === 9 && r.every((v) => typeof v === 'number'))
    ) {
      return parsed as number[][]
    }
  } catch {
    // Corrupt entry — ignore and start fresh.
  }
  return null
}

function saveGrid(roundId: string, playerId: string, grid: number[][]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(GRID_KEY(roundId, playerId), JSON.stringify(grid))
  } catch {
    // Storage full / unavailable — non-fatal, the grid just won't survive refresh.
  }
}

type View = 'loading' | 'join' | 'waiting' | 'playing' | 'finished'

export function SudokuPlayerView({ gameCode }: { gameCode: string }) {
  const [view, setView] = useState<View>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [puzzle, setPuzzle] = useState<number[][] | null>(null)
  const [userGrid, setUserGrid] = useState<number[][]>(Array.from({ length: 9 }, () => Array(9).fill(0)))
  const [submissions, setSubmissions] = useState<SudokuSubmission[]>([])
  const [submitting, setSubmitting] = useState<number | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  const myPlayerIdRef = useRef<string | null>(null)
  const myResumeTokenRef = useRef<string | null>(null)

  const myPlayerId = myPlayerIdRef.current

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    const session = getPlayerSession(gameCode)

    const [{ data: gameData }, { data: playersData }] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])

    if (!gameData) {
      setView('loading')
      return
    }
    setGame(gameData as Game)
    setPlayers((playersData ?? []) as Player[])

    if (!session?.playerId) {
      setView('join')
      return
    }
    myPlayerIdRef.current = session.playerId
    myResumeTokenRef.current = session.resumeToken ?? null

    if (gameData.status === 'waiting') {
      setView('waiting')
      return
    }

    if (gameData.status === 'finished') {
      // Load submissions for leaderboard
      const { data: subs } = await supabase
        .from('sudoku_submissions')
        .select(SUDOKU_SUBMISSION_SELECT)
        .eq('game_id', gameCode)
      setSubmissions((subs ?? []) as SudokuSubmission[])
      setView('finished')
      return
    }

    // Active — load round + submissions
    const { data: roundData } = await supabase
      .from('rounds')
      .select(ROUND_SELECT)
      .eq('game_id', gameCode)
      .eq('round_number', 1)
      .maybeSingle()
    if (!roundData) {
      setView('waiting')
      return
    }

    const meta = parseSudokuMetadata((roundData as Record<string, unknown>).sudoku_metadata)
    if (!meta) {
      setView('waiting')
      return
    }

    setPuzzle(meta.puzzle)
    setRoundId(roundData.id as string)

    const { data: subs } = await supabase
      .from('sudoku_submissions')
      .select(SUDOKU_SUBMISSION_SELECT)
      .eq('round_id', roundData.id)
    const submissionRows = (subs ?? []) as SudokuSubmission[]
    setSubmissions(submissionRows)

    // Rebuild this player's grid after a refresh. Solved blocks are authoritative and
    // come from the server — the solution is no longer in client metadata, so we ask
    // for just this player's solved-block cells (a 9×9 grid, 0 elsewhere) and overlay
    // them onto any in-progress entries restored from localStorage.
    const savedGrid = loadSavedGrid(roundData.id as string, session.playerId)
    const grid = savedGrid ? savedGrid.map((r) => [...r]) : Array.from({ length: 9 }, () => Array(9).fill(0))
    const { data: solvedCells } = await supabase.rpc('sudoku_solved_cells', {
      p_round_id: roundData.id,
      p_player_id: session.playerId,
    })
    if (Array.isArray(solvedCells)) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const v = (solvedCells as number[][])[r]?.[c]
          if (typeof v === 'number' && v > 0) grid[r][c] = v
        }
      }
    }
    setUserGrid(grid)

    setView('playing')
  }, [gameCode])

  useEffect(() => {
    load()
  }, [load])

  // Real-time: game status changes
  useEffect(() => {
    const ch = supabase
      .channel(`sudoku_game_${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          setGame(payload.new as Game)
          const status = (payload.new as Game).status
          if (status === 'waiting') setView('waiting')
          if (status === 'active') load()
          if (status === 'finished') load()
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
      .channel(`sudoku_subs_${roundId}`)
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

  // Real-time: players joining
  useEffect(() => {
    const ch = supabase
      .channel(`sudoku_players_${gameCode}`)
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

  const handleJoin = useCallback(
    async (opts?: { name?: string }) => {
      const name = (opts?.name ?? joinName).trim()
      if (!name) return
      setJoining(true)
      try {
        const res = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameCode, playerName: name, ...joinExtras }),
        })
        const json = await res.json()
        if (!res.ok) {
          showToast(json.error ?? 'Failed to join', false)
          return
        }
        myPlayerIdRef.current = json.playerId
        setPlayerSession(
          gameCode,
          json.playerId,
          json.playerName,
          json.playerGender ?? 'no_pref',
          json.resumeToken ?? null
        )
        setView('waiting')
      } finally {
        setJoining(false)
      }
    },
    [gameCode, joinExtras, joinName]
  )

  useRoomMemberAutoJoin({
    displayName: roomDisplayName,
    resolving: resolvingRoomMember,
    screen: view,
    gameStatus: game?.status,
    hasPlayerSession: !!myPlayerId,
    joining,
    onJoin: (name) => handleJoin({ name }),
  })

  async function handleReady() {
    const resumeToken = myResumeTokenRef.current
    if (!resumeToken) return
    await fetch('/api/players/ready', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, resumeToken }),
    })
    await load()
  }

  function handleCellChange(row: number, col: number, value: number) {
    const playerId = myPlayerIdRef.current
    setUserGrid((prev) => {
      const next = prev.map((r) => [...r])
      next[row][col] = value
      if (roundId && playerId) saveGrid(roundId, playerId, next)
      return next
    })
  }

  async function handleSubmitBlock(blockIndex: number) {
    if (!myPlayerId || !roundId || submitting !== null) return

    // Extract 3×3 block — use puzzle value for givens, userGrid for editable cells
    const br = Math.floor(blockIndex / 3) * 3
    const bc = (blockIndex % 3) * 3
    const cells = Array.from({ length: 3 }, (_, r) =>
      Array.from({ length: 3 }, (_, c) => {
        const row = br + r
        const col = bc + c
        const given = puzzle?.[row]?.[col] ?? 0
        return given !== 0 ? given : (userGrid[row]?.[col] ?? 0)
      })
    )

    // Check all 9 cells are filled
    if (cells.flat().some((v) => v === 0)) {
      showToast('Fill in all 9 cells in the block before submitting', false)
      return
    }

    const resumeToken = myResumeTokenRef.current
    if (!resumeToken) {
      showToast('Your session has expired — please rejoin', false)
      return
    }

    setSubmitting(blockIndex)
    try {
      const res = await fetch('/api/sudoku/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken, blockIndex, cells }),
      })
      const json = await res.json()
      if (!res.ok) {
        showToast(json.error ?? 'Submission failed', false)
      } else if (json.isCorrect) {
        showToast(`✓ Correct! +${json.pointsAwarded} pts`, true)
      } else {
        showToast(`✗ Wrong! ${SUDOKU_WRONG_PENALTY} pts — try again`, false)
      }
    } finally {
      setSubmitting(null)
    }
  }

  // Derive per-block status for this player (wrong answers don't lock out — can retry)
  const mySubmissions = myPlayerId ? submissions.filter((s) => s.player_id === myPlayerId) : []
  const blockStatuses: BlockStatus[] = Array.from({ length: 9 }, (_, i) => {
    const correct = mySubmissions.find((s) => s.block_index === i && s.is_correct)
    return correct ? 'claimed' : 'idle'
  })

  // Per-block scorers (names of correct submitters, ordered)
  const playerNameById = Object.fromEntries(players.map((p) => [p.id, p.name]))
  const blockScorers: string[][] = Array.from({ length: 9 }, (_, i) =>
    submissions
      .filter((s) => s.block_index === i && s.is_correct)
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
      .map((s) => playerNameById[s.player_id] ?? 'Someone')
  )

  const leaderboard = tallySudokuScores(submissions, players)
  const me = players.find((p) => p.id === myPlayerId)
  const isSpectator = me?.spectator === true

  if (view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  if (view === 'join') {
    if (resolvingRoomMember) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted text-lg">Joining from your game room…</p>
        </div>
      )
    }

    return (
      <div className="min-h-screen flex flex-col">
        <GamePlayerChrome />
        <main className="pt-16 flex-1 flex items-center justify-center px-4">
          <JoinForm name={joinName} onNameChange={setJoinName} onJoin={() => void handleJoin()} joining={joining} />
        </main>
      </div>
    )
  }

  if (view === 'waiting') {
    return (
      <div className="min-h-screen flex flex-col">
        <GamePlayerChrome />
        <main className="pt-16 flex-1 flex items-center justify-center px-4 py-8">
          <div className="glass-card-strong p-8 w-full max-w-sm text-center space-y-4">
            <p className="text-3xl">🔢</p>
            <h2 className="text-xl font-black">{game?.title ?? 'Sudoku'}</h2>
            {isSpectator ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">New round</p>
                <p className="text-muted text-sm">Tap below to join the next round</p>
                <button type="button" onClick={handleReady} className="btn-primary w-full py-3 font-bold">
                  I'm in — ready to play
                </button>
              </>
            ) : (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">You're in</p>
                <p className="text-muted text-sm">Waiting for the host to start the puzzle…</p>
                <p className="text-muted text-xs">
                  {players.filter((p) => p.spectator !== true).length} player
                  {players.filter((p) => p.spectator !== true).length !== 1 ? 's' : ''} ready
                </p>
              </>
            )}
          </div>
        </main>
      </div>
    )
  }

  if (view === 'finished') {
    return (
      <div className="min-h-screen flex flex-col">
        <GamePlayerChrome />
        <main className="pt-16 flex-1 px-4 py-8 max-w-lg mx-auto w-full space-y-6">
          <div className="glass-card-strong p-8 text-center space-y-2">
            <p className="text-4xl">🏆</p>
            <p className="text-2xl font-black">Puzzle complete!</p>
            {leaderboard[0] && (
              <p className="text-muted text-base">
                {leaderboard[0].name} wins with {leaderboard[0].points} pts
              </p>
            )}
          </div>
          <PaginatedLeaderboard
            title="Final leaderboard"
            rows={leaderboard.map((row, i) => ({ id: row.player_id, name: row.name, score: row.points, rank: i + 1 }))}
            highlightId={myPlayerId ?? undefined}
            scoreLabel={(n) => `${n} pts`}
          />
        </main>
      </div>
    )
  }

  // Playing view
  return (
    <div className="min-h-screen flex flex-col">
      <GamePlayerChrome />
      {toast && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-semibold shadow-lg ${toast.ok ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}
        >
          {toast.msg}
        </div>
      )}
      <main className="pt-16 flex-1 px-3 py-6 max-w-lg mx-auto w-full space-y-5">
        {/* Score */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Your score</p>
            <p className="text-2xl font-black">
              {leaderboard.find((r) => r.player_id === myPlayerId)?.points ?? 0} pts
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Blocks claimed</p>
            <p className="text-2xl font-black">{mySubmissions.filter((s) => s.is_correct).length}/9</p>
          </div>
        </div>

        {/* Scoring guide */}
        <div className="glass-card px-3 py-2 flex items-center gap-3 text-xs text-[var(--muted)] flex-wrap">
          <span>
            1st <span className="font-bold text-emerald-500">+{SUDOKU_SCORING[0]}</span>
          </span>
          <span>
            2nd <span className="font-bold text-emerald-400">+{SUDOKU_SCORING[1]}</span>
          </span>
          <span>
            3rd <span className="font-bold text-emerald-300">+{SUDOKU_SCORING[2]}</span>
          </span>
          <span>
            4th+ <span className="font-bold text-emerald-200">+{SUDOKU_SCORING[3]}</span>
          </span>
          <span>
            Wrong <span className="font-bold text-red-400">{SUDOKU_WRONG_PENALTY}</span> · retry OK
          </span>
        </div>

        {puzzle && (
          <SudokuBoard
            puzzle={puzzle}
            userGrid={userGrid}
            onCellChange={handleCellChange}
            onSubmitBlock={handleSubmitBlock}
            blockStatuses={blockStatuses}
            blockScorers={blockScorers}
            submitting={submitting}
          />
        )}

        {/* Mini leaderboard */}
        {leaderboard.length > 0 && (
          <div className="glass-card p-3 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Live scores</p>
            {leaderboard.slice(0, 5).map((row, i) => (
              <div
                key={row.player_id}
                className={`flex items-center justify-between text-sm py-0.5 ${row.player_id === myPlayerId ? 'font-bold text-violet-500 dark:text-violet-400' : ''}`}
              >
                <span>
                  {i + 1}. {row.name}
                </span>
                <span>{row.points} pts</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function JoinForm({
  name,
  onNameChange,
  onJoin,
  joining,
}: {
  name: string
  onNameChange: (value: string) => void
  onJoin: () => void
  joining: boolean
}) {
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await onJoin()
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card-strong p-8 w-full max-w-sm space-y-4 text-center">
      <p className="text-3xl">🔢</p>
      <h1 className="text-2xl font-black">Join Sudoku</h1>
      <p className="text-muted text-sm">Race to solve 3×3 blocks before your friends</p>
      <input
        type="text"
        placeholder="Your name"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        maxLength={32}
        className="input-field w-full"
        autoFocus
      />
      <button type="submit" disabled={!name.trim() || joining} className="btn-primary w-full">
        {joining ? 'Joining…' : 'Join game'}
      </button>
    </form>
  )
}
