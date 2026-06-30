'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { SudokuBoard } from '@/components/sudoku/SudokuBoard'
import { SudokuPlayerView } from '@/components/sudoku/SudokuPlayerView'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'
import {
  parseSudokuMetadata,
  tallySudokuScores,
  buildCellOwnerGrid,
  buildClaimedValueGrid,
  boardCompletionPercent,
  sudokuPlayerColor,
  SUDOKU_MIN_PLAYERS,
  type SudokuSubmission,
} from '@/lib/sudoku'
import { GAME_SELECT, PLAYER_SELECT, ROUND_SELECT, SUDOKU_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import type { Game, Player } from '@/types'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
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

export function SudokuHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [solution, setSolution] = useState<number[][] | null>(null)
  const [puzzle, setPuzzle] = useState<number[][] | null>(null)
  const [submissions, setSubmissions] = useState<SudokuSubmission[]>([])
  const [playingAgain, setPlayingAgain] = useState(false)
  const [starting, setStarting] = useState(false)

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
        if (meta) setPuzzle(meta.puzzle)
        setRoundId(roundData.id as string)

        const { data: sol } = await supabase.rpc('sudoku_host_solution', {
          p_game_id: gameCode,
          p_host_token: hostToken,
        })
        if (Array.isArray(sol)) setSolution(sol as number[][])

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
  }, [gameCode, hostToken])

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
    if (game?.status === 'active') setTab('play')
    else if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  const handlePlayerRemoved = useCallback((playerId: string) => {
    setPlayers((prev) => prev.filter((p) => p.id !== playerId))
  }, [])
  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

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

  async function handlePlayAgain() {
    if (playingAgain) return
    setPlayingAgain(true)
    await fetch(`/api/games/${gameCode}/play-again`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined }),
    })
    clearPlayerSession(gameCode)
    setHostPlayerId(null)
    setHostPlayerName('')
    setHostJoinName('')
    setTab('manage')
    setPlayingAgain(false)
  }

  const activePlayers = useMemo(() => players.filter((p) => p.spectator !== true), [players])
  const cellOwners = useMemo(() => buildCellOwnerGrid(submissions), [submissions])
  const claimedGrid = useMemo(() => (puzzle ? buildClaimedValueGrid(puzzle, submissions) : null), [puzzle, submissions])
  const playerColors = useMemo(() => {
    const map: Record<string, string> = {}
    activePlayers.forEach((p, i) => {
      map[p.id] = sudokuPlayerColor(i)
    })
    return map
  }, [activePlayers])

  const leaderboard = tallySudokuScores(submissions, players)
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const boardCompletion = puzzle ? boardCompletionPercent(puzzle, cellOwners) : 0

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  const interactivePlay = <SudokuPlayerView gameCode={gameCode} />

  const watchBoard = (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Puzzle progress</p>
        <p className="text-2xl font-black">{boardCompletion}%</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {puzzle && (
          <SudokuBoard
            puzzle={puzzle}
            solution={solution ?? undefined}
            userGrid={claimedGrid ?? undefined}
            cellOwners={cellOwners}
            playerColors={playerColors}
            completionPercent={boardCompletion}
            readOnly
          />
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
    </div>
  )

  const manage = (
    <HostManageSection
      game={game}
      players={players}
      highlightPlayerId={hostPlayerId}
      removingPlayerId={removingPlayerId}
      onRemovePlayer={removePlayer}
      gameType="sudoku"
      top={
        game.status === 'waiting' ? (
          <HostModeSelector
            mode={hostMode}
            onChange={changeHostMode}
            joinedPlayerId={hostPlayerId}
            joinedPlayerName={hostPlayerName}
            joinName={hostJoinName}
            onJoinNameChange={setHostJoinName}
            onJoin={() => void hostJoinGame()}
            joining={hostJoining}
            spectatorHint="Watch the puzzle from the Watch tab"
          />
        ) : undefined
      }
      footer={
        game.status === 'waiting' ? (
          <HostLobbyWaitingFooter
            gameCode={gameCode}
            hostToken={hostToken}
            onStart={() => void handleStart()}
            onEnded={load}
            canStart={activePlayers.length >= SUDOKU_MIN_PLAYERS}
            starting={starting}
            startLabel="Start puzzle"
            startDisabledHint={
              activePlayers.length >= SUDOKU_MIN_PLAYERS ? null : `Need at least ${SUDOKU_MIN_PLAYERS} players to start`
            }
            className="space-y-3"
          />
        ) : game.status === 'active' ? (
          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={load}
            label="End game"
            icon={<ExitIcon size={16} />}
            confirmTitle="End this game?"
            confirmMessage="Players will see the final results."
            className="btn-danger-soft"
          />
        ) : null
      }
    />
  )

  return (
    <HostGameLayout
      gameCode={gameCode}
      status={game.status}
      tab={tab}
      onTabChange={setTab}
      primaryKind={primaryKind}
      showTabs={showTabs}
      gameStarted={gameStarted}
      header={<HostGameHeader game={game} />}
      primary={hostPlays ? interactivePlay : watchBoard}
      manage={manage}
      finished={
        <>
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
        </>
      }
    />
  )
}
