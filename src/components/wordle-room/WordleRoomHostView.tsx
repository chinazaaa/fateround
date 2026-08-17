'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { HostActiveSettings } from '@/components/host/HostActiveSettings'
import { HostLeaveSeatButton } from '@/components/host/HostLeaveSeatButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { ExitIcon } from '@/components/host/host-icons'
import { HostWordleRoomLobbyPanel } from '@/components/host-lobby/HostWordleRoomLobbyPanel'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { TransferHostControl } from '@/components/TransferHostControl'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { gameTypeConfig } from '@/lib/game-types'
import { WordleRoomPlayerView } from '@/components/wordle-room/WordleRoomPlayerView'
import { WordleRoomResults } from '@/components/wordle-room/WordleRoomResults'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import {
  tallyWordleRoomScores,
  WORDLE_ROOM_MIN_PLAYERS,
  type WordleRoomProgressRow,
  type WordleRoomStandingRow,
} from '@/lib/wordle-room'
import { useWordleRoomGameTimer } from '@/hooks/useWordleRoomGameTimer'
import { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import type { Game, Player } from '@/types'
import { useGameRosterPoll } from '@/hooks/useGameRosterPoll'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useGameScores, useGameStats } from '@/components/roster/RosterDrawerContext'
import { useHostSeat } from '@/hooks/useHostSeat'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useToast } from '@/components/ui/Toast'

type HostTab = 'manage' | 'play'

interface WordleRoomStatus {
  currentWord?: string
  wordLength?: number
  maxAttempts?: number
  wordIndex?: number
  wordCount?: number
  categoryLabel?: string
  timeRemainingMs?: number | null
}

export function WordleRoomHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [progressRows, setProgressRows] = useState<WordleRoomProgressRow[]>([])
  const [playingAgain, setPlayingAgain] = useState(false)
  const [starting, setStarting] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')
  const [hostWord, setHostWord] = useState<WordleRoomStatus | null>(null)

  useTurnNotifications({ status: game?.status })

  const load = useCallback(async () => {
    const [{ data: gameData }, { data: playersData }] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])

    if (!gameData) return
    setGame(gameData as Game)
    setPlayers((playersData ?? []) as Player[])

    if (gameData.status === 'active' || gameData.status === 'finished') {
      const { data: roundData } = await supabase
        .from('rounds')
        .select('id')
        .eq('game_id', gameCode)
        .eq('round_number', 1)
        .maybeSingle()
      if (roundData) {
        setRoundId(roundData.id as string)
        const { data: progress } = await supabase
          .from('wordle_room_progress')
          .select('*')
          .eq('game_id', gameCode)
          .eq('round_id', roundData.id)
        setProgressRows((progress ?? []) as WordleRoomProgressRow[])
      }
    }
  }, [gameCode])

  const { label: timeLabel, timeUp, secondsLeft } = useWordleRoomGameTimer(gameCode, game, load)

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
      setHostJoinName('')
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [onHostSeatRemoved, setHostJoinName]
  )

  const { removingPlayerId, removePlayer } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  // Reveal the shared current word to the host (the sequence itself stays hidden — this
  // just fetches the live word via the same authenticated route the players use).
  useEffect(() => {
    if (game?.status !== 'active' || !hostResumeToken) {
      setHostWord(null)
      return
    }
    let cancelled = false
    const run = async () => {
      const res = await fetch('/api/wordle-room/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken }),
      })
      if (cancelled || !res.ok) return
      const data = (await res.json()) as WordleRoomStatus
      if (cancelled) return
      setHostWord(data)
    }
    void run()
    const poll = window.setInterval(run, 4000)
    return () => {
      cancelled = true
      window.clearInterval(poll)
    }
  }, [game?.status, hostResumeToken, gameCode])

  useEffect(() => {
    load()
  }, [gameCode, load])

  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [game?.status])

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  const standings: WordleRoomStandingRow[] = useMemo(
    () => tallyWordleRoomScores(progressRows, players),
    [progressRows, players]
  )

  const rosterScores = useMemo(
    () => Object.fromEntries(standings.map((r) => [r.player_id, r.words_solved])),
    [standings]
  )
  useGameScores(rosterScores, { suffix: ' solved' })
  const rosterDetails = useMemo(
    () =>
      Object.fromEntries(
        standings.map((r) => [
          r.player_id,
          r.finished ? `🏁 ${r.words_solved}/${game?.wordle_room_word_count ?? 5}` : `Word ${r.word_index + 1}`,
        ])
      ),
    [standings, game?.wordle_room_word_count]
  )
  useGameStats(rosterDetails)

  useGameRosterPoll(gameCode, game?.status, { setGame, setPlayers, reload: load })

  useEffect(() => {
    const ch = supabase
      .channel(`wordle_room_host_game_${gameCode}`)
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
    const ch = supabase
      .channel(`wordle_room_host_players_${gameCode}`)
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

  useEffect(() => {
    if (!roundId) return
    const ch = supabase
      .channel(`wordle_room_host_progress_${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wordle_room_progress', filter: `game_id=eq.${gameCode}` },
        () => {
          supabase
            .from('wordle_room_progress')
            .select('*')
            .eq('game_id', gameCode)
            .eq('round_id', roundId)
            .then(({ data }) => {
              if (data) setProgressRows(data as WordleRoomProgressRow[])
            })
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [roundId, gameCode])

  async function startGame() {
    if (starting) return
    if (hostMode === 'player' && !hostPlayerId) {
      toastError('Join with your name before starting (Host + play mode)')
      return
    }
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
        const data = await res.json().catch(() => ({}))
        toastError(data.error ?? 'Failed to reset game')
        return
      }
      if (!sameSettings) setHostJoinName('')
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
        'Reopens the game with the same settings. Previous watchers and new people can join; everyone taps "ready" and you start the next game once enough players are in.',
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

  const readyPlayers = players.filter((p) => p.spectator !== true)
  const canStart = readyPlayers.length >= WORDLE_ROOM_MIN_PLAYERS
  const hostPlays = hostMode === 'player' && !!hostPlayerId

  const hostSettingsNode = useMemo(
    () =>
      game?.status === 'active' ? (
        <HostActiveSettings
          gameCode={gameCode}
          hostToken={hostToken}
          gameType="wordle_room"
          onEnded={load}
          endGameConfirmTitle="End this room early?"
          endGameConfirmMessage="The race will end and players will see the final standings."
        >
          <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
          {hostMode === 'player' && !!hostPlayerId && (
            <HostLeaveSeatButton onLeave={leaveSeatKeepHosting} className="btn-secondary w-full py-3 text-base" />
          )}
        </HostActiveSettings>
      ) : null,
    [game, gameCode, hostToken, load, hostMode, hostPlayerId, leaveSeatKeepHosting]
  )
  useRegisterGameSettings(hostSettingsNode)

  if (!game) {
    return <HostLobbySkeleton />
  }

  const cfg = gameTypeConfig('wordle_room')

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  const interactivePlay = <WordleRoomPlayerView gameCode={gameCode} />

  const watchRound = game.status === 'active' && (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Words solved</p>
          <p className="text-2xl font-black">
            {standings.reduce((sum, r) => sum + r.words_solved, 0)}
            <span className="text-sm font-semibold text-muted"> / {game.wordle_room_word_count ?? 5} each</span>
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Time left</p>
          <p
            className={`text-xl font-black tabular-nums ${timeUp ? 'text-[var(--kill)]' : secondsLeft <= 10 ? 'text-[var(--marry)]' : 'text-[var(--primary)]'}`}
          >
            {timeLabel}
          </p>
        </div>
      </div>

      {hostWord?.currentWord && (
        <div className="glass-card p-3 space-y-2">
          <p className="label-caps text-xs">
            Current word · {hostWord.wordIndex != null ? hostWord.wordIndex + 1 : '?'}/{hostWord.wordCount ?? 5} ·{' '}
            {hostWord.categoryLabel}
          </p>
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${hostWord.currentWord.length}, minmax(0, 1fr))`, maxWidth: 280 }}
          >
            {hostWord.currentWord.split('').map((ch, i) => (
              <span
                key={i}
                className="flex aspect-square items-center justify-center rounded-md border border-[var(--primary)] bg-[var(--surface-inset-bg)] text-lg font-bold uppercase text-[var(--foreground)]"
              >
                {ch}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <p className="label-caps text-xs">Live standings</p>
        {standings.map((row, i) => (
          <div key={row.player_id} className="glass-card px-3 py-2 flex items-center justify-between">
            <span className="text-sm font-medium">
              {i + 1}. {row.name}
            </span>
            <span className="text-sm font-bold">
              {row.words_solved}w · {row.finished ? 'done' : `word ${row.word_index + 1}`}
            </span>
          </div>
        ))}
      </div>
    </>
  )

  const manage = (
    <div className="space-y-4 sm:space-y-5 animate-stagger">
      {game.status === 'waiting' && (
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
          spectatorHint="Watch the game from the Watch tab"
          playingNote={
            <p className="text-sm text-muted">
              Playing as <strong className="text-body">{hostPlayerName}</strong> — play once you start.
            </p>
          }
        />
      )}
      {game.status !== 'finished' && <HostRulesRow gameType="wordle_room" />}

      {game.status === 'active' && (
        <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
      )}

      {(game.status === 'waiting' || game.status === 'active') && (
        <HostLobbyPlayersSection
          players={players}
          removingPlayerId={removingPlayerId}
          onRemovePlayer={removePlayer}
          highlightPlayerId={hostPlayerId}
          alwaysShowReady={game.status === 'waiting'}
        />
      )}

      {game.status === 'waiting' && (
        <>
          <HostWordleRoomLobbyPanel
            gameCode={gameCode}
            hostToken={hostToken}
            game={game}
            playerCount={players.length}
            onGameUpdate={setGame}
          />
          <HostLobbyWaitingFooter
            gameCode={gameCode}
            hostToken={hostToken}
            game={game ?? undefined}
            onGameUpdate={setGame}
            onStart={() => void startGame()}
            onEnded={load}
            canStart={canStart}
            starting={starting}
            startLabel="Start room"
            startDisabledHint={
              canStart
                ? null
                : `Need at least ${WORDLE_ROOM_MIN_PLAYERS} players to start (${readyPlayers.length}/${WORDLE_ROOM_MIN_PLAYERS})`
            }
            className="space-y-3"
          />
        </>
      )}

      {game.status === 'active' && (
        <HostEndGameButton
          gameCode={gameCode}
          hostToken={hostToken}
          onEnded={load}
          label="End game"
          icon={<ExitIcon size={14} />}
          confirmTitle="End this room early?"
          confirmMessage="The race will end and players will see the final standings."
          className="btn-danger-soft"
        />
      )}
    </div>
  )

  const hostStanding = standings.find((row) => row.player_id === hostPlayerId)
  const hostWon =
    hostPlays &&
    !!hostStanding &&
    standings.length > 1 &&
    standings[0] != null &&
    hostStanding === standings[0] &&
    standings[0].words_solved > 0

  const finished = (
    <>
      <WordleRoomResults
        game={game}
        players={players}
        standings={standings}
        highlightPlayerId={hostPlayerId}
        playAgainButton={
          <button
            type="button"
            onClick={() => void confirmPlayAgain()}
            disabled={playingAgain}
            className="btn-secondary w-full py-3 text-base disabled:opacity-60"
          >
            {playingAgain ? 'Starting…' : '↻ Play again · same settings'}
          </button>
        }
        returnToLobbyButton={
          <button
            type="button"
            onClick={() => void confirmReturnToLobby()}
            disabled={playingAgain}
            className="w-full py-2.5 text-sm font-semibold text-muted transition-colors hover:text-body disabled:opacity-60"
          >
            Return to lobby
          </button>
        }
        lobbyNote="Same settings reopens the game for ready-up — watchers and new people can join · lobby lets you tweak settings first."
      />
      {hostWon && (
        <div className="mt-4">
          <PostWinToCommunity
            gameType="wordle_room"
            gameCode={gameCode}
            winnerName={hostStanding?.name ?? ''}
            roundKey={game?.session_started_at ?? undefined}
          />
        </div>
      )}
    </>
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
          minPlayers={WORDLE_ROOM_MIN_PLAYERS}
          capacityGame={game}
          onToggleReady={() => {}}
          onStart={() => void startGame()}
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

  const waitingLobby = game.status === 'waiting' && !game.replay_pending

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
      spectatorHint="Watch the game once it starts"
      playerHint="Play the room with everyone"
      playingNote={
        <p className="text-sm text-muted">
          Playing as <strong className="text-body">{hostPlayerName}</strong> — play once you start.
        </p>
      }
    />
  )

  const lobbySettings = (
    <>
      <HostWordleRoomLobbyPanel
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        playerCount={players.length}
        onGameUpdate={setGame}
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
        titleMeta={<GameInfoChips game={game} className="mt-2" />}
        resumeToken={hostResumeToken}
        players={players}
        maxPlayers={lobbyMaxPlayersFromGameClient('wordle_room', game) ?? game.max_players}
        playCard={lobbyModeCard}
        settingsChildren={lobbySettings}
        onStart={() => void startGame()}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={
          canStart
            ? null
            : `Need at least ${WORDLE_ROOM_MIN_PLAYERS} players to start (${readyPlayers.length}/${WORDLE_ROOM_MIN_PLAYERS})`
        }
        startLabel="Start room"
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
      primary={<div className="max-w-2xl mx-auto w-full">{hostPlays ? interactivePlay : watchRound}</div>}
      manage={manage}
      noManageTab={game?.status === 'active'}
      finished={finished}
    />
  )
}
