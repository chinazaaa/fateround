'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostPageShell, hostPlayLayoutFlags } from '@/components/host/HostPageShell'
import { HostLobby } from '@/components/host/HostLobby'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostBoardGameLobbyPanel } from '@/components/host-lobby/HostBoardGameLobbyPanel'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { TransferHostControl } from '@/components/TransferHostControl'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { HostLeaveSeatButton } from '@/components/host/HostLeaveSeatButton'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { gameTypeConfig } from '@/lib/game-types'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useRosterBase, useRosterManage } from '@/components/roster/RosterDrawerContext'
import { useHostSeat } from '@/hooks/useHostSeat'
import { useMahjongTurnTimer } from '@/hooks/useMahjongTurnTimer'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { supabasePollOk, usePolling } from '@/hooks/usePolling'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { getPlayerSession } from '@/lib/utils'
import { currentMahjongPlayerId, MAHJONG_MIN_PLAYERS } from '@/lib/mahjong'
import type { Game, MahjongClaimType, MahjongPlayerState, MahjongSession, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { MahjongGamePanel } from '@/components/mahjong/MahjongBoard'
import { MahjongFinalResultsShareBlock } from '@/components/mahjong/MahjongFinalResultsShareBlock'
import { MahjongCard, MahjongPrimaryButton } from '@/components/mahjong/MahjongChrome'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { useConfirm } from '@/components/ui/ConfirmDialog'

type HostTab = 'play' | 'manage'

const MAHJONG_POLL_INTERVAL_MS = 1500

export function MahjongHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<MahjongSession | null>(null)
  const [states, setStates] = useState<MahjongPlayerState[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [startingNextHand, setStartingNextHand] = useState(false)
  const [hostActing, setHostActing] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')

  useApplyGameTheme(game?.theme)
  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const load = useCallback(async (): Promise<boolean> => {
    try {
      const [gameRes, playersRes] = await Promise.all([
        supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
        supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      ])
      if (!supabasePollOk(gameRes, playersRes)) return false

      const stored = getPlayerSession(gameCode)
      const params = new URLSearchParams({ gameId: gameCode })
      if (stored?.playerId && stored.resumeToken) {
        params.set('playerId', stored.playerId)
        params.set('resumeToken', stored.resumeToken)
      }
      const snapshotRes = await fetch(`/api/mahjong/state?${params.toString()}`)
      if (!snapshotRes.ok) return false
      const snapshot = (await snapshotRes.json()) as {
        session: MahjongSession | null
        states: MahjongPlayerState[]
      }

      setGame(gameRes.data)
      setPlayers(playersRes.data ?? [])
      setSession(snapshot.session)
      setStates(snapshot.states ?? [])
      return true
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to load Mahjong table')
      return false
    }
  }, [gameCode, toastError])

  useEffect(() => {
    const loadId = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(loadId)
  }, [gameCode, load])

  useEffect(() => {
    if (game?.status !== 'finished') return
    const id = window.setTimeout(() => setTab('manage'), 0)
    return () => window.clearTimeout(id)
  }, [game?.status])

  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleLoad = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = setTimeout(() => void load(), 90)
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`mahjong-host-${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        scheduleLoad
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        scheduleLoad
      )
      .subscribe()
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
      supabase.removeChannel(channel)
    }
  }, [gameCode, scheduleLoad])

  usePolling(() => load(), [gameCode, load], { intervalMs: MAHJONG_POLL_INTERVAL_MS })

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
    leaveGameRemovePlayer,
    renameHost,
    handlePlayerRemoved: onHostSeatRemoved,
  } = useHostSeat({
    gameCode,
    hostToken,
    gameStatus: game?.status,
    players,
    onReload: load,
    toast: { success, error: toastError },
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

  useEffect(() => {
    if (hostMode !== 'player' || !hostPlayerId || game?.status !== 'active') return
    const id = window.setTimeout(() => setTab('play'), 0)
    return () => window.clearTimeout(id)
  }, [hostMode, hostPlayerId, game?.status])

  const postAction = async (path: string, body: Record<string, unknown> = {}) => {
    if (!hostPlayerId || !hostResumeToken) return
    setHostActing(true)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: hostPlayerId, resumeToken: hostResumeToken, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setHostActing(false)
    }
  }

  const startGame = async () => {
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start')
      success('Mahjong table started!')
      await load()
      if (hostMode === 'player' && hostPlayerId) setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  // "Play again · same settings" reopens the game as an open lobby flagged for the
  // ready-up ring; a plain reset (sameSettings=false) is the normal "Return to lobby".
  const resetGame = async (sameSettings: boolean) => {
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined, same_settings: sameSettings }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset')
      success(sameSettings ? 'Ready up for the next game!' : 'Back to the lobby')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
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

  const startNextHand = async () => {
    setStartingNextHand(true)
    try {
      const res = await fetch('/api/mahjong/next-hand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start next hand')
      success('Next Mahjong hand started!')
      await load()
      if (hostMode === 'player' && hostPlayerId) setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start next hand')
    } finally {
      setStartingNextHand(false)
    }
  }

  const assignChombo = async (playerId: string) => {
    setHostActing(true)
    try {
      const res = await fetch('/api/mahjong/penalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken, playerId, penaltyType: 'chombo' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to apply penalty')
      success('Chombo penalty applied')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to apply penalty')
    } finally {
      setHostActing(false)
    }
  }

  const readyPlayers = players.filter((p) => p.spectator !== true)
  const canStart = readyPlayers.length === MAHJONG_MIN_PLAYERS
  const turnPlayerId = session ? currentMahjongPlayerId(session) : null
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const gameFinished = game?.status === 'finished' || session?.phase === 'finished'
  const showPlayTab = hostPlays && game?.status !== 'waiting' && !gameFinished
  const isHostTurn = turnPlayerId === hostPlayerId

  const { secondsLeft, hasTimer, urgent } = useMahjongTurnTimer(
    gameCode,
    session,
    game?.status === 'active' && (tab === 'play' ? isHostTurn || session?.phase === 'claim' : true)
  )

  // Feed the shared roster side-drawer (opened from the header people button) while
  // active — the host sees who's here + can Remove, same as every game.
  useRosterBase(game?.status === 'active' ? players : undefined, game, hostPlayerId)
  const rosterRemove = useMemo(
    () => (row: { id: string; name: string }) => removePlayer(row.id, row.name),
    [removePlayer]
  )
  useRosterManage(game?.status === 'active' ? { hostPlayerId: hostPlayerId ?? null, onRemove: rosterRemove } : null)

  if (!game) {
    return <HostLobbySkeleton />
  }

  const layout = hostPlayLayoutFlags(tab, showPlayTab, game.status)

  // "Play again · same settings" reopened the game as an open lobby flagged for the
  // ready-up ring — the host sees the ring + a "Start game" button instead of the lobby.
  if (game.status === 'waiting' && game.replay_pending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-3 py-8 text-[var(--foreground)]">
        <ReplayReadyRing
          players={players}
          meId={hostPlayerId}
          isHost
          minPlayers={MAHJONG_MIN_PLAYERS}
          capacityGame={game}
          onToggleReady={() => {}}
          onStart={() => void startGame()}
          starting={starting}
          gameCode={gameCode}
          hostToken={hostToken}
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
  if (waitingLobby) {
    return (
      <HostLobby
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        gameTypeLabel={gameTypeConfig('mahjong').label}
        players={players}
        maxPlayers={lobbyMaxPlayersFromGameClient('mahjong', game) ?? game.max_players}
        resumeToken={hostResumeToken}
        playCard={
          <HostModeSelector
            mode={hostMode}
            onChange={changeHostMode}
            joinedPlayerId={hostPlayerId}
            joinedPlayerName={hostPlayerName}
            joinName={hostJoinName}
            onJoinNameChange={setHostJoinName}
            onJoin={() => void hostJoinGame()}
            joining={hostJoining}
            onEditName={renameHost}
            spectatorHint="Manage the table"
            playerHint="Take one of the four seats"
          />
        }
        settingsChildren={
          <>
            <HostBoardGameLobbyPanel
              gameCode={gameCode}
              hostToken={hostToken}
              game={game}
              boardGameType="mahjong"
              playerCount={readyPlayers.length}
              onGameUpdate={setGame}
            />
            <TransferHostControl triggerClassName="btn-secondary w-full flex items-center justify-center gap-2" />
          </>
        }
        onStart={() => void startGame()}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={
          canStart
            ? null
            : `Need exactly ${MAHJONG_MIN_PLAYERS} ready players (${readyPlayers.length}/${MAHJONG_MIN_PLAYERS})`
        }
        startLabel="Start table"
        onRemovePlayer={removePlayer}
        removingPlayerId={removingPlayerId}
        highlightPlayerId={hostPlayerId}
        onEnded={load}
      />
    )
  }

  return (
    <HostPageShell gameCode={gameCode} {...layout}>
      {!gameFinished && <HostGameHeader game={game} />}

      {game.status === 'waiting' && (
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
              <span className="text-faint text-xs">Manage the table</span>
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
              <span className="text-faint text-xs">Take one of the four seats</span>
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
                {hostJoining ? 'Joining...' : 'Join'}
              </button>
            </div>
          )}
          {hostMode === 'player' && hostPlayerId && (
            <p className="text-sm text-muted">
              Playing as <span className="font-semibold text-[var(--foreground)]">{hostPlayerName}</span>
            </p>
          )}
        </div>
      )}

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

      {tab === 'play' && session && hostPlayerId && game.status === 'active' && !gameFinished && (
        <MahjongGamePanel
          session={session}
          states={states}
          players={players}
          myPlayerId={hostPlayerId}
          secondsLeft={secondsLeft}
          hasTimer={hasTimer}
          urgent={urgent}
          acting={hostActing}
          onDiscard={(tile) => void postAction('/api/mahjong/discard', { tile })}
          onClaim={(claimType: MahjongClaimType, tiles?: string[]) =>
            void postAction('/api/mahjong/claim', { claimType, tiles })
          }
          onRiichi={() => void postAction('/api/mahjong/riichi')}
          onPass={() => void postAction('/api/mahjong/pass')}
        />
      )}

      {(tab === 'manage' || !showPlayTab) && (
        <>
          {!gameFinished && (
            <p className="text-center">
              <GameRulesLink gameType="mahjong" variant="subtle" />
            </p>
          )}

          {gameFinished && (
            <MahjongFinalResultsShareBlock
              game={game}
              players={players}
              session={session}
              winnerName={winner?.name}
              highlightPlayerId={hostPlayerId}
              playAgainButton={
                game.status === 'active' && session?.phase === 'finished' ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <MahjongPrimaryButton onClick={startNextHand} loading={startingNextHand}>
                      Next hand
                    </MahjongPrimaryButton>
                    <HostEndGameButton gameCode={gameCode} hostToken={hostToken} onEnded={load} className="w-full" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void confirmPlayAgain()}
                    disabled={playingAgain}
                    className="btn-secondary w-full py-3 text-base disabled:opacity-60"
                  >
                    {playingAgain ? 'Starting…' : '↻ Play again · same settings'}
                  </button>
                )
              }
              returnToLobbyButton={
                game.status === 'active' && session?.phase === 'finished' ? undefined : (
                  <button
                    type="button"
                    onClick={() => void confirmReturnToLobby()}
                    disabled={playingAgain}
                    className="w-full py-2.5 text-sm font-semibold text-muted transition-colors hover:text-body disabled:opacity-60"
                  >
                    Return to lobby
                  </button>
                )
              }
              lobbyNote={
                game.status === 'active' && session?.phase === 'finished'
                  ? undefined
                  : 'Same settings reopens the game for ready-up — watchers and new people can join · lobby lets you tweak settings first.'
              }
            />
          )}

          {session && game.status === 'active' && !gameFinished && (
            <div className="space-y-4">
              <MahjongGamePanel
                session={session}
                states={states}
                players={players}
                myPlayerId={hostPlayerId}
                secondsLeft={secondsLeft}
                hasTimer={hasTimer}
                urgent={urgent}
              />
              <MahjongCard className="p-4 space-y-3">
                <div>
                  <p className="label-caps">Penalty</p>
                  <p className="text-xs text-faint">
                    Host adjudication for dead hands, false wins, and severe table errors.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {players
                    .filter((player) => states.some((state) => state.player_id === player.id))
                    .map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        disabled={hostActing}
                        onClick={() => void assignChombo(player.id)}
                        className="btn-secondary py-2 text-xs"
                      >
                        Chombo · {player.name}
                      </button>
                    ))}
                </div>
              </MahjongCard>
            </div>
          )}

          {game.status === 'waiting' && (
            <HostBoardGameLobbyPanel
              gameCode={gameCode}
              hostToken={hostToken}
              game={game}
              boardGameType="mahjong"
              playerCount={readyPlayers.length}
              onGameUpdate={setGame}
            />
          )}

          {(game.status === 'waiting' || (game.status === 'active' && !gameFinished)) && (
            <HostLobbyPlayersSection
              players={players}
              removingPlayerId={removingPlayerId}
              onRemovePlayer={removePlayer}
              highlightPlayerId={hostPlayerId}
              hint="Mahjong starts with exactly four active players."
            />
          )}

          {game.status === 'waiting' && (
            <HostLobbyWaitingFooter
              gameCode={gameCode}
              hostToken={hostToken}
              onStart={startGame}
              onEnded={load}
              canStart={canStart}
              starting={starting}
              startDisabledHint={
                canStart
                  ? null
                  : `Need exactly ${MAHJONG_MIN_PLAYERS} ready players (${readyPlayers.length}/${MAHJONG_MIN_PLAYERS})`
              }
              className="space-y-3"
            />
          )}

          {game.status === 'active' && !gameFinished && hostMode === 'player' && !!hostPlayerId && (
            <HostLeaveSeatButton
              onLeave={leaveGameRemovePlayer}
              variant="remove"
              className="btn-secondary w-full py-3 text-base"
            />
          )}

          {game.status === 'active' && !gameFinished && (
            <HostEndGameButton gameCode={gameCode} hostToken={hostToken} onEnded={load} className="w-full" />
          )}
        </>
      )}
    </HostPageShell>
  )
}
