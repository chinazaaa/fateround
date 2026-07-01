'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { GamePlayerChrome } from '@/components/GamePlayerChrome'
import { SudokuBoard } from '@/components/sudoku/SudokuBoard'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import {
  parseSudokuMetadata,
  tallySudokuScores,
  buildCellOwnerGrid,
  buildPlayerDisplayGrid,
  getNewlyCompletedUnits,
  playerCompletionPercent,
  boardCompletionPercent,
  sudokuPlayerColor,
  buildPlayerSolvedGrid,
  playerHasSolvedCell,
  SUDOKU_MY_CELL_COLOR,
  SUDOKU_WRONG_PENALTY,
  getPlayerTimeSpent,
  type SudokuSubmission,
  type SudokuUnitFlash,
} from '@/lib/sudoku'
import { GAME_SELECT, PLAYER_SELECT, ROUND_SELECT, SUDOKU_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession, setPlayerSession } from '@/lib/utils'
import { resolvePlayerSession } from '@/lib/player-resume'
import { formatMinutesSeconds } from '@/lib/timer-format'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { allowLatePlayers, playerIsViewer, preJoinScreen } from '@/lib/viewers'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { gameTypeConfig } from '@/lib/game-types'
import type { Game, Player } from '@/types'

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
    // non-fatal
  }
}

type View = 'loading' | 'join' | 'late_join_choice' | 'waiting' | 'playing' | 'finished'

type DraftUndo = { row: number; col: number; prev: number; prevWrong: boolean }

function emptyWrongGrid(): boolean[][] {
  return Array.from({ length: 9 }, () => Array(9).fill(false))
}

// Shared read-only "no local drafts" grid for rendering a watched player's board.
const EMPTY_DRAFTS: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0))

export function SudokuPlayerView({ gameCode }: { gameCode: string }) {
  const cfg = gameTypeConfig('sudoku')
  const [view, setView] = useState<View>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [puzzle, setPuzzle] = useState<number[][] | null>(null)
  const [userGrid, setUserGrid] = useState<number[][]>(Array.from({ length: 9 }, () => Array(9).fill(0)))
  const [wrongDrafts, setWrongDrafts] = useState<boolean[][]>(emptyWrongGrid)
  const [nowMs, setNowMs] = useState<number>(Date.now())

  useEffect(() => {
    if (view === 'playing') {
      const interval = setInterval(() => {
        setNowMs(Date.now())
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [view])
  const [undoStack, setUndoStack] = useState<DraftUndo[]>([])
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null)
  const [watchedPlayerId, setWatchedPlayerId] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<SudokuSubmission[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [flashUnits, setFlashUnits] = useState<SudokuUnitFlash[]>([])
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  function triggerUnitFlash(units: SudokuUnitFlash[]) {
    if (units.length === 0) return
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    setFlashUnits(units)
    flashTimerRef.current = setTimeout(() => {
      setFlashUnits([])
      flashTimerRef.current = null
    }, 550)
  }

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [])

  const load = useCallback(async () => {
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

    // Validate the stored session against the live roster: a removed player is marked
    // "kicked" (so room auto-join won't silently pull them back) and bounced to the
    // join / viewer-or-player screen, consistent with the other games.
    const session = await resolvePlayerSession(gameCode, playersData)

    if (!session?.playerId) {
      // Someone opening the link mid-game gets the viewer/player choice, like other games.
      const pre = preJoinScreen(gameData as Game, false)
      setView(pre === 'late_join_choice' ? 'late_join_choice' : 'join')
      return
    }
    myPlayerIdRef.current = session.playerId
    myResumeTokenRef.current = session.resumeToken ?? null

    if (gameData.status === 'waiting') {
      setView('waiting')
      return
    }

    if (gameData.status === 'finished') {
      const { data: subs } = await supabase
        .from('sudoku_submissions')
        .select(SUDOKU_SUBMISSION_SELECT)
        .eq('game_id', gameCode)
      setSubmissions((subs ?? []) as SudokuSubmission[])
      setView('finished')
      return
    }

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
    setSubmissions((subs ?? []) as SudokuSubmission[])

    const savedGrid = loadSavedGrid(roundData.id as string, session.playerId)
    setUserGrid(savedGrid ?? Array.from({ length: 9 }, () => Array(9).fill(0)))
    setWrongDrafts(emptyWrongGrid())
    setUndoStack([])
    setView('playing')
  }, [gameCode])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const ch = supabase
      .channel(`sudoku_game_${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          setGame(payload.new as Game)
          // Re-derive the screen from session + status (handles lobby reopen for
          // no-session viewers, mid-game start, and finish alike).
          load()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode, load])

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
    async (opts?: { name?: string; joinAsViewer?: boolean }) => {
      const name = (opts?.name ?? joinName).trim()
      if (!name) return
      setJoining(true)
      try {
        const res = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameCode,
            playerName: name,
            ...joinExtras,
            ...(game?.status === 'active' ? { joinAsViewer: opts?.joinAsViewer } : {}),
          }),
        })
        const json = await res.json()
        if (!res.ok) {
          showToast(json.error ?? 'Failed to join', false)
          return
        }
        myPlayerIdRef.current = json.playerId
        myResumeTokenRef.current = json.resumeToken ?? null
        setPlayerSession(
          gameCode,
          json.playerId,
          json.playerName,
          json.playerGender ?? 'no_pref',
          json.resumeToken ?? null
        )
        // Derive the right screen: waiting-room joiners wait, mid-game joiners
        // (players and viewers alike) drop straight into the live puzzle.
        await load()
      } finally {
        setJoining(false)
      }
    },
    [game?.status, gameCode, joinExtras, joinName, load]
  )

  useRoomMemberAutoJoin({
    gameCode,
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

  function handlePlayerLeft() {
    clearPlayerSession(gameCode)
    myPlayerIdRef.current = null
    myResumeTokenRef.current = null
    setJoinName('')
    void load()
  }

  const cellOwners = useMemo(() => buildCellOwnerGrid(submissions), [submissions])
  const mySolvedCells = useMemo(
    () => (myPlayerId ? buildPlayerSolvedGrid(submissions, myPlayerId) : undefined),
    [submissions, myPlayerId]
  )
  const displayGrid = useMemo(() => {
    if (!puzzle || !myPlayerId) return userGrid
    return buildPlayerDisplayGrid(puzzle, submissions, myPlayerId, userGrid)
  }, [puzzle, userGrid, submissions, myPlayerId])

  const activePlayers = useMemo(() => players.filter((p) => p.spectator !== true), [players])
  const playerColors = useMemo(() => {
    const map: Record<string, string> = {}
    activePlayers.forEach((p, i) => {
      map[p.id] = sudokuPlayerColor(i)
    })
    return map
  }, [activePlayers])

  const leaderboard = tallySudokuScores(submissions, players)
  const me = players.find((p) => p.id === myPlayerId)
  const isSpectator = me?.spectator === true
  const isViewer = !!(game && me && playerIsViewer(me, game))
  const myRank = leaderboard.findIndex((r) => r.player_id === myPlayerId) + 1
  const myCompletion = puzzle && myPlayerId ? playerCompletionPercent(puzzle, submissions, myPlayerId) : 0
  const boardCompletion = puzzle ? boardCompletionPercent(puzzle, cellOwners) : 0

  // Viewers watch one player at a time — the same personal board that player sees:
  // their own solved cells filled and highlighted, everyone else's just claimed.
  const effectiveWatchedId =
    (watchedPlayerId && activePlayers.some((p) => p.id === watchedPlayerId) ? watchedPlayerId : null) ??
    leaderboard.find((row) => activePlayers.some((p) => p.id === row.player_id))?.player_id ??
    activePlayers[0]?.id ??
    null
  const watchedPlayer = players.find((p) => p.id === effectiveWatchedId)
  const watchedGrid =
    puzzle && effectiveWatchedId
      ? buildPlayerDisplayGrid(puzzle, submissions, effectiveWatchedId, EMPTY_DRAFTS)
      : puzzle
  const watchedSolvedCells = effectiveWatchedId ? buildPlayerSolvedGrid(submissions, effectiveWatchedId) : undefined
  const watchedRank = leaderboard.findIndex((r) => r.player_id === effectiveWatchedId) + 1
  const watchedCompletion =
    puzzle && effectiveWatchedId ? playerCompletionPercent(puzzle, submissions, effectiveWatchedId) : 0

  const { context: lateJoinContext, loading: lateJoinContextLoading } = useLateJoinContext(
    gameCode,
    game,
    view === 'late_join_choice',
    submissions.length
  )
  const { context: viewerPromoteContext } = useLateJoinContext(
    gameCode,
    game,
    isViewer && view === 'playing',
    submissions.length
  )

  function isCellEditable(row: number, col: number): boolean {
    if (isViewer) return false
    if (!puzzle || !myPlayerId) return false
    if (puzzle[row]![col] !== 0) return false
    return !playerHasSolvedCell(submissions, myPlayerId, row, col)
  }

  function handleCellSelect(row: number, col: number) {
    if (!isCellEditable(row, col)) return
    setSelectedCell([row, col])
  }

  function setWrongDraft(row: number, col: number, wrong: boolean) {
    setWrongDrafts((prev) => {
      const next = prev.map((r) => [...r])
      next[row]![col] = wrong
      return next
    })
  }

  function pushDraftUndo(row: number, col: number, prev: number, prevWrong: boolean) {
    setUndoStack((stack) => [...stack, { row, col, prev, prevWrong }])
  }

  function clearLocalDraft(row: number, col: number) {
    setUserGrid((prev) => {
      const next = prev.map((r) => [...r])
      next[row][col] = 0
      if (roundId && myPlayerId) saveGrid(roundId, myPlayerId, next)
      return next
    })
    setWrongDraft(row, col, false)
  }

  async function submitCell(row: number, col: number, value: number) {
    if (!myPlayerId || !roundId || submitting) return

    const resumeToken = myResumeTokenRef.current
    if (!resumeToken) {
      showToast('Your session has expired — please rejoin', false)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/sudoku/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken, row, col, value }),
      })
      const json = await res.json()
      if (!res.ok) {
        showToast(json.error ?? 'Submission failed', false)
        return
      }

      if (json.isCorrect) {
        showToast(`✓ Correct! +${json.pointsAwarded} pts`, true)
        if (puzzle && myPlayerId) {
          triggerUnitFlash(getNewlyCompletedUnits(puzzle, submissions, myPlayerId, row, col))
        }
        setUserGrid((prev) => {
          const next = prev.map((r) => [...r])
          next[row][col] = value
          if (roundId && myPlayerId) saveGrid(roundId, myPlayerId, next)
          return next
        })
        setWrongDraft(row, col, false)
      } else {
        showToast(`✗ Wrong! ${SUDOKU_WRONG_PENALTY} pts`, false)
        setUserGrid((prev) => {
          const next = prev.map((r) => [...r])
          next[row][col] = value
          if (roundId && myPlayerId) saveGrid(roundId, myPlayerId, next)
          return next
        })
        setWrongDraft(row, col, true)
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleNumberPress(value: number) {
    if (submitting) return
    if (!selectedCell) return
    const [row, col] = selectedCell
    if (!isCellEditable(row, col)) return

    const prev = userGrid[row]?.[col] ?? 0
    const prevWrong = wrongDrafts[row]?.[col] ?? false
    setUserGrid((prevGrid) => {
      const next = prevGrid.map((r) => [...r])
      next[row][col] = value
      if (roundId && myPlayerId) saveGrid(roundId, myPlayerId, next)
      return next
    })
    setWrongDraft(row, col, false)
    pushDraftUndo(row, col, prev, prevWrong)

    void submitCell(row, col, value)
  }

  function handleErase() {
    if (submitting) return
    if (!selectedCell) return
    const [row, col] = selectedCell
    if (!isCellEditable(row, col)) return
    const current = userGrid[row]?.[col] ?? 0
    const isWrong = wrongDrafts[row]?.[col] ?? false
    if (!current && !isWrong) return

    pushDraftUndo(row, col, current, isWrong)
    clearLocalDraft(row, col)
  }

  function handleUndo() {
    if (submitting) return
    const stack = [...undoStack]
    while (stack.length > 0) {
      const last = stack.pop()!
      if (!isCellEditable(last.row, last.col)) continue

      setUndoStack(stack)
      setUserGrid((prev) => {
        const grid = prev.map((r) => [...r])
        grid[last.row][last.col] = last.prev
        if (roundId && myPlayerId) saveGrid(roundId, myPlayerId, grid)
        return grid
      })
      setWrongDraft(last.row, last.col, last.prevWrong)
      setSelectedCell([last.row, last.col])
      return
    }
    setUndoStack([])
  }

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
      <GameJoinLobbyShell
        gameCode={gameCode}
        header={
          <GameJoinHeader
            emoji={cfg.headerEmoji}
            title={game?.title ?? 'Sudoku'}
            gameType="sudoku"
            subtitle="Race to fill cells before your friends."
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void handleJoin()}
          joining={joining}
          submitLabel="Join game"
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="sudoku" variant="subtle" />
            </p>
          }
        />
      </GameJoinLobbyShell>
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
        showNameField
        nameInput={joinName}
        onNameChange={setJoinName}
        joining={joining}
        onJoinAsViewer={() => void handleJoin({ joinAsViewer: true })}
        onJoinAsPlayer={() => void handleJoin({ joinAsViewer: false })}
      />
    )
  }

  if (view === 'waiting') {
    return (
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={me?.name ?? ''}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title={game?.title ?? 'Sudoku'}
          description="Waiting for the host to start the puzzle…"
          rulesLink={<GameRulesLink gameType="sudoku" variant="subtle" />}
          isSpectator={isSpectator}
          onReady={handleReady}
        />
      </GameJoinLobbyShell>
    )
  }

  if (view === 'finished') {
    const mySudokuRow = leaderboard.find((row) => row.player_id === myPlayerId)
    const iWonSudoku =
      !!mySudokuRow &&
      leaderboard[0] != null &&
      mySudokuRow.points === leaderboard[0].points &&
      leaderboard[0].points > 0
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
            rows={leaderboard.map((row, i) => {
              const pct = puzzle ? playerCompletionPercent(puzzle, submissions, row.player_id) : 0
              const timeSecs = getPlayerTimeSpent(game, submissions, row.player_id, pct, nowMs)
              return {
                id: row.player_id,
                name: `${row.name} (⏱️ ${formatMinutesSeconds(timeSecs)})`,
                score: row.points,
                rank: i + 1,
              }
            })}
            highlightId={myPlayerId ?? undefined}
            scoreLabel={(n) => `${n} pts`}
          />
          {iWonSudoku && (
            <PostWinToCommunity
              gameType="sudoku"
              gameCode={gameCode}
              winnerName={mySudokuRow?.name ?? ''}
              roundKey={game?.session_started_at ?? undefined}
            />
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/80 dark:bg-slate-950/50">
      <GamePlayerChrome />
      {toast && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-semibold shadow-lg ${toast.ok ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}
        >
          {toast.msg}
        </div>
      )}
      <main className="pt-16 flex-1 px-3 py-4 max-w-lg mx-auto w-full space-y-4">
        {isViewer ? (
          <>
            <ViewerModeBanner
              gameCode={gameCode}
              playerId={myPlayerId}
              game={game}
              player={me}
              playerDetail={viewerPromoteContext?.playerDetail}
              onPromoted={load}
            />
            {activePlayers.length > 0 ? (
              <div className="glass-card p-3 space-y-2">
                <p className="label-caps text-xs">Watching a player&apos;s board</p>
                <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {activePlayers.map((p) => {
                    const active = p.id === effectiveWatchedId
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setWatchedPlayerId(p.id)}
                        className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                          active
                            ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                            : 'bg-slate-100/70 text-slate-600 border-slate-200 hover:text-slate-900 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: playerColors[p.id] ?? '#86efac' }}
                        />
                        {p.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p className="glass-card p-3 text-center text-xs text-muted">
                No players have joined the puzzle yet — pick a player to watch once they do.
              </p>
            )}
          </>
        ) : (
          /* Player status header */
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-sm shrink-0" style={{ backgroundColor: SUDOKU_MY_CELL_COLOR }} />
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-100 leading-tight">{me?.name ?? 'Me'}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {myRank > 0 ? `${ordinal(myRank)}` : '—'} | {myCompletion}%
                </p>
              </div>
            </div>
            {game?.session_started_at && (
              <div className="text-sm font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-md">
                ⏱️ {formatMinutesSeconds(getPlayerTimeSpent(game, submissions, myPlayerId || '', myCompletion, nowMs))}
              </div>
            )}
          </div>
        )}

        {puzzle &&
          (isViewer ? (
            watchedGrid && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-sm shrink-0" style={{ backgroundColor: SUDOKU_MY_CELL_COLOR }} />
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-100 leading-tight">
                        {watchedPlayer?.name ?? 'Player'}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {watchedRank > 0 ? `${ordinal(watchedRank)}` : '—'} | {watchedCompletion}%
                      </p>
                    </div>
                  </div>
                  {game?.session_started_at && effectiveWatchedId && (
                    <div className="text-sm font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-md">
                      ⏱️{' '}
                      {formatMinutesSeconds(
                        getPlayerTimeSpent(game, submissions, effectiveWatchedId, watchedCompletion, nowMs)
                      )}
                    </div>
                  )}
                </div>
                <SudokuBoard
                  puzzle={puzzle}
                  userGrid={watchedGrid}
                  cellOwners={cellOwners}
                  mySolvedCells={watchedSolvedCells}
                  playerColors={playerColors}
                  myPlayerId={effectiveWatchedId}
                  completionPercent={watchedCompletion}
                  readOnly
                />
              </div>
            )
          ) : (
            <SudokuBoard
              puzzle={puzzle}
              userGrid={displayGrid}
              cellOwners={cellOwners}
              mySolvedCells={mySolvedCells}
              playerColors={playerColors}
              myPlayerId={myPlayerId}
              selectedCell={selectedCell}
              draftWrongCells={wrongDrafts}
              onCellSelect={handleCellSelect}
              onNumberPress={handleNumberPress}
              onErase={handleErase}
              onUndo={handleUndo}
              undoDisabled={undoStack.length === 0}
              completionPercent={boardCompletion}
              canSelectCell={(r, c) => isCellEditable(r, c)}
              flashUnits={flashUnits}
            />
          ))}

        {/* Player standings */}
        <div className="space-y-2">
          {leaderboard.map((row, i) => {
            const pct = puzzle ? playerCompletionPercent(puzzle, submissions, row.player_id) : 0
            const color = playerColors[row.player_id] ?? '#86efac'
            const playerSolved = buildPlayerSolvedGrid(submissions, row.player_id)
            const timeSecs = getPlayerTimeSpent(game, submissions, row.player_id, pct, nowMs)
            return (
              <div
                key={row.player_id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  row.player_id === myPlayerId
                    ? 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
                    : 'border-transparent bg-slate-100/60 dark:bg-slate-900/40'
                }`}
              >
                <MiniGrid puzzle={puzzle} playerSolved={playerSolved} color={color} />
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{row.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {ordinal(i + 1)} of {leaderboard.length} · Completed: {pct}%{' '}
                    {game?.session_started_at ? `· ⏱️ ${formatMinutesSeconds(timeSecs)}` : ''}
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                  {row.points} pts
                </span>
              </div>
            )
          })}
        </div>

        {myPlayerId && (
          <PlayerSessionControls
            gameCode={gameCode}
            playerId={myPlayerId}
            currentName={me?.name ?? ''}
            onRenamed={() => void load()}
            onLeft={handlePlayerLeft}
            leaveOnly={isViewer}
          />
        )}
      </main>
    </div>
  )
}

function ordinal(n: number): string {
  const j = n % 10
  const k = n % 100
  if (j === 1 && k !== 11) return `${n}st`
  if (j === 2 && k !== 12) return `${n}nd`
  if (j === 3 && k !== 13) return `${n}rd`
  return `${n}th`
}

function MiniGrid({
  puzzle,
  playerSolved,
  color,
}: {
  puzzle: number[][] | null
  playerSolved: boolean[][]
  color: string
}) {
  if (!puzzle) return <div className="w-8 h-8 rounded bg-slate-200 dark:bg-slate-700 shrink-0" />

  return (
    <div
      className="grid shrink-0 w-8 h-8 border border-slate-300 dark:border-slate-600 rounded-sm overflow-hidden"
      style={{ gridTemplateColumns: 'repeat(9, 1fr)' }}
    >
      {Array.from({ length: 81 }, (_, i) => {
        const row = Math.floor(i / 9)
        const col = i % 9
        const owned = playerSolved[row]?.[col]
        const given = puzzle[row]?.[col] !== 0
        return (
          <div
            key={i}
            className="aspect-square"
            style={{
              backgroundColor: owned ? color : given ? 'rgba(148,163,184,0.3)' : 'transparent',
            }}
          />
        )
      })}
    </div>
  )
}
