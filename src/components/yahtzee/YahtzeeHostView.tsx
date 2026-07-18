'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { YahtzeeDiceTray } from '@/components/yahtzee/YahtzeeChrome'
import { YahtzeeScorecard } from '@/components/yahtzee/YahtzeeScorecard'
import { YahtzeeFinalResultsShareBlock } from '@/components/yahtzee/YahtzeeFinalResultsShareBlock'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostBoardGameLobbyPanel } from '@/components/host-lobby/HostBoardGameLobbyPanel'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { TransferHostControl } from '@/components/TransferHostControl'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { gameTypeConfig } from '@/lib/game-types'
import { currentPlayerId, totalScore, YAHTZEE_MIN_PLAYERS } from '@/lib/yahtzee'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  PLAYER_SELECT,
  YAHTZEE_PLAYER_SCORES_SELECT,
  YAHTZEE_SESSION_SELECT,
} from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostSeat } from '@/hooks/useHostSeat'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import type { Game, Player, YahtzeeCategory, YahtzeePlayerScore, YahtzeeSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { useYahtzeeTurnTimer } from '@/hooks/useYahtzeeTurnTimer'
import { useYahtzeeNotifications, playYahtzeeScoreSound } from '@/hooks/useYahtzeeNotifications'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { ExitIcon } from '@/components/host/host-icons'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'

type HostTab = 'play' | 'manage'

export function YahtzeeHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<YahtzeeSession | null>(null)
  // Mirror for the realtime apply callback; updated in an effect (never during
  // render) so a replayed render can't leave it stale. The callback also writes it
  // synchronously so consecutive deltas compare against the latest.
  const sessionRef = useRef<YahtzeeSession | null>(null)
  useEffect(() => {
    sessionRef.current = session
  }, [session])
  const [scores, setScores] = useState<YahtzeePlayerScore[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)

  // Host+play mode
  const [hostActing, setHostActing] = useState(false)
  const [localHostHeld, setLocalHostHeld] = useState<boolean[]>([false, false, false, false, false])
  const [tab, setTab] = useState<HostTab>('manage')
  const turnIndexRef = useRef<number | null>(null)

  useApplyGameTheme(game?.theme)
  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, sessionRes, scoresRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('yahtzee_sessions').select(YAHTZEE_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase
        .from('yahtzee_player_scores')
        .select(YAHTZEE_PLAYER_SCORES_SELECT)
        .eq('game_id', gameCode)
        .order('player_order'),
    ])
    if (!supabasePollOk(gameRes, plrsRes, sessionRes, scoresRes)) return false
    setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setSession(sessionRes.data as YahtzeeSession | null)
    setScores((scoresRes.data as YahtzeePlayerScore[]) ?? [])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
  }, [gameCode, load])

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
    onReload: load,
    toast: { success, error: toastError },
  })

  // Reset held when turn changes away from host
  useEffect(() => {
    if (!session || !hostPlayerId) return
    const turnId = currentPlayerId(session)
    const turnIndex = session.current_turn_index ?? null
    if (turnIndex !== turnIndexRef.current) {
      turnIndexRef.current = turnIndex
      if (turnId !== hostPlayerId) {
        setLocalHostHeld([false, false, false, false, false])
      }
    }
  }, [session, hostPlayerId])

  // Land on the primary (Play/Watch) tab when the game starts, and on Manage when it ends.
  useEffect(() => {
    if (game?.status === 'active') setTab('play')
    else if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  // Realtime push: reload on any change to this game's row + its tables.
  // Delta fast-path (dual-table). Screen derives from game.status, so session/score writes
  // only update the board — patch locally and skip the reload; active→finished rides the
  // games-row event, and the fallback poll reconciles.
  const applySessionRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as YahtzeeSession
    const prev = sessionRef.current
    if (prev && next.updated_at < prev.updated_at) return true
    setSession(next)
    sessionRef.current = next
    return prev != null
  }, [])
  const applyScoreRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as YahtzeePlayerScore
    setScores((prev) => {
      const i = prev.findIndex((s) => s.id === next.id)
      if (i === -1) return [...prev, next]
      const copy = [...prev]
      copy[i] = next
      return copy
    })
    return true
  }, [])

  const connected = useGameTableSync(
    gameCode,
    [
      { table: 'games', column: 'id' },
      'players',
      { table: 'yahtzee_sessions', apply: applySessionRow },
      { table: 'yahtzee_player_scores', apply: applyScoreRow },
    ],
    load
  )

  usePolling(() => load(), [gameCode, load], {
    intervalMs: POLL_INTERVALS.realtimeFallback,
    enabled: !connected,
    runImmediately: false,
  })

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      onHostSeatRemoved(playerId)
      setLocalHostHeld([false, false, false, false, false])
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [onHostSeatRemoved]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  const postHostAction = async (url: string, body: Record<string, unknown> = {}) => {
    if (!hostPlayerId || hostActing) return
    if (!hostResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setHostActing(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken, ...body }),
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

  const toggleHostHold = (index: number) => {
    if (!session || !hostPlayerId || currentPlayerId(session) !== hostPlayerId) return
    if ((session.rolls_this_turn ?? 0) < 1) return
    if (!hostResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    const next = [...localHostHeld]
    next[index] = !next[index]
    setLocalHostHeld(next)
    void fetch('/api/yahtzee/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken, held: next }),
    }).then(async (res) => {
      const data = await res.json()
      if (!res.ok) {
        setLocalHostHeld(session.held ?? [false, false, false, false, false])
        toastError(data.error ?? 'Could not keep dice')
      }
    })
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
      success('Game started!')
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

  const cfg = gameTypeConfig('yahtzee')
  const joinUrl = `${appOrigin()}/game/${gameCode}`
  const canStart = players.filter((p) => p.spectator !== true).length >= YAHTZEE_MIN_PLAYERS
  const turnPlayerId = session ? currentPlayerId(session) : null
  const turnPlayer = players.find((p) => p.id === turnPlayerId)
  const winner = players.find((p) => p.id === session?.winner_player_id)
  // A playing host only counts as a community-leaderboard winner with a positive
  // total AND more than one player — never at a score of 0 or in a solo game
  // (no one to beat). Mirrors the player view.
  const hostScoreRow = scores.find((s) => s.player_id === hostPlayerId)
  const hostTotal = hostScoreRow ? totalScore(hostScoreRow.scores.categories) : 0
  const hostPlays = hostMode === 'player' && !!hostPlayerId

  const isHostTurn = turnPlayerId === hostPlayerId
  const canHostScore = isHostTurn && (session?.rolls_this_turn ?? 0) > 0

  const { secondsLeft, hasTimer, urgent } = useYahtzeeTurnTimer(gameCode, session, game?.status === 'active')
  useYahtzeeNotifications({ game, session, myPlayerId: hostPlayerId, enabled: hostPlays && game?.status === 'active' })

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  if (!game) {
    return <HostLobbySkeleton />
  }

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  // Primary tab: interactive board when the host is playing, read-only board otherwise.
  const interactivePlay =
    session && hostPlayerId ? (
      <div className="space-y-2">
        <YahtzeeScorecard
          players={players}
          scores={scores}
          myPlayerId={hostPlayerId}
          activePlayerId={turnPlayerId}
          dice={session.dice}
          scoringEnabled={canHostScore}
          onScore={(category: YahtzeeCategory) => {
            playYahtzeeScoreSound()
            void postHostAction('/api/yahtzee/score', { category })
          }}
        />
        <YahtzeeDiceTray
          dice={session.dice}
          held={localHostHeld}
          rollsThisTurn={session.rolls_this_turn}
          rollsRemaining={session.rolls_remaining}
          interactive={isHostTurn && (session.rolls_this_turn ?? 0) > 0}
          onToggleHold={toggleHostHold}
          onRoll={() => postHostAction('/api/yahtzee/roll')}
          rolling={hostActing}
          isMyTurn={isHostTurn}
          turnName={turnPlayer?.name}
          secondsLeft={secondsLeft}
          hasTimer={hasTimer}
          urgent={urgent}
        />
      </div>
    ) : (
      <div className="glass-card p-8 text-center text-sm text-muted">Loading game…</div>
    )

  const watchBoard = session ? (
    <div className="space-y-2">
      <YahtzeeScorecard
        players={players}
        scores={scores}
        activePlayerId={turnPlayerId}
        dice={session.dice}
        scoringEnabled={false}
      />
      <YahtzeeDiceTray
        dice={session.dice}
        held={session.held}
        rollsThisTurn={session.rolls_this_turn}
        rollsRemaining={session.rolls_remaining}
        turnName={turnPlayer?.name}
        secondsLeft={secondsLeft}
        hasTimer={hasTimer}
        urgent={urgent}
        spectator
      />
    </div>
  ) : (
    <p className="text-muted text-sm text-center">Waiting for the round to begin…</p>
  )

  const manage = (
    <HostManageSection
      game={game}
      players={players}
      highlightPlayerId={hostPlayerId}
      removingPlayerId={removingPlayerId}
      onRemovePlayer={removePlayer}
      gameType="yahtzee"
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
            onEditName={renameHost}
            spectatorHint="Spectate from the Watch tab"
          />
        ) : undefined
      }
      settings={
        <>
          {game.status === 'waiting' && (
            <HostBoardGameLobbyPanel
              gameCode={gameCode}
              hostToken={hostToken}
              game={game}
              boardGameType="yahtzee"
              playerCount={players.length}
              onGameUpdate={setGame}
            />
          )}
          {game.status === 'active' && (
            <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
          )}
        </>
      }
      footer={
        game.status === 'waiting' ? (
          <HostLobbyWaitingFooter
            gameCode={gameCode}
            hostToken={hostToken}
            onStart={() => void startGame()}
            onEnded={load}
            canStart={canStart}
            starting={starting}
            startDisabledHint={canStart ? null : 'Join as a player above to start solo, or wait for others to join.'}
            className="space-y-3"
          />
        ) : game.status === 'active' ? (
          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={load}
            label="End game early"
            icon={<ExitIcon size={16} />}
            confirmTitle="End this game early?"
            confirmMessage="The current game will end and players will see the results screen."
            className="btn-danger-soft"
          />
        ) : null
      }
    />
  )

  // "Play again · same settings" reopened the game as an open lobby flagged for the
  // ready-up ring — the host sees the ring + a "Start game" button instead of the lobby.
  if (game.status === 'waiting' && game.replay_pending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-3 py-8 text-[var(--foreground)]">
        <ReplayReadyRing
          players={players}
          meId={hostPlayerId}
          isHost
          gameCode={gameCode}
          hostToken={hostToken}
          minPlayers={YAHTZEE_MIN_PLAYERS}
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

  // Fresh lobby (not the play-again ready-up flow, handled above).
  const waitingLobby = game.status === 'waiting' && !game.replay_pending
  if (waitingLobby) {
    return (
      <HostLobby
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        gameTypeLabel={cfg.label}
        players={players}
        maxPlayers={lobbyMaxPlayersFromGameClient('yahtzee', game) ?? game.max_players}
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
            spectatorHint="Spectate once it starts"
            playerHint="Take a seat and play"
          />
        }
        settingsChildren={
          <>
            <HostBoardGameLobbyPanel
              gameCode={gameCode}
              hostToken={hostToken}
              game={game}
              boardGameType="yahtzee"
              playerCount={players.length}
              onGameUpdate={setGame}
            />
            <TransferHostControl triggerClassName="btn-secondary w-full flex items-center justify-center gap-2" />
          </>
        }
        onStart={() => void startGame()}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={canStart ? null : 'Join as a player above to start solo, or wait for others to join.'}
        startLabel="Start game"
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
      finished={
        <>
          <YahtzeeFinalResultsShareBlock
            game={game}
            players={players}
            scores={scores}
            winnerName={winner?.name}
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
          {hostPlayerId && session?.winner_player_id === hostPlayerId && hostTotal > 0 && scores.length > 1 && (
            <PostWinToCommunity
              gameType="yahtzee"
              gameCode={gameCode}
              winnerName={hostPlayerName}
              roundKey={session?.id}
            />
          )}
        </>
      }
    />
  )
}
