'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { CrosswordBoard, crosswordPlayerColor } from '@/components/crossword/CrosswordBoard'
import { CrosswordGameTimerBar } from '@/components/crossword/CrosswordGameTimerBar'
import { CrosswordPlayerView } from '@/components/crossword/CrosswordPlayerView'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostSudokuLobbyPanel } from '@/components/host-lobby/HostSudokuLobbyPanel'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'
import {
  parseCrosswordMetadata,
  tallyCrosswordScores,
  buildCellOwnerGrid,
  buildPlayerLetterGrid,
  buildPlayerSolvedGrid,
  fillableCellCount,
  playerCompletionPercent,
  CROSSWORD_MIN_PLAYERS,
  CROSSWORD_GAME_DURATION_OPTIONS,
  formatCrosswordGameDuration,
  type CrosswordMetadata,
  type CrosswordSubmission,
} from '@/lib/crossword'
import { getPlayerTimeSpent } from '@/lib/sudoku'
import { GAME_SELECT, PLAYER_SELECT, ROUND_SELECT, CROSSWORD_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import { formatMinutesSeconds } from '@/lib/timer-format'
import type { Game, Player } from '@/types'
import { useGameRosterPoll } from '@/hooks/useGameRosterPoll'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostPlayerReconciliation } from '@/hooks/useHostPlayerReconciliation'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'

type CrosswordHostMode = 'spectator' | 'player'
type HostTab = 'manage' | 'play'

const HOST_MODE_KEY = (code: string) => `crossword_host_mode_${code.toUpperCase()}`

function getCrosswordHostMode(gameCode: string): CrosswordHostMode {
  if (typeof window === 'undefined') return 'player'
  return (localStorage.getItem(HOST_MODE_KEY(gameCode)) as CrosswordHostMode) ?? 'player'
}
function setCrosswordHostMode(gameCode: string, mode: CrosswordHostMode) {
  localStorage.setItem(HOST_MODE_KEY(gameCode), mode)
}

function emptyLetters(size: number): string[][] {
  return Array.from({ length: size }, () => Array(size).fill(''))
}

export function CrosswordHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError } = useToast()
  const { confirm } = useConfirm()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<CrosswordMetadata | null>(null)
  const [submissions, setSubmissions] = useState<CrosswordSubmission[]>([])
  const [playingAgain, setPlayingAgain] = useState(false)
  const [starting, setStarting] = useState(false)

  const [hostMode, setHostModeState] = useState<CrosswordHostMode>('player')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')
  const [nowMs, setNowMs] = useState<number>(Date.now())

  useEffect(() => {
    if (game?.status === 'active') {
      const interval = setInterval(() => setNowMs(Date.now()), 1000)
      return () => clearInterval(interval)
    }
  }, [game?.status])

  useTurnNotifications({ status: game?.status })

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
        const meta = parseCrosswordMetadata((roundData as Record<string, unknown>).crossword_metadata)
        if (meta) setMetadata(meta)
        setRoundId(roundData.id as string)

        const { data: subs } = await supabase
          .from('crossword_submissions')
          .select(CROSSWORD_SUBMISSION_SELECT)
          .eq('round_id', roundData.id)
        setSubmissions((subs ?? []) as CrosswordSubmission[])
      }
    } else if (gameData.status === 'finished') {
      const { data: subs } = await supabase
        .from('crossword_submissions')
        .select(CROSSWORD_SUBMISSION_SELECT)
        .eq('game_id', gameCode)
      setSubmissions((subs ?? []) as CrosswordSubmission[])
    }
  }, [gameCode])

  useEffect(() => {
    load()
    setHostModeState(getCrosswordHostMode(gameCode))
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

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      if (playerId === hostPlayerId) {
        clearPlayerSession(gameCode)
        setHostPlayerId(null)
        setHostPlayerName('')
      }
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [gameCode, hostPlayerId]
  )
  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  useHostPlayerReconciliation(players, hostPlayerId, () => handlePlayerRemoved(hostPlayerId!))
  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)
  useGameRosterPoll(gameCode, game?.status, { setGame, setPlayers, reload: load })

  useEffect(() => {
    const ch = supabase
      .channel(`crossword_host_game_${gameCode}`)
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
      .channel(`crossword_host_subs_${roundId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'crossword_submissions', filter: `round_id=eq.${roundId}` },
        (payload) => {
          setSubmissions((prev) => {
            const next = payload.new as CrosswordSubmission
            return prev.some((s) => s.id === next.id) ? prev : [...prev, next]
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
      .channel(`crossword_host_players_${gameCode}`)
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

  const changeHostMode = async (mode: CrosswordHostMode) => {
    if (game?.status !== 'waiting') return
    const prev = hostMode
    setHostModeState(mode)
    setCrosswordHostMode(gameCode, mode)
    if (mode === 'spectator') setTab('manage')
    if (mode === 'spectator' && prev === 'player' && hostPlayerId) {
      try {
        const res = await fetch('/api/players', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameCode, playerId: hostPlayerId, hostToken }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? 'Failed to leave seat')
        }
        handlePlayerRemoved(hostPlayerId)
        await load()
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Failed to leave seat')
      }
    }
  }

  const renameHost = async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || !hostPlayerId) return
    try {
      const res = await fetch('/api/players', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerId: hostPlayerId, playerName: trimmed, hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update name')
      setHostPlayerName(data.playerName)
      const stored = getPlayerSession(gameCode)
      setPlayerSession(
        gameCode,
        hostPlayerId,
        data.playerName,
        stored?.playerGender ?? 'both',
        stored?.resumeToken ?? null
      )
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to update name')
    }
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

  async function resetGame(sameSettings: boolean) {
    if (playingAgain) return
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined, same_settings: sameSettings }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toastError(d.error || 'Failed to reset')
        return
      }
      // Return to lobby keeps the host seated: the play-again route re-seats the passed
      // hostPlayerId (resetSpectatorsForLobby(..., [hostPlayerId])), so clearing the local
      // session here would strand the host — their row stays in the roster while the UI
      // wrongly shows the "enter your name to join" form. Keep the session; the host can
      // leave the seat deliberately with the Host/Play toggle if they want to.
      if (!sameSettings) {
        setHostJoinName('')
      }
      setTab('manage')
      await load()
    } finally {
      setPlayingAgain(false)
    }
  }

  const confirmPlayAgain = async () => {
    const ok = await confirm({
      title: 'Play again — same settings?',
      message:
        'Reopens the game with the same settings. Previous watchers and new people can join; everyone taps “ready” and you start the next game once enough players are in.',
      confirmLabel: 'Play again',
    })
    if (ok) void resetGame(true)
  }

  const confirmReturnToLobby = async () => {
    const ok = await confirm({
      title: 'Return to lobby?',
      message:
        'Sends everyone back to the game lobby where you can tweak settings or let new people join before starting again.',
      confirmLabel: 'Return to lobby',
    })
    if (ok) void resetGame(false)
  }

  const activePlayers = useMemo(() => players.filter((p) => p.spectator !== true), [players])
  const cellOwners = useMemo(() => (metadata ? buildCellOwnerGrid(metadata, submissions) : []), [metadata, submissions])
  const playerColors = useMemo(() => {
    const map: Record<string, string> = {}
    activePlayers.forEach((p, i) => {
      map[p.id] = crosswordPlayerColor(i)
    })
    return map
  }, [activePlayers])

  const leaderboard = metadata ? tallyCrosswordScores(metadata, submissions, players) : []
  const hostRow = leaderboard.find((row) => row.player_id === hostPlayerId)
  const hostWon =
    !!hostRow &&
    leaderboard.length > 1 &&
    leaderboard[0] != null &&
    hostRow.points === leaderboard[0].points &&
    leaderboard[0].points > 0
  const hostPlays = hostMode === 'player' && !!hostPlayerId

  // When the host is only watching, they view one player's board (switchable), with that
  // player's own letters — not an aggregate ownership grid.
  const [watchedPlayerId, setWatchedPlayerId] = useState<string | null>(null)
  const effectiveWatchedId =
    (watchedPlayerId && activePlayers.some((p) => p.id === watchedPlayerId) ? watchedPlayerId : null) ??
    leaderboard.find((row) => activePlayers.some((p) => p.id === row.player_id))?.player_id ??
    activePlayers[0]?.id ??
    null
  const watchedName = players.find((p) => p.id === effectiveWatchedId)?.name ?? 'a player'
  const watchedLetterGrid = useMemo(
    () =>
      metadata && effectiveWatchedId
        ? buildPlayerLetterGrid(metadata, submissions, effectiveWatchedId, emptyLetters(metadata.size))
        : metadata
          ? emptyLetters(metadata.size)
          : [],
    [metadata, submissions, effectiveWatchedId]
  )
  const watchedSolvedCells = useMemo(
    () =>
      metadata && effectiveWatchedId ? buildPlayerSolvedGrid(metadata, submissions, effectiveWatchedId) : undefined,
    [metadata, submissions, effectiveWatchedId]
  )

  const boardCompletion = useMemo(() => {
    if (!metadata) return 0
    const fillable = fillableCellCount(metadata)
    if (fillable === 0) return 0
    let owned = 0
    for (let r = 0; r < metadata.size; r++) {
      for (let c = 0; c < metadata.size; c++) {
        if (cellOwners[r]?.[c]) owned++
      }
    }
    return Math.round((owned / fillable) * 100)
  }, [metadata, cellOwners])

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

  const interactivePlay = <CrosswordPlayerView gameCode={gameCode} />

  const watchBoard = (
    <div className="space-y-6">
      <CrosswordGameTimerBar gameCode={gameCode} game={game} />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Puzzle progress</p>
        <p className="text-2xl font-black">{boardCompletion}%</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {metadata && (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              Watching <span className="font-semibold text-[var(--foreground)]">{watchedName}</span>&apos;s board
            </p>
            <CrosswordBoard
              metadata={metadata}
              letterGrid={watchedLetterGrid}
              mySolvedCells={watchedSolvedCells}
              myPlayerId={effectiveWatchedId}
              playerColors={playerColors}
              readOnly
            />
          </div>
        )}

        <div className="space-y-3">
          <p className="label-caps text-xs">Live scores — tap to watch</p>
          {leaderboard.map((row, i) => {
            const pct = metadata ? playerCompletionPercent(metadata, submissions, row.player_id) : 0
            const timeSecs = getPlayerTimeSpent(
              game,
              submissions,
              row.player_id,
              pct,
              nowMs,
              players.find((p) => p.id === row.player_id)?.joined_at
            )
            return (
              <button
                key={row.player_id}
                type="button"
                onClick={() => setWatchedPlayerId(row.player_id)}
                className={`w-full text-left glass-card px-3 py-2.5 flex items-center justify-between gap-4 transition ${
                  effectiveWatchedId === row.player_id ? 'ring-2 ring-[var(--accent,#0ea5e9)]' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold truncate block">
                    {i + 1}. {row.name}
                  </span>
                  <span className="text-xs text-muted block">
                    {row.wordsCompleted} words · {pct}% · ⏱️ {formatMinutesSeconds(timeSecs)}
                  </span>
                </div>
                <span className="text-sm font-bold shrink-0">{row.points} pts</span>
              </button>
            )
          })}
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
      gameType="crossword"
      top={
        game.status === 'waiting' ? (
          <HostModeSelector
            mode={hostMode}
            onChange={changeHostMode}
            onEditName={renameHost}
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
      settings={
        game.status === 'waiting' ? (
          <HostSudokuLobbyPanel
            gameCode={gameCode}
            hostToken={hostToken}
            game={game}
            playerCount={players.length}
            onGameUpdate={setGame}
            durationChoices={CROSSWORD_GAME_DURATION_OPTIONS}
            formatDuration={formatCrosswordGameDuration}
          />
        ) : (
          <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
        )
      }
      footer={
        game.status === 'waiting' ? (
          <HostLobbyWaitingFooter
            gameCode={gameCode}
            hostToken={hostToken}
            game={game ?? undefined}
            onGameUpdate={setGame}
            onStart={() => void handleStart()}
            onEnded={load}
            canStart={activePlayers.length >= CROSSWORD_MIN_PLAYERS}
            starting={starting}
            startLabel="Start puzzle"
            startDisabledHint={
              activePlayers.length >= CROSSWORD_MIN_PLAYERS
                ? null
                : `Need at least ${CROSSWORD_MIN_PLAYERS} player${CROSSWORD_MIN_PLAYERS === 1 ? '' : 's'} to start`
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

  if (game.status === 'waiting' && game.replay_pending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-3 py-8 text-[var(--foreground)]">
        <ReplayReadyRing
          players={players}
          meId={hostPlayerId}
          isHost
          gameCode={gameCode}
          hostToken={hostToken}
          minPlayers={CROSSWORD_MIN_PLAYERS}
          onToggleReady={() => {}}
          onStart={() => void handleStart()}
          starting={starting}
        />
        <button
          type="button"
          onClick={() => void confirmReturnToLobby()}
          disabled={playingAgain}
          className="mt-1 py-2 text-sm font-medium text-muted transition-colors hover:text-body disabled:opacity-60"
        >
          Return to lobby instead
        </button>
      </div>
    )
  }

  return (
    <HostGameLayout
      gameCode={gameCode}
      status={game.status}
      tab={tab}
      onTabChange={setTab}
      primaryKind={primaryKind}
      game={game}
      players={players}
      hostPlayerId={hostPlayerId}
      onHostRejoined={load}
      showTabs={showTabs}
      gameStarted={gameStarted}
      header={<HostGameHeader game={game} />}
      primary={hostPlays ? interactivePlay : watchBoard}
      manage={manage}
      finished={
        <>
          <FinishedWinnerHero winnerName={leaderboard[0]?.name} game={game} />
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
            scoreLabel={(n) => `${n} pts`}
            emphasizeLeader
          />
          <button
            type="button"
            onClick={() => void confirmPlayAgain()}
            disabled={playingAgain}
            className="btn-secondary w-full py-3 text-base font-bold disabled:opacity-60"
          >
            {playingAgain ? 'Starting…' : '↻ Play again · same settings'}
          </button>
          <button
            type="button"
            onClick={() => void confirmReturnToLobby()}
            disabled={playingAgain}
            className="w-full py-2.5 text-sm font-semibold text-muted transition-colors hover:text-body disabled:opacity-60"
          >
            Return to lobby
          </button>
          <p className="text-center text-xs text-faint leading-relaxed px-2">
            Same settings reopens the game for ready-up — watchers and new people can join · lobby lets you tweak
            settings first.
          </p>
          {hostWon && (
            <PostWinToCommunity
              gameType="crossword"
              gameCode={gameCode}
              winnerName={hostRow?.name ?? ''}
              roundKey={game?.session_started_at ?? undefined}
            />
          )}
        </>
      }
    />
  )
}
