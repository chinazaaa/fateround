'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, GOFISH_SESSION_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { fetchGoFishHands } from '@/lib/hands-client'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { usePolling, POLL_INTERVALS, supabasePollOk } from '@/hooks/usePolling'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useHostSeat } from '@/hooks/useHostSeat'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useGoFishNotifications } from '@/hooks/useGoFishNotifications'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { HostLobby } from '@/components/host/HostLobby'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { HostBoardGameLobbyPanel } from '@/components/host-lobby/HostBoardGameLobbyPanel'
import { HostActiveSettings } from '@/components/host/HostActiveSettings'
import { TransferHostControl } from '@/components/TransferHostControl'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { GoFishActiveRound } from '@/components/gofish/GoFishActiveRound'
import { GoFishFinalResultsShareBlock } from '@/components/gofish/GoFishFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { gameTypeConfig } from '@/lib/game-types'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { GOFISH_MIN_PLAYERS } from '@/lib/gofish'
import type { Game, GoFishPlayerHand, GoFishSession, Player } from '@/types'

type HostTab = 'play' | 'manage'

/**
 * Go Fish host view. The host is a spectator by default; using HostModeSelector they
 * can also take a seat and play (via useHostSeat, same as Trivia + other lobby games).
 *
 * All rules are enforced server-side (see gofish-server.ts + gofish.ts), so the host
 * view is purely a projector + control panel: standings, event log, remove player,
 * end game early. Nothing here can affect the state a client couldn't already reach.
 */
export function GoFishHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const cfg = gameTypeConfig('gofish')

  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<GoFishSession | null>(null)
  const [hands, setHands] = useState<GoFishPlayerHand[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')
  // Ref lets the reload callback pick up the freshest host resume token without being
  // re-created every time it changes (mirrors WhotHostView). Without a token the hands
  // route can't unredact a seated host's own cards — they'd see nothing in their hand.
  const hostResumeTokenRef = useRef<string | null>(null)

  useApplyGameTheme(game?.theme, game?.game_type)

  // Host projector: hearing the cues matters even more than at a player seat, because
  // the host is the "casting screen" for the room. Fire off the same event bell.
  useGoFishNotifications({ game, session, myPlayerId: null, enabled: game?.status === 'active' })

  const reload = useCallback(async () => {
    // Host hand fetch: pass hostToken so a seated host sees their own cards; a pure
    // spectator host gets counts only (resolveHandViewer returns null and everything
    // is redacted).
    const [gameRes, plrsRes, sessRes, handsData] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('gofish_sessions').select(GOFISH_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      fetchGoFishHands(gameCode, { hostToken, resumeToken: hostResumeTokenRef.current ?? undefined }),
    ])
    if (supabasePollOk(gameRes, plrsRes, sessRes)) {
      if (gameRes.data) setGame(gameRes.data as unknown as Game)
      setPlayers((plrsRes.data as unknown as Player[]) ?? [])
      setSession((sessRes.data as GoFishSession | null) ?? null)
    }
    if (handsData) setHands(handsData)
  }, [gameCode, hostToken])

  useEffect(() => {
    reload()
  }, [reload])

  const connected = useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'gofish_sessions', 'gofish_player_hands'],
    reload,
    { channelKey: 'host' }
  )

  usePolling(() => reload(), [gameCode, reload], {
    intervalMs: game?.status === 'waiting' ? POLL_INTERVALS.lobby : POLL_INTERVALS.realtimeFallback,
    enabled: game?.status === 'waiting' || !connected,
    runImmediately: false,
  })

  const hostSettingsNode = useMemo(
    () =>
      game?.status === 'active' ? (
        <HostActiveSettings game={game} gameCode={gameCode} hostToken={hostToken} gameType="gofish" onEnded={reload} />
      ) : null,
    [game?.status, gameCode, hostToken, reload]
  )
  useRegisterGameSettings(hostSettingsNode)

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
    renameHost,
    handlePlayerRemoved: onHostSeatRemoved,
  } = useHostSeat({
    gameCode,
    hostToken,
    gameStatus: game?.status,
    players,
    onReload: reload,
    toast: { success, error: toastError },
    onModeChange: (mode) => {
      if (mode === 'player') setTab('play')
      else if (mode === 'spectator') setTab('manage')
    },
  })
  hostResumeTokenRef.current = hostResumeToken

  // First hand fetch runs before useHostSeat resolves the host's player resume token, so a
  // seated host's own hand comes back redacted ("0 cards"). Re-fetch with the token the moment
  // it lands (mirrors WhotHostView).
  useEffect(() => {
    if (!hostResumeToken || game?.status !== 'active') return
    let cancelled = false
    void fetchGoFishHands(gameCode, { hostToken, resumeToken: hostResumeToken }).then((h) => {
      if (!cancelled && h) setHands(h)
    })
    return () => {
      cancelled = true
    }
  }, [gameCode, hostToken, hostResumeToken, game?.status])

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      onHostSeatRemoved(playerId)
      setHostJoinName('')
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [onHostSeatRemoved, setHostJoinName]
  )

  const { removingPlayerId, removePlayer } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  const activePlayers = useMemo(() => players.filter((p) => p.spectator !== true), [players])

  const handleStartGame = async () => {
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      if (!res.ok) {
        const data = await res.json()
        toastError(data.error || 'Failed to start game')
      } else {
        await reload()
      }
    } catch {
      toastError('Network error starting game')
    } finally {
      setStarting(false)
    }
  }

  const resetGame = async (sameSettings: boolean) => {
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined, same_settings: sameSettings }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error || 'Failed to reset the room')
        return
      }
      success(sameSettings ? 'Ready up for the next round!' : 'Back to the lobby')
      await reload()
    } catch {
      toastError('Network error')
    } finally {
      setPlayingAgain(false)
    }
  }

  const confirmPlayAgain = async () => {
    const ok = await confirm({
      title: 'Play again with same settings?',
      message: 'This will reset the room and let players ready up for another round.',
      confirmLabel: 'Play again',
    })
    if (!ok) return
    await resetGame(true)
  }

  const confirmReturnToLobby = async () => {
    const ok = await confirm({
      title: 'Return to lobby?',
      message: 'This will return all players to the lobby so you can adjust settings.',
      confirmLabel: 'Return to lobby',
    })
    if (!ok) return
    await resetGame(false)
  }

  if (!game) return <HostLobbySkeleton />

  // Replay ready ring after "Play again · same settings"
  if (game.status === 'waiting' && game.replay_pending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-3 py-8 text-[var(--foreground)]">
        <ReplayReadyRing
          players={players}
          meId={hostPlayerId}
          isHost
          gameCode={gameCode}
          hostToken={hostToken}
          minPlayers={GOFISH_MIN_PLAYERS}
          capacityGame={game}
          onToggleReady={() => {}}
          onStart={() => void handleStartGame()}
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

  const canStart = activePlayers.length >= GOFISH_MIN_PLAYERS

  // Lobby (pre-start)
  if (game.status === 'waiting') {
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
        spectatorHint="Watch and manage the room from here"
        playerHint="Take a seat and play with everyone"
      />
    )

    const lobbySettings = (
      <>
        <HostBoardGameLobbyPanel
          gameCode={gameCode}
          hostToken={hostToken}
          game={game}
          boardGameType="gofish"
          playerCount={players.length}
          seatedCount={activePlayers.length}
          onGameUpdate={setGame}
        />
        <TransferHostControl triggerClassName="btn-secondary w-full flex items-center justify-center gap-2" />
      </>
    )

    return (
      <HostLobby
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        gameTypeLabel={cfg.label}
        titleMeta={<GameInfoChips game={game} className="mt-2" />}
        resumeToken={hostResumeToken}
        players={players}
        maxPlayers={lobbyMaxPlayersFromGameClient('gofish', game) ?? game.max_players ?? 6}
        playCard={lobbyModeCard}
        settingsChildren={lobbySettings}
        onStart={() => void handleStartGame()}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={
          canStart
            ? null
            : `Need at least ${GOFISH_MIN_PLAYERS} players to start (${activePlayers.length}/${GOFISH_MIN_PLAYERS})`
        }
        startLabel="Start game"
        onRemovePlayer={removePlayer}
        removingPlayerId={removingPlayerId}
        highlightPlayerId={hostPlayerId}
        onEnded={reload}
      />
    )
  }

  // Active / finished — the manage tab is the projector view; the play tab is the ask
  // surface if the host has taken a seat.
  const isFinished = game.status === 'finished' || session?.phase === 'finished'
  const hostPlays = hostMode === 'player' && Boolean(hostPlayerId)

  const projector = (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-4">
      {/* Round-header line ("Ocean: N · Turn: X") is redundant with the TurnStatusBanner
          inside GoFishActiveRound. On finish, the header itself competes with the
          FinishedWinnerHero underneath ("Go Fish · Game finished" reads like a duplicate
          of the winner banner), so drop the header entirely there — the shared results
          block owns the surface. */}
      {!isFinished && (
        <div className="glass-card-strong p-3 sm:p-4 flex items-center gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-black truncate">{cfg.label}</h1>
          </div>
        </div>
      )}
      {isFinished ? (
        <>
          <GoFishFinalResultsShareBlock
            game={game}
            players={players}
            hands={hands}
            session={session}
            winnerName={players.find((p) => p.id === session?.winner_player_id)?.name}
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
          {hostPlayerId && session?.winner_player_id === hostPlayerId && (
            <PostWinToCommunity
              gameType="gofish"
              gameCode={gameCode}
              winnerName={hostPlayerName}
              roundKey={session?.id}
            />
          )}
        </>
      ) : (
        <GoFishActiveRound
          gameCode={gameCode}
          game={game}
          players={players}
          session={session}
          hands={hands}
          myPlayerId={hostPlayerId ?? ''}
          myResumeToken={hostResumeToken ?? null}
          onReload={reload}
          readOnly={!hostPlays}
        />
      )}
    </div>
  )

  if (hostPlays) {
    return (
      <HostGameLayout
        onRemovePlayer={removePlayer}
        gameCode={gameCode}
        status={game.status}
        tab={tab}
        onTabChange={setTab}
        primaryKind="play"
        game={game}
        players={players}
        hostPlayerId={hostPlayerId}
        onHostRejoined={reload}
        showTabs={false}
        gameStarted={true}
        header={<HostGameHeader game={game} />}
        primary={projector}
        manage={projector}
      />
    )
  }

  return projector
}
