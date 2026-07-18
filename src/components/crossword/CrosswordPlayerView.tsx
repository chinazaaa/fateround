'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CrosswordBoard, crosswordPlayerColor, CROSSWORD_MY_CELL_COLOR } from '@/components/crossword/CrosswordBoard'
import { CrosswordGameTimerBar } from '@/components/crossword/CrosswordGameTimerBar'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { useGameScores } from '@/components/roster/RosterDrawerContext'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { FinalResultsShareBlock } from '@/components/FinalResultsShareBlock'
import {
  parseCrosswordMetadata,
  crosswordWordCells,
  tallyCrosswordScores,
  buildCellOwnerGrid,
  buildPlayerSolvedGrid,
  buildPlayerLetterGrid,
  playerCompletionPercent,
  playerHasSolvedCell,
  playerCompletedWord,
  CROSSWORD_MIN_PLAYERS,
  CROSSWORD_HINT_PENALTY,
  type CrosswordMetadata,
  type CrosswordClue,
  type CrosswordDirection,
  type CrosswordSubmission,
} from '@/lib/crossword'
import { getPlayerTimeSpent } from '@/lib/sudoku'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { PLAYER_SELECT, ROUND_SELECT, CROSSWORD_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import { formatMinutesSeconds } from '@/lib/timer-format'
import { useGameRosterPoll } from '@/hooks/useGameRosterPoll'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { allowLatePlayers, playerIsViewer, preJoinScreen } from '@/lib/viewers'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { gameTypeConfig } from '@/lib/game-types'
import type { Game, Player } from '@/types'

const GRID_KEY = (roundId: string, playerId: string) => `crossword_grid_${roundId}_${playerId}`

function loadSavedLetters(roundId: string, playerId: string, size: number): string[][] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(GRID_KEY(roundId, playerId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      Array.isArray(parsed) &&
      parsed.length === size &&
      parsed.every((r) => Array.isArray(r) && r.length === size && r.every((v) => typeof v === 'string'))
    ) {
      return parsed as string[][]
    }
  } catch {
    // Corrupt entry — ignore and start fresh.
  }
  return null
}

function saveLetters(roundId: string, playerId: string, grid: string[][]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(GRID_KEY(roundId, playerId), JSON.stringify(grid))
  } catch {
    // non-fatal
  }
}

function emptyLetters(size: number): string[][] {
  return Array.from({ length: size }, () => Array(size).fill(''))
}

function emptyBooleans(size: number): boolean[][] {
  return Array.from({ length: size }, () => Array(size).fill(false))
}

const cellKey = (row: number, col: number) => `${row}-${col}`

/** Find the clue whose word runs through [row,col] in the given direction. */
function findClueAt(
  metadata: CrosswordMetadata,
  row: number,
  col: number,
  direction: CrosswordDirection
): CrosswordClue | null {
  for (const clue of metadata.clues) {
    if (clue.direction !== direction) continue
    if (crosswordWordCells(clue).some(([r, c]) => r === row && c === col)) return clue
  }
  return null
}

type View = 'loading' | 'join' | 'late_join_choice' | 'waiting' | 'playing' | 'finished'
type CrosswordGameState = { hasValidRound: boolean }

export function CrosswordPlayerView({ gameCode }: { gameCode: string }) {
  const cfg = gameTypeConfig('crossword')
  const router = useRouter()
  const { confirm } = useConfirm()
  const [roundId, setRoundId] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<CrosswordMetadata | null>(null)
  const [localLetters, setLocalLetters] = useState<string[][]>([])
  const [wrongDrafts, setWrongDrafts] = useState<boolean[][]>([])
  const [nowMs, setNowMs] = useState<number>(Date.now())
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null)
  const [direction, setDirection] = useState<CrosswordDirection>('across')
  const [watchedPlayerId, setWatchedPlayerId] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<CrosswordSubmission[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [solutionGrid, setSolutionGrid] = useState<string[][] | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Letters submit concurrently per cell — a single global lock would drop keystrokes
  // typed faster than the round-trip. Keyed by cell+letter so a re-typed correction still
  // fires while an identical duplicate event (mobile keydown+input) is coalesced.
  const inFlightSubmits = useRef<Set<string>>(new Set())
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2500)
  }

  const loadGameState = useCallback(async (): Promise<{ state: CrosswordGameState; ok: boolean }> => {
    return { state: { hasValidRound: false }, ok: true }
  }, [])

  const afterResolve = useCallback(
    async (gameData: Game, playerId: string | null): Promise<CrosswordGameState> => {
      // Finished games show the final leaderboard to everyone — even a session-less visitor.
      // Load the round metadata too: without it, `metadata` is null on a refresh of the
      // finished screen and the leaderboard (and answer key) blank out because the tally
      // can't run.
      if (gameData.status === 'finished') {
        const { data: roundData } = await supabase
          .from('rounds')
          .select(ROUND_SELECT)
          .eq('game_id', gameCode)
          .eq('round_number', 1)
          .maybeSingle()
        if (roundData) {
          const meta = parseCrosswordMetadata((roundData as Record<string, unknown>).crossword_metadata)
          if (meta) setMetadata(meta)
          setRoundId(roundData.id as string)
        }
        const { data: subs } = await supabase
          .from('crossword_submissions')
          .select(CROSSWORD_SUBMISSION_SELECT)
          .eq('game_id', gameCode)
        setSubmissions((subs ?? []) as CrosswordSubmission[])
        return { hasValidRound: false }
      }

      if (!playerId) return { hasValidRound: false }
      if (gameData.status === 'waiting') return { hasValidRound: false }

      const { data: roundData } = await supabase
        .from('rounds')
        .select(ROUND_SELECT)
        .eq('game_id', gameCode)
        .eq('round_number', 1)
        .maybeSingle()
      if (!roundData) return { hasValidRound: false }

      const meta = parseCrosswordMetadata((roundData as Record<string, unknown>).crossword_metadata)
      if (!meta) return { hasValidRound: false }

      setMetadata(meta)
      setRoundId(roundData.id as string)

      const { data: subs } = await supabase
        .from('crossword_submissions')
        .select(CROSSWORD_SUBMISSION_SELECT)
        .eq('round_id', roundData.id)
      setSubmissions((subs ?? []) as CrosswordSubmission[])

      const saved = loadSavedLetters(roundData.id as string, playerId, meta.size)
      setLocalLetters(saved ?? emptyLetters(meta.size))
      setWrongDrafts(emptyBooleans(meta.size))
      return { hasValidRound: true }
    },
    [gameCode]
  )

  const computeScreen = useCallback((gameData: Game, playerId: string | null, state: CrosswordGameState): View => {
    if (gameData.status === 'finished') return 'finished'
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      return pre === 'late_join_choice' ? 'late_join_choice' : 'join'
    }
    if (gameData.status === 'waiting') return 'waiting'
    return state.hasValidRound ? 'playing' : 'waiting'
  }, [])

  const {
    screen: view,
    game,
    setGame,
    players,
    setPlayers,
    myPlayerId,
    setMyPlayerId,
    myResumeToken,
    setMyResumeToken,
    joinName,
    setJoinName,
    joining,
    load,
    join,
  } = useGameViewBootstrap<View, CrosswordGameState>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'loading',
    loadGameState,
    computeScreen,
    afterResolve,
    joinExtras,
    onJoinError: (message) => showToast(message, false),
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  useTurnNotifications({ status: game?.status })

  useEffect(() => {
    if (view === 'playing') {
      const interval = setInterval(() => setNowMs(Date.now()), 1000)
      return () => clearInterval(interval)
    }
  }, [view])

  useGameRosterPoll(gameCode, game?.status, { setGame, setPlayers, reload: load })

  // Latest committed status, read by the games channel without resubscribing.
  const gameStatusRef = useRef(game?.status)
  gameStatusRef.current = game?.status
  useEffect(() => {
    const ch = supabase
      .channel(`crossword_game_${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          const next = payload.new as Game
          setGame(next)
          // Only a full reload on a status transition (the case a re-derive is for); other
          // games-row writes just refresh the game object above. Reloading on every UPDATE
          // was a primary driver of the finish-screen flicker.
          if (next.status !== gameStatusRef.current) load()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode, load, setGame])

  useEffect(() => {
    if (!roundId) return
    // With many players every keystroke is an INSERT for EVERYONE — applying each one as its own
    // setState re-renders the whole board per keystroke-per-player and starves your own typing.
    // Buffer incoming rows and flush them in a single update a few times a second instead.
    const pending: CrosswordSubmission[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    const flush = () => {
      flushTimer = null
      if (pending.length === 0) return
      const batch = pending.splice(0, pending.length)
      setSubmissions((prev) => {
        const ids = new Set(prev.map((s) => s.id))
        const working = [...prev]
        let changed = false
        for (const next of batch) {
          if (ids.has(next.id)) continue
          ids.add(next.id)
          // Absorb the optimistic own-cell row (added on submit) so we don't keep a duplicate.
          const optIdx = next.is_correct
            ? working.findIndex(
                (s) =>
                  s.id.startsWith('optimistic-') &&
                  s.player_id === next.player_id &&
                  s.cell_row === next.cell_row &&
                  s.cell_col === next.cell_col
              )
            : -1
          if (optIdx >= 0) working[optIdx] = next
          else working.push(next)
          changed = true
        }
        return changed ? working : prev
      })
    }
    const ch = supabase
      .channel(`crossword_subs_${roundId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'crossword_submissions', filter: `round_id=eq.${roundId}` },
        (payload) => {
          pending.push(payload.new as CrosswordSubmission)
          if (!flushTimer) flushTimer = setTimeout(flush, 200)
        }
      )
      .subscribe()
    return () => {
      if (flushTimer) clearTimeout(flushTimer)
      void supabase.removeChannel(ch)
    }
  }, [roundId])

  useEffect(() => {
    const ch = supabase
      .channel(`crossword_players_${gameCode}`)
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
  }, [gameCode, setPlayers])

  useRoomMemberAutoJoin({
    gameCode,
    displayName: roomDisplayName,
    resolving: resolvingRoomMember,
    screen: view,
    gameStatus: game?.status,
    hasPlayerSession: !!myPlayerId,
    joining,
    onJoin: (name) => join({ name }),
  })

  async function handleReady() {
    if (!myResumeToken) return
    await fetch('/api/players/ready', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
    })
    await load()
  }

  const [replayReadyPending, setReplayReadyPending] = useState(false)
  async function toggleReplayReady(ready: boolean) {
    if (!myResumeToken) {
      showToast('Your player session expired — rejoin to continue', false)
      return
    }
    setReplayReadyPending(true)
    try {
      await fetch('/api/players/ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, ready }),
      })
      await load()
    } finally {
      setReplayReadyPending(false)
    }
  }

  function handlePlayerLeft() {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyResumeToken(null)
    setJoinName('')
    void load()
  }

  const activePlayers = useMemo(() => players.filter((p) => p.spectator !== true), [players])
  const playerColors = useMemo(() => {
    const map: Record<string, string> = {}
    activePlayers.forEach((p, i) => {
      map[p.id] = crosswordPlayerColor(i)
    })
    return map
  }, [activePlayers])

  const cellOwners = useMemo(() => (metadata ? buildCellOwnerGrid(metadata, submissions) : []), [metadata, submissions])
  const mySolvedCells = useMemo(
    () => (metadata && myPlayerId ? buildPlayerSolvedGrid(metadata, submissions, myPlayerId) : undefined),
    [metadata, submissions, myPlayerId]
  )
  const displayGrid = useMemo(() => {
    if (!metadata || !myPlayerId) return localLetters
    return buildPlayerLetterGrid(metadata, submissions, myPlayerId, localLetters)
  }, [metadata, submissions, myPlayerId, localLetters])

  // Toast when the player completes a word (a cell going correct can finish one).
  const completedWordsRef = useRef<Set<string>>(new Set())
  const completionReadyRef = useRef(false)
  useEffect(() => {
    if (!metadata || !myPlayerId) return
    const newlyDone: CrosswordClue[] = []
    for (const clue of metadata.clues) {
      const key = `${clue.number}-${clue.direction}`
      if (completedWordsRef.current.has(key)) continue
      if (playerCompletedWord(submissions, myPlayerId, clue)) {
        completedWordsRef.current.add(key)
        newlyDone.push(clue)
      }
    }
    // Skip the first pass (initial load of an in-progress game) so we only toast live finishes.
    if (completionReadyRef.current) {
      for (const clue of newlyDone) {
        showToast(`Solved ${clue.number} ${clue.direction === 'across' ? 'Across' : 'Down'}! 🎉`, true)
      }
    }
    completionReadyRef.current = true
  }, [submissions, metadata, myPlayerId])

  // A replay reuses this component with a fresh round — drop the previous game's answer grid
  // so the finish screen refetches the new puzzle's solution instead of pairing new clues with
  // stale letters (which garbles every word in the answer key).
  useEffect(() => {
    setSolutionGrid(null)
  }, [roundId])

  // Once the game is over, fetch the answer grid to show the answer key on the finish screen.
  useEffect(() => {
    if (view !== 'finished' || solutionGrid) return
    let cancelled = false
    fetch(`/api/crossword/solution?gameId=${gameCode.toUpperCase()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.solution) setSolutionGrid(j.solution as string[][])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [view, solutionGrid, gameCode])

  // Heaviest per-render call in the view (parses a Date per submission, then loops
  // clues × active players × cells over *every* player's accumulated submissions). Left
  // un-memoized it re-ran on every keystroke and every 1s tick, blocking the input thread.
  const leaderboard = useMemo(
    () => (metadata ? tallyCrosswordScores(metadata, submissions, players) : []),
    [metadata, submissions, players]
  )

  // Live scores feed the shared roster drawer (opened from the header).
  const rosterScores = useMemo(
    () => Object.fromEntries(leaderboard.map((row) => [row.player_id, row.points])),
    [leaderboard]
  )
  useGameScores(rosterScores, { suffix: ' pts' })
  const me = players.find((p) => p.id === myPlayerId)
  const isSpectator = me?.spectator === true
  const isViewer = !!(game && me && playerIsViewer(me, game))

  // Change name · Leave game for players/spectators live behind the main chrome's ⚙
  // gear (top header). Registered while the game is active; the shared settings sheet
  // renders it.
  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId || game?.status !== 'active') return null
    return (
      <div className="space-y-3">
        <EditNameInline
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={me?.name ?? ''}
          onRenamed={() => void load()}
          spectating={isViewer}
        />
        <LeaveGameButton
          gameCode={gameCode}
          playerId={myPlayerId}
          onLeft={() => {
            clearPlayerSession(gameCode)
            router.push('/')
          }}
          confirmMessage="You can rejoin with your player code if the host opens the lobby again."
        />
      </div>
    )
  }, [myPlayerId, game?.status, gameCode, me?.name, isViewer, load, router])
  useRegisterGameSettings(playerSettingsNode)

  const myRank = leaderboard.findIndex((r) => r.player_id === myPlayerId) + 1
  const myCompletion = metadata && myPlayerId ? playerCompletionPercent(metadata, submissions, myPlayerId) : 0

  // Active word (across/down) covering the selected cell.
  const activeClue = useMemo(() => {
    if (!metadata || !selectedCell) return null
    return findClueAt(metadata, selectedCell[0], selectedCell[1], direction)
  }, [metadata, selectedCell, direction])
  const activeCells = useMemo(() => {
    const set = new Set<string>()
    if (activeClue) for (const [r, c] of crosswordWordCells(activeClue)) set.add(cellKey(r, c))
    return set
  }, [activeClue])
  // Both clues that intersect the selected cell, so the bar can show Across AND Down at once
  // (no scrolling to the lists or re-tapping to flip direction just to read the other clue).
  const cellAcrossClue = useMemo(
    () => (metadata && selectedCell ? findClueAt(metadata, selectedCell[0], selectedCell[1], 'across') : null),
    [metadata, selectedCell]
  )
  const cellDownClue = useMemo(
    () => (metadata && selectedCell ? findClueAt(metadata, selectedCell[0], selectedCell[1], 'down') : null),
    [metadata, selectedCell]
  )

  // Viewer watching one player's personal board.
  const effectiveWatchedId =
    (watchedPlayerId && activePlayers.some((p) => p.id === watchedPlayerId) ? watchedPlayerId : null) ??
    leaderboard.find((row) => activePlayers.some((p) => p.id === row.player_id))?.player_id ??
    activePlayers[0]?.id ??
    null
  const watchedPlayer = players.find((p) => p.id === effectiveWatchedId)
  const watchedGrid = useMemo(
    () =>
      metadata && effectiveWatchedId
        ? buildPlayerLetterGrid(metadata, submissions, effectiveWatchedId, emptyLetters(metadata.size))
        : [],
    [metadata, submissions, effectiveWatchedId]
  )
  const watchedSolvedCells =
    metadata && effectiveWatchedId ? buildPlayerSolvedGrid(metadata, submissions, effectiveWatchedId) : undefined
  const watchedCompletion =
    metadata && effectiveWatchedId ? playerCompletionPercent(metadata, submissions, effectiveWatchedId) : 0

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
    if (!metadata || !myPlayerId) return false
    if (metadata.blocked[row]?.[col]) return false
    return !playerHasSolvedCell(submissions, myPlayerId, row, col)
  }

  const focusInput = useCallback(() => {
    // Focus SYNCHRONOUSLY inside the tap handler — iOS Safari only pops the on-screen
    // keyboard when focus() runs within the user gesture, not from a deferred callback.
    // preventScroll keeps the board from jumping to the off-screen input.
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  // Stable while metadata/selection are unchanged so the memoized board can skip ambient
  // re-renders (1s tick, roster refresh) instead of rebuilding all its cells each time.
  const handleCellSelect = useCallback(
    (row: number, col: number) => {
      if (!metadata || metadata.blocked[row]?.[col]) return
      // Re-tapping the active cell flips across/down.
      if (selectedCell && selectedCell[0] === row && selectedCell[1] === col) {
        setDirection((d) => {
          const next: CrosswordDirection = d === 'across' ? 'down' : 'across'
          return findClueAt(metadata, row, col, next) ? next : d
        })
        focusInput()
        return
      }
      // Prefer the direction whose word STARTS at this cell (so clicking a numbered cell shows
      // that word's clue), then the current direction, then whatever's available.
      const acrossClue = findClueAt(metadata, row, col, 'across')
      const downClue = findClueAt(metadata, row, col, 'down')
      const startsAcross = acrossClue && acrossClue.row === row && acrossClue.col === col
      const startsDown = downClue && downClue.row === row && downClue.col === col
      if (startsAcross && !startsDown) setDirection('across')
      else if (startsDown && !startsAcross) setDirection('down')
      else if (direction === 'across' && !acrossClue && downClue) setDirection('down')
      else if (direction === 'down' && !downClue && acrossClue) setDirection('across')
      setSelectedCell([row, col])
      focusInput()
    },
    [metadata, selectedCell, direction, focusInput]
  )

  function selectClue(clue: CrosswordClue) {
    setDirection(clue.direction)
    setSelectedCell([clue.row, clue.col])
    focusInput()
  }

  function setLetterDraft(row: number, col: number, letter: string, wrong: boolean) {
    setLocalLetters((prev) => {
      const next = prev.map((r) => [...r])
      if (next[row]) next[row][col] = letter
      if (roundId && myPlayerId) saveLetters(roundId, myPlayerId, next)
      return next
    })
    setWrongDrafts((prev) => {
      const next = prev.map((r) => [...r])
      if (next[row]) next[row][col] = wrong
      return next
    })
  }

  /** Move the cursor to the next un-solved cell along the active word. */
  function advanceCursor(row: number, col: number) {
    if (!metadata) return
    const clue = findClueAt(metadata, row, col, direction)
    if (!clue) return
    const cells = crosswordWordCells(clue)
    const idx = cells.findIndex(([r, c]) => r === row && c === col)
    for (let i = idx + 1; i < cells.length; i++) {
      const [r, c] = cells[i]
      if (isCellEditable(r, c)) {
        setSelectedCell([r, c])
        return
      }
    }
    // Fall back to the very next cell even if solved, so the cursor visibly moves.
    if (idx + 1 < cells.length) setSelectedCell(cells[idx + 1])
  }

  function stepBack(row: number, col: number) {
    if (!metadata) return
    const clue = findClueAt(metadata, row, col, direction)
    if (!clue) return
    const cells = crosswordWordCells(clue)
    const idx = cells.findIndex(([r, c]) => r === row && c === col)
    if (idx > 0) setSelectedCell(cells[idx - 1])
  }

  function moveInDirection(row: number, col: number, dRow: number, dCol: number) {
    if (!metadata) return
    let r = row + dRow
    let c = col + dCol
    while (r >= 0 && r < metadata.size && c >= 0 && c < metadata.size) {
      if (!metadata.blocked[r]?.[c]) {
        setSelectedCell([r, c])
        return
      }
      r += dRow
      c += dCol
    }
  }

  async function submitLetter(row: number, col: number, letter: string, hint: boolean) {
    if (!myPlayerId || !roundId) return
    if (!myResumeToken) {
      showToast('Your session has expired — please rejoin', false)
      return
    }
    // Per-cell in-flight guard: distinct cells submit concurrently (so typing a word fast
    // never drops letters), while an identical duplicate event for the same cell is skipped.
    const key = `${row}-${col}-${letter}-${hint ? 'h' : ''}`
    if (inFlightSubmits.current.has(key)) return
    inFlightSubmits.current.add(key)
    if (hint) setSubmitting(true)
    try {
      const res = await fetch('/api/crossword/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, row, col, letter, hint }),
      })
      const json = await res.json()
      if (!res.ok) {
        // Timer expiry (or a finish race) flips the game — refetch to land on results.
        if (typeof json.error === 'string' && json.error.toLowerCase().includes('time')) {
          await load()
        } else {
          showToast(json.error ?? 'Submission failed', false)
        }
        return
      }
      const resolved = String(json.letter ?? letter).toUpperCase()
      if (json.isCorrect) {
        setLetterDraft(row, col, resolved, false)
        // Optimistically record my own correct cell so my completion % (and the "puzzle
        // complete" state) update instantly — the realtime INSERT can lag with many players,
        // which left finished players stuck showing a stale % until they refreshed.
        setSubmissions((prev) => {
          if (
            prev.some((s) => s.player_id === myPlayerId && s.cell_row === row && s.cell_col === col && s.is_correct)
          ) {
            return prev
          }
          return [
            ...prev,
            {
              id: `optimistic-${row}-${col}-${Date.now()}`,
              game_id: gameCode,
              round_id: roundId,
              player_id: myPlayerId,
              cell_row: row,
              cell_col: col,
              submitted_letter: resolved,
              is_correct: true,
              via_hint: hint,
              submitted_at: new Date().toISOString(),
            } as CrosswordSubmission,
          ]
        })
        if (hint) showToast(`Revealed ${resolved} · ${CROSSWORD_HINT_PENALTY} pts`, false)
      } else {
        setLetterDraft(row, col, resolved, true)
      }
    } finally {
      inFlightSubmits.current.delete(key)
      if (hint) setSubmitting(false)
    }
  }

  function handleTypeLetter(letter: string) {
    if (!selectedCell) return
    const [row, col] = selectedCell
    if (!isCellEditable(row, col)) return
    const upper = letter.toUpperCase()
    setLetterDraft(row, col, upper, false)
    void submitLetter(row, col, upper, false)
    advanceCursor(row, col)
    // Re-assert focus so the mobile keyboard stays up after each letter (iOS otherwise
    // dismisses it once the controlled input resets to '').
    focusInput()
  }

  // Mobile keyboards (Gboard etc.) often skip keydown for letter keys and only fire an
  // input event — capture the typed character here. The input value stays controlled at ''.
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const char = e.target.value.slice(-1)
    if (/^[a-zA-Z]$/.test(char)) handleTypeLetter(char)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!selectedCell) return
    const [row, col] = selectedCell
    if (/^[a-zA-Z]$/.test(e.key)) {
      e.preventDefault()
      handleTypeLetter(e.key)
      return
    }
    switch (e.key) {
      case 'Backspace': {
        e.preventDefault()
        if (isCellEditable(row, col) && localLetters[row]?.[col]) {
          setLetterDraft(row, col, '', false)
        } else {
          stepBack(row, col)
        }
        break
      }
      case 'ArrowRight':
        e.preventDefault()
        setDirection('across')
        moveInDirection(row, col, 0, 1)
        break
      case 'ArrowLeft':
        e.preventDefault()
        setDirection('across')
        moveInDirection(row, col, 0, -1)
        break
      case 'ArrowDown':
        e.preventDefault()
        setDirection('down')
        moveInDirection(row, col, 1, 0)
        break
      case 'ArrowUp':
        e.preventDefault()
        setDirection('down')
        moveInDirection(row, col, -1, 0)
        break
      case ' ':
      case 'Tab': {
        e.preventDefault()
        if (metadata) {
          const next: CrosswordDirection = direction === 'across' ? 'down' : 'across'
          if (findClueAt(metadata, row, col, next)) setDirection(next)
        }
        break
      }
      default:
        break
    }
  }

  async function handleHint() {
    if (!selectedCell || submitting) return
    const [row, col] = selectedCell
    if (!isCellEditable(row, col)) return
    const ok = await confirm({
      title: 'Reveal this letter?',
      message: `Fills the correct letter here for a ${CROSSWORD_HINT_PENALTY}-point penalty.`,
      confirmLabel: 'Reveal letter',
    })
    if (!ok) return
    await submitLetter(row, col, localLetters[row]?.[col] || 'A', true)
    advanceCursor(row, col)
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
            title={game?.title ?? 'Crossword'}
            gameType="crossword"
            subtitle="Race to fill the grid before your friends."
            meta={<GameInfoChips game={game} />}
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          joining={joining}
          gameType="crossword"
          submitLabel="Join game"
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="crossword" variant="subtle" />
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
        onJoinAsViewer={() => void join({ joinAsViewer: true })}
        onJoinAsPlayer={() => void join({ joinAsViewer: false })}
      />
    )
  }

  if (view === 'waiting') {
    if (game?.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={CROSSWORD_MIN_PLAYERS}
            onToggleReady={(ready) => void toggleReplayReady(ready)}
            onStart={() => {}}
            pending={replayReadyPending}
            gameCode={gameCode}
            onLeft={handlePlayerLeft}
          />
        </GameJoinLobbyShell>
      )
    }
    return (
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          game={game}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={me?.name ?? ''}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title={game?.title ?? 'Crossword'}
          description="Waiting for the host to start the puzzle…"
          rulesLink={<GameRulesLink gameType="crossword" variant="subtle" />}
          isSpectator={isSpectator}
          onReady={handleReady}
        />
      </GameJoinLobbyShell>
    )
  }

  if (view === 'finished' && game) {
    // A crossword has exactly one winner: the single top-ranked player after all
    // tiebreaks (points → words → finish time → name), matching the mobile view.
    // Post the community win only when that winner is me — never every player tied
    // on points, which would put multiple "winners" on the board for one game.
    const leader = leaderboard[0]
    const iWon = !!leader && leader.player_id === myPlayerId && leader.wordsCompleted > 0
    return (
      <div className="min-h-screen flex flex-col">
        <main className="pt-16 flex-1 px-4 py-8 max-w-lg mx-auto w-full space-y-6">
          <FinalResultsShareBlock game={game} participants={[]} votes={[]} rounds={[]} players={players}>
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
                const pct = metadata ? playerCompletionPercent(metadata, submissions, row.player_id) : 0
                const timeSecs = getPlayerTimeSpent(
                  game,
                  submissions,
                  row.player_id,
                  pct,
                  nowMs,
                  players.find((p) => p.id === row.player_id)?.joined_at
                )
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
          </FinalResultsShareBlock>
          {iWon && (
            <PostWinToCommunity
              gameType="crossword"
              gameCode={gameCode}
              winnerName={leader?.name ?? ''}
              roundKey={game?.session_started_at ?? undefined}
            />
          )}
          {solutionGrid && metadata && (
            <div className="glass-card p-4 space-y-3">
              <p className="label-caps text-xs">Answers</p>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                {(['across', 'down'] as const).map((dir) => (
                  <div key={dir} className="space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{dir}</p>
                    {metadata.clues
                      .filter((c) => c.direction === dir)
                      .map((c) => {
                        const word = crosswordWordCells(c)
                          .map(([r, col]) => solutionGrid[r]?.[col] ?? '')
                          .join('')
                        return (
                          <p key={`${c.number}-${c.direction}`} className="text-sm text-muted">
                            <span className="font-semibold text-[var(--foreground)]">{c.number}.</span> {c.clue} —{' '}
                            <span className="font-bold text-[var(--foreground)]">{word}</span>
                          </p>
                        )
                      })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    )
  }

  const acrossClues = metadata?.clues.filter((c) => c.direction === 'across') ?? []
  const downClues = metadata?.clues.filter((c) => c.direction === 'down') ?? []

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/80 dark:bg-slate-950/50">
      {toast && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-semibold shadow-lg ${toast.ok ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}
        >
          {toast.msg}
        </div>
      )}
      {/* Off-screen input drives the on-device keyboard while capturing physical keys. */}
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        aria-hidden
        tabIndex={-1}
        value=""
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        // In-viewport (top-left, 1px, invisible) so iOS keeps the keyboard up — but NOT
        // pointer-events-none, which would stop it being focusable and block the keyboard.
        className="fixed top-0 left-0 h-px w-px opacity-0"
      />
      <main className="pt-16 flex-1 px-3 py-4 max-w-lg mx-auto w-full space-y-4">
        <CrosswordGameTimerBar gameCode={gameCode} game={game} onExpired={load} />

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
                          style={{ backgroundColor: playerColors[p.id] ?? '#94a3b8' }}
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
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-sm shrink-0" style={{ backgroundColor: CROSSWORD_MY_CELL_COLOR }} />
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-100 leading-tight">{me?.name ?? 'Me'}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {myRank > 0 ? ordinal(myRank) : '—'} | {myCompletion}%
                </p>
              </div>
            </div>
            {game?.session_started_at && (
              <div className="text-sm font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-md">
                ⏱️{' '}
                {formatMinutesSeconds(
                  getPlayerTimeSpent(game, submissions, myPlayerId || '', myCompletion, nowMs, me?.joined_at)
                )}
              </div>
            )}
          </div>
        )}

        {metadata &&
          (isViewer ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-sm shrink-0" style={{ backgroundColor: CROSSWORD_MY_CELL_COLOR }} />
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-100 leading-tight">
                      {watchedPlayer?.name ?? 'Player'}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{watchedCompletion}% complete</p>
                  </div>
                </div>
              </div>
              <CrosswordBoard
                metadata={metadata}
                letterGrid={watchedGrid}
                cellOwners={cellOwners}
                mySolvedCells={watchedSolvedCells}
                playerColors={playerColors}
                myPlayerId={effectiveWatchedId}
                readOnly
              />
            </div>
          ) : (
            <>
              {myCompletion >= 100 && (
                <div className="mx-auto px-4 py-3 flex flex-col items-center justify-center glass-card text-center gap-0.5">
                  <span className="text-base font-extrabold text-[var(--foreground)]">🎉 Puzzle complete!</span>
                  <span className="text-sm text-muted">
                    Nicely done — waiting for the other players{game?.game_duration_seconds ? ' or the timer' : ''} to
                    finish.
                  </span>
                </div>
              )}
              <CrosswordBoard
                metadata={metadata}
                letterGrid={displayGrid}
                cellOwners={cellOwners}
                mySolvedCells={mySolvedCells}
                playerColors={playerColors}
                myPlayerId={myPlayerId}
                selectedCell={selectedCell}
                activeCells={activeCells}
                wrongCells={wrongDrafts}
                onCellSelect={handleCellSelect}
              />

              {/* Active clue + hint */}
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 glass-card px-3 py-2 space-y-0.5">
                  {cellAcrossClue || cellDownClue ? (
                    <>
                      {cellAcrossClue && (
                        <p
                          className={`text-sm ${
                            direction === 'across'
                              ? 'text-slate-800 dark:text-slate-100'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          <span className="font-bold">{cellAcrossClue.number} Across</span>
                          <span className="mx-1.5 text-slate-400">·</span>
                          {cellAcrossClue.clue}
                        </p>
                      )}
                      {cellDownClue && (
                        <p
                          className={`text-sm ${
                            direction === 'down'
                              ? 'text-slate-800 dark:text-slate-100'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          <span className="font-bold">{cellDownClue.number} Down</span>
                          <span className="mx-1.5 text-slate-400">·</span>
                          {cellDownClue.clue}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted">Tap a cell to start filling the grid.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleHint()}
                  disabled={!selectedCell || submitting || !isCellEditable(selectedCell[0], selectedCell[1])}
                  className="shrink-0 px-3 py-2 rounded-lg text-sm font-bold bg-amber-100/80 text-amber-800 dark:bg-amber-900/35 dark:text-amber-200 disabled:opacity-40 transition-colors hover:bg-amber-100"
                  title={`Reveal the selected letter (${CROSSWORD_HINT_PENALTY} pts)`}
                >
                  💡 Reveal
                </button>
              </div>

              {/* Clue lists */}
              <div className="grid grid-cols-2 gap-3">
                <ClueList
                  title="Across"
                  clues={acrossClues}
                  submissions={submissions}
                  myPlayerId={myPlayerId}
                  activeNumber={activeClue?.direction === 'across' ? activeClue.number : null}
                  onSelect={selectClue}
                />
                <ClueList
                  title="Down"
                  clues={downClues}
                  submissions={submissions}
                  myPlayerId={myPlayerId}
                  activeNumber={activeClue?.direction === 'down' ? activeClue.number : null}
                  onSelect={selectClue}
                />
              </div>
            </>
          ))}

        {/* Live standings */}
        <div className="space-y-2">
          {leaderboard.map((row, i) => {
            const pct = metadata ? playerCompletionPercent(metadata, submissions, row.player_id) : 0
            const color = playerColors[row.player_id] ?? '#94a3b8'
            const timeSecs = getPlayerTimeSpent(
              game,
              submissions,
              row.player_id,
              pct,
              nowMs,
              players.find((p) => p.id === row.player_id)?.joined_at
            )
            return (
              <div
                key={row.player_id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  row.player_id === myPlayerId
                    ? 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
                    : 'border-transparent bg-slate-100/60 dark:bg-slate-900/40'
                }`}
              >
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{row.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {ordinal(i + 1)} of {leaderboard.length} · {row.wordsCompleted} words · {pct}%
                    {game?.session_started_at ? ` · ⏱️ ${formatMinutesSeconds(timeSecs)}` : ''}
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

function ClueList({
  title,
  clues,
  submissions,
  myPlayerId,
  activeNumber,
  onSelect,
}: {
  title: string
  clues: CrosswordClue[]
  submissions: CrosswordSubmission[]
  myPlayerId: string | null
  activeNumber: number | null
  onSelect: (clue: CrosswordClue) => void
}) {
  return (
    <div className="glass-card p-2.5">
      <p className="label-caps text-[10px] mb-1.5">{title}</p>
      <ul className="space-y-0.5 max-h-56 overflow-y-auto">
        {clues.map((clue) => {
          const done = myPlayerId
            ? crosswordWordCells(clue).every(([r, c]) => playerHasSolvedCell(submissions, myPlayerId, r, c))
            : false
          const isActive = clue.number === activeNumber
          return (
            <li key={`${clue.number}-${clue.direction}`}>
              <button
                type="button"
                onClick={() => onSelect(clue)}
                className={[
                  'w-full text-left flex gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors',
                  isActive
                    ? 'bg-indigo-100/80 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100'
                    : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-200',
                  done ? 'line-through opacity-55' : '',
                ].join(' ')}
              >
                <span className="font-bold tabular-nums shrink-0">{clue.number}.</span>
                <span className="min-w-0">{clue.clue}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
