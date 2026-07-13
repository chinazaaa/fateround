'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { WordSearchBoard, wordSearchPlayerColor } from '@/components/word-search/WordSearchBoard'
import { WordSearchGameTimerBar } from '@/components/word-search/WordSearchGameTimerBar'
import { WordSearchPlayerView } from '@/components/word-search/WordSearchPlayerView'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostSudokuLobbyPanel } from '@/components/host-lobby/HostSudokuLobbyPanel'
import { HostPuzzleSettings } from '@/components/host-lobby/HostPuzzleSettings'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'
import {
  parseWordSearchMetadata,
  buildFoundOwnerGrid,
  buildPlayerFoundCells,
  placementCells,
  tallyWordSearchScores,
  wordSearchCompletionPercent,
  WORD_SEARCH_MIN_PLAYERS,
  WORD_SEARCH_GAME_DURATION_OPTIONS,
  formatWordSearchGameDuration,
  type WordSearchMetadata,
  type WordSearchFound,
  type WordSearchPlacement,
} from '@/lib/word-search'
import { getPlayerTimeSpent } from '@/lib/sudoku'
import { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
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

const WORD_SEARCH_FOUND_SELECT =
  'id,game_id,round_id,player_id,word,start_row,start_col,end_row,end_col,via_hint,found_at'

type WordSearchHostMode = 'spectator' | 'player'
type HostTab = 'manage' | 'play'

const HOST_MODE_KEY = (code: string) => `word_search_host_mode_${code.toUpperCase()}`

function getWordSearchHostMode(gameCode: string): WordSearchHostMode {
  if (typeof window === 'undefined') return 'player'
  return (localStorage.getItem(HOST_MODE_KEY(gameCode)) as WordSearchHostMode) ?? 'player'
}
function setWordSearchHostMode(gameCode: string, mode: WordSearchHostMode) {
  localStorage.setItem(HOST_MODE_KEY(gameCode), mode)
}

/** Adapt found rows to the shape getPlayerTimeSpent expects (last find = finish time). */
function foundAsTimeRows(found: WordSearchFound[]) {
  return found.map((f) => ({
    player_id: f.player_id,
    is_correct: true,
    cell_row: 0,
    cell_col: 0,
    submitted_at: f.found_at,
  }))
}

export function WordSearchHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError } = useToast()
  const { confirm } = useConfirm()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<WordSearchMetadata | null>(null)
  const [found, setFound] = useState<WordSearchFound[]>([])
  const [playingAgain, setPlayingAgain] = useState(false)
  const [starting, setStarting] = useState(false)

  const [hostMode, setHostModeState] = useState<WordSearchHostMode>('player')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')
  const [nowMs, setNowMs] = useState<number>(Date.now())
  const [placements, setPlacements] = useState<WordSearchPlacement[] | null>(null)

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
        .select('id, word_search_metadata')
        .eq('game_id', gameCode)
        .eq('round_number', 1)
        .maybeSingle()
      if (roundData) {
        const meta = parseWordSearchMetadata((roundData as Record<string, unknown>).word_search_metadata)
        if (meta) setMetadata(meta)
        setRoundId(roundData.id as string)

        const { data: rows } = await supabase
          .from('word_search_found')
          .select(WORD_SEARCH_FOUND_SELECT)
          .eq('round_id', roundData.id)
        setFound((rows ?? []) as WordSearchFound[])
      }
    } else if (gameData.status === 'finished') {
      // Load the round metadata too, not just the finds — on a refresh of the finished
      // screen without it, `metadata` stays null and the leaderboard (and answer key) go
      // blank because tallyWordSearchScores can't run.
      const { data: roundData } = await supabase
        .from('rounds')
        .select('id, word_search_metadata')
        .eq('game_id', gameCode)
        .eq('round_number', 1)
        .maybeSingle()
      if (roundData) {
        const meta = parseWordSearchMetadata((roundData as Record<string, unknown>).word_search_metadata)
        if (meta) setMetadata(meta)
        setRoundId(roundData.id as string)
      }
      const { data: rows } = await supabase
        .from('word_search_found')
        .select(WORD_SEARCH_FOUND_SELECT)
        .eq('game_id', gameCode)
      setFound((rows ?? []) as WordSearchFound[])
    }
  }, [gameCode])

  useEffect(() => {
    load()
    setHostModeState(getWordSearchHostMode(gameCode))
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

  // A replay reuses this view with a fresh round — drop the previous game's word placements so
  // the finish screen refetches the new puzzle's answer key instead of highlighting stale
  // positions over the new grid.
  useEffect(() => {
    setPlacements(null)
  }, [roundId])

  // Pull the answer key once the game is finished, so it can show below the leaderboard.
  useEffect(() => {
    if (game?.status !== 'finished' || placements) return
    let cancelled = false
    fetch(`/api/word-search/solution?gameId=${gameCode.toUpperCase()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && Array.isArray(j?.placements)) setPlacements(j.placements as WordSearchPlacement[])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [game?.status, placements, gameCode])

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

  // Latest committed status, read by the games channel without resubscribing.
  const gameStatusRef = useRef(game?.status)
  gameStatusRef.current = game?.status
  useEffect(() => {
    const ch = supabase
      .channel(`word_search_host_game_${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          const next = payload.new as Game
          setGame(next)
          // Reload only on a status flip; finish writes the games row several times and
          // reloading on each replayed the finish cascade (the host's "glitches several times").
          if (next.status !== gameStatusRef.current) load()
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
      .channel(`word_search_host_found_${roundId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'word_search_found', filter: `round_id=eq.${roundId}` },
        (payload) => {
          setFound((prev) => {
            const next = payload.new as WordSearchFound
            return prev.some((f) => f.id === next.id) ? prev : [...prev, next]
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
      .channel(`word_search_host_players_${gameCode}`)
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

  const changeHostMode = async (mode: WordSearchHostMode) => {
    if (game?.status !== 'waiting') return
    const prev = hostMode
    setHostModeState(mode)
    setWordSearchHostMode(gameCode, mode)
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
  const cellOwners = useMemo(() => (metadata ? buildFoundOwnerGrid(metadata, found) : []), [metadata, found])
  const playerColors = useMemo(() => {
    const map: Record<string, string> = {}
    activePlayers.forEach((p, i) => {
      map[p.id] = wordSearchPlayerColor(i)
    })
    return map
  }, [activePlayers])

  const leaderboard = useMemo(
    () => (metadata ? tallyWordSearchScores(metadata, found, players) : []),
    [metadata, found, players]
  )
  const hostRow = leaderboard.find((row) => row.player_id === hostPlayerId)
  const hostWon =
    !!hostRow &&
    leaderboard.length > 1 &&
    leaderboard[0] != null &&
    hostRow === leaderboard[0] &&
    leaderboard[0].points > 0
  const hostPlays = hostMode === 'player' && !!hostPlayerId

  // When the host is only watching, they view one player's board (switchable), not an aggregate.
  const [watchedPlayerId, setWatchedPlayerId] = useState<string | null>(null)
  const effectiveWatchedId =
    (watchedPlayerId && activePlayers.some((p) => p.id === watchedPlayerId) ? watchedPlayerId : null) ??
    leaderboard.find((row) => activePlayers.some((p) => p.id === row.player_id))?.player_id ??
    activePlayers[0]?.id ??
    null
  const watchedName = players.find((p) => p.id === effectiveWatchedId)?.name ?? 'a player'
  const watchedFoundCells = useMemo(
    () => (metadata && effectiveWatchedId ? buildPlayerFoundCells(metadata, found, effectiveWatchedId) : undefined),
    [metadata, found, effectiveWatchedId]
  )

  const boardCompletion = useMemo(() => {
    if (!metadata || metadata.words.length === 0) return 0
    const foundWords = new Set(found.map((f) => f.word))
    return Math.round((foundWords.size / metadata.words.length) * 100)
  }, [metadata, found])

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

  const interactivePlay = <WordSearchPlayerView gameCode={gameCode} />

  const watchBoard = (
    <div className="space-y-6">
      <WordSearchGameTimerBar gameCode={gameCode} game={game} onExpired={load} />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Words found</p>
        <p className="text-2xl font-black">{boardCompletion}%</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {metadata && (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              Watching <span className="font-semibold text-[var(--foreground)]">{watchedName}</span>&apos;s board
            </p>
            <WordSearchBoard
              metadata={metadata}
              myFoundCells={watchedFoundCells}
              myPlayerId={effectiveWatchedId}
              playerColors={playerColors}
              readOnly
            />
          </div>
        )}

        <div className="space-y-3">
          <p className="label-caps text-xs">Live scores — tap to watch</p>
          {leaderboard.map((row, i) => {
            const pct = metadata ? wordSearchCompletionPercent(metadata, found, row.player_id) : 0
            const timeSecs = getPlayerTimeSpent(
              game,
              foundAsTimeRows(found),
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
                  effectiveWatchedId === row.player_id ? 'ring-2 ring-[var(--accent,#8b5cf6)]' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold truncate block">
                    {i + 1}. {row.name}
                  </span>
                  <span className="text-xs text-muted block">
                    {row.wordsFound} words · {pct}% · ⏱️ {formatMinutesSeconds(timeSecs)}
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
      gameType="word_search"
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
            spectatorHint="Watch the hunt from the Watch tab"
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
            durationChoices={WORD_SEARCH_GAME_DURATION_OPTIONS}
            formatDuration={formatWordSearchGameDuration}
            puzzleSettings={
              <HostPuzzleSettings
                gameCode={gameCode}
                hostToken={hostToken}
                game={game}
                onGameUpdate={setGame}
                kind="word_search"
              />
            }
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
            canStart={activePlayers.length >= WORD_SEARCH_MIN_PLAYERS}
            starting={starting}
            startLabel="Start hunt"
            startDisabledHint={
              activePlayers.length >= WORD_SEARCH_MIN_PLAYERS
                ? null
                : `Need at least ${WORD_SEARCH_MIN_PLAYERS} player${WORD_SEARCH_MIN_PLAYERS === 1 ? '' : 's'} to start`
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
          minPlayers={WORD_SEARCH_MIN_PLAYERS}
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
          <FinalResultsShareBlock
            game={game}
            participants={[]}
            votes={[]}
            rounds={[]}
            players={players}
            playAgainButton={
              <button
                type="button"
                onClick={() => void confirmPlayAgain()}
                disabled={playingAgain}
                className="btn-secondary w-full py-3 text-base font-bold disabled:opacity-60"
              >
                {playingAgain ? 'Starting…' : '↻ Play again · same settings'}
              </button>
            }
          >
            <FinishedWinnerHero winnerName={leaderboard[0]?.name} game={game} />
            <PaginatedLeaderboard
              title="Final leaderboard"
              rows={leaderboard.map((row, i) => {
                const pct = metadata ? wordSearchCompletionPercent(metadata, found, row.player_id) : 0
                const timeSecs = getPlayerTimeSpent(
                  game,
                  foundAsTimeRows(found),
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
          </FinalResultsShareBlock>
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
              gameType="word_search"
              gameCode={gameCode}
              winnerName={hostRow?.name ?? ''}
              roundKey={game?.session_started_at ?? undefined}
            />
          )}
          {placements && metadata && (
            <div className="glass-card p-4 space-y-3">
              <p className="label-caps text-xs">Answer key</p>
              <WordSearchBoard
                metadata={metadata}
                readOnly
                myFoundCells={(() => {
                  const g = metadata.grid.map((row) => row.map(() => false))
                  for (const p of placements) {
                    for (const [r, c] of placementCells(p)) {
                      if (g[r]) g[r][c] = true
                    }
                  }
                  return g
                })()}
                myColor="#8b5cf6"
              />
              <div className="flex flex-wrap gap-1.5">
                {placements.map((p) => (
                  <span
                    key={p.word}
                    className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-muted"
                  >
                    {p.word}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      }
    />
  )
}
