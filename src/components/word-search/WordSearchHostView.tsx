'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { WordSearchBoard, wordSearchPlayerColor } from '@/components/word-search/WordSearchBoard'
import { WordSearchGameTimerBar } from '@/components/word-search/WordSearchGameTimerBar'
import { WordSearchPlayerView } from '@/components/word-search/WordSearchPlayerView'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { FinalResultsShareBlock } from '@/components/FinalResultsShareBlock'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostSudokuLobbyPanel } from '@/components/host-lobby/HostSudokuLobbyPanel'
import { HostPuzzleSettings } from '@/components/host-lobby/HostPuzzleSettings'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { TransferHostControl } from '@/components/TransferHostControl'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { gameTypeConfig } from '@/lib/game-types'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { HostActiveSettings } from '@/components/host/HostActiveSettings'
import { HostLeaveSeatButton } from '@/components/host/HostLeaveSeatButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
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
import { formatMinutesSeconds } from '@/lib/timer-format'
import type { Game, Player } from '@/types'
import { useGameRosterPoll } from '@/hooks/useGameRosterPoll'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostSeat } from '@/hooks/useHostSeat'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'

const WORD_SEARCH_FOUND_SELECT =
  'id,game_id,round_id,player_id,word,start_row,start_col,end_row,end_col,via_hint,found_at'

type HostTab = 'manage' | 'play'

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
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<WordSearchMetadata | null>(null)
  const [found, setFound] = useState<WordSearchFound[]>([])
  const [playingAgain, setPlayingAgain] = useState(false)
  const [starting, setStarting] = useState(false)
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

  const {
    hostMode,
    hostPlayerId,
    hostResumeToken,
    hostPlayerName,
    hostJoinName,
    setHostJoinName,
    hostJoining,
    changeHostMode,
    hostJoinGame,
    leaveSeatKeepHosting,
    renameHost,
    handlePlayerRemoved: onHostSeatRemoved,
  } = useHostSeat({
    gameCode,
    hostToken,
    gameStatus: game?.status,
    players,
    onReload: load,
    toast: { success, error: toastError },
    onModeChange: (mode) => {
      if (mode === 'spectator') setTab('manage')
    },
  })

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      onHostSeatRemoved(playerId)
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [onHostSeatRemoved]
  )
  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

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
    // Many players ⇒ a found-word INSERT per player per word. Applying each as its own setState
    // re-renders the whole host board per event. Buffer and flush in one update a few times a second.
    const pending: WordSearchFound[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    const flush = () => {
      flushTimer = null
      if (pending.length === 0) return
      const batch = pending.splice(0, pending.length)
      setFound((prev) => {
        const ids = new Set(prev.map((f) => f.id))
        const add = batch.filter((r) => (ids.has(r.id) ? false : (ids.add(r.id), true)))
        return add.length ? [...prev, ...add] : prev
      })
    }
    const ch = supabase
      .channel(`word_search_host_found_${roundId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'word_search_found', filter: `round_id=eq.${roundId}` },
        (payload) => {
          pending.push(payload.new as WordSearchFound)
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

  // Host controls for the active room live in the main-header ⚙ gear (no Manage tab —
  // gameplay is the body, roster + Remove in the drawer): late-join rules + How-to-play
  // + End game.
  const hostSettingsNode = useMemo(
    () =>
      game?.status === 'active' ? (
        <HostActiveSettings
          gameCode={gameCode}
          hostToken={hostToken}
          gameType="word_search"
          onEnded={load}
          endGameConfirmMessage="Players will see the final results."
        >
          <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
          {hostMode === 'player' && !!hostPlayerId && (
            <HostLeaveSeatButton onLeave={leaveSeatKeepHosting} className="btn-secondary w-full py-3 text-base" />
          )}
        </HostActiveSettings>
      ) : null,
    [game, gameCode, hostToken, load, setGame, hostMode, hostPlayerId, leaveSeatKeepHosting]
  )
  useRegisterGameSettings(hostSettingsNode)

  if (!game) {
    return <HostLobbySkeleton />
  }

  const cfg = gameTypeConfig('word_search')

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
          capacityGame={game}
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

  // Fresh lobby (not the play-again ready-up flow, handled above).
  const waitingLobby = game.status === 'waiting' && !game.replay_pending
  const canStart = activePlayers.length >= WORD_SEARCH_MIN_PLAYERS

  const lobbyModeCard = (
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
      spectatorHint="Watch the puzzle once it starts"
      playerHint="Find words with everyone"
    />
  )

  const lobbySettings = (
    <>
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
      <TransferHostControl triggerClassName="btn-secondary w-full flex items-center justify-center gap-2" />
    </>
  )

  if (waitingLobby) {
    return (
      <HostLobby
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        gameTypeLabel={cfg.label}
        resumeToken={hostResumeToken}
        players={players}
        maxPlayers={lobbyMaxPlayersFromGameClient('word_search', game) ?? game.max_players}
        playCard={lobbyModeCard}
        settingsChildren={lobbySettings}
        onStart={() => void handleStart()}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={
          canStart
            ? null
            : `Need at least ${WORD_SEARCH_MIN_PLAYERS} player${WORD_SEARCH_MIN_PLAYERS === 1 ? '' : 's'} to start`
        }
        startLabel="Start hunt"
        onRemovePlayer={removePlayer}
        removingPlayerId={removingPlayerId}
        highlightPlayerId={hostPlayerId}
        onEnded={load}
      />
    )
  }

  return (
    <HostGameLayout
      onRemovePlayer={removePlayer}
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
      noManageTab
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
