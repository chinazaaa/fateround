'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostBoardGameLobbyPanel } from '@/components/host-lobby/HostBoardGameLobbyPanel'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { gameTypeConfig } from '@/lib/game-types'
import {
  currentPlayerId,
  hasActiveWhotCall,
  hasPlayableCard,
  getActivePickPenalty,
  isDrawPileDepleted,
  parseWhotRules,
  WHOT_MIN_PLAYERS,
} from '@/lib/whot'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT, WHOT_PLAYER_HANDS_SELECT, WHOT_SESSION_SELECT } from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useHostSeat } from '@/hooks/useHostSeat'
import type { Game, Player, WhotPlayerHand, WhotSession, WhotShape } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { ExitIcon } from '@/components/host/host-icons'
import { useWhotTurnTimer } from '@/hooks/useWhotTurnTimer'
import { useWhotNotifications, playWhotActionSound } from '@/hooks/useWhotNotifications'
import { WhotChoosePanel, WhotHand, WhotStandings, WhotTable } from '@/components/whot/WhotBoard'
import { WhotGameTimerBar } from '@/components/whot/WhotGameTimerBar'
import { useWhotGameTimer } from '@/hooks/useWhotGameTimer'
import { WhotPlaySurface } from '@/components/whot/WhotPlaySurface'
import { HostRoomShell } from '@/components/host/HostRoomShell'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { playerIsViewer } from '@/lib/viewers'
import { CardTableSettingsSheet } from '@/components/rooms/card-table/CardTableSettingsSheet'
import { TransferHostControl } from '@/components/TransferHostControl'
import { WhotFinalResultsShareBlock } from '@/components/whot/WhotFinalResultsShareBlock'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { WhotCard, WhotPrimaryButton } from '@/components/whot/WhotChrome'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'

type HostTab = 'play' | 'manage'

export function WhotHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<WhotSession | null>(null)
  const sessionRef = useRef<WhotSession | null>(null)
  sessionRef.current = session
  const [hands, setHands] = useState<WhotPlayerHand[]>([])
  // Host game-settings sheet — opened from the ⚙ icon in the voice rail (the
  // old inline host-controls bar is gone; its actions live in the rail now).
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [hostActing, setHostActing] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')

  useApplyGameTheme(game?.theme)
  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, sessionRes, handsRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('whot_sessions').select(WHOT_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('whot_player_hands').select(WHOT_PLAYER_HANDS_SELECT).eq('game_id', gameCode).order('player_order'),
    ])
    if (!supabasePollOk(gameRes, plrsRes, sessionRes, handsRes)) return false
    setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setSession(sessionRes.data as WhotSession | null)
    setHands((handsRes.data as WhotPlayerHand[]) ?? [])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
  }, [gameCode, load])

  // Land on the primary (Play/Watch) tab when the game starts, and on Manage when it ends.
  useEffect(() => {
    if (game?.status === 'active') setTab('play')
    else if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  // Delta fast-path (dual-table). Tab/screen derive from game.status, so session and hand
  // writes only update the board UI — patch them locally and skip the full reload; the
  // active→finished transition rides the games-row event, and the fallback poll reconciles.
  const applySessionRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as WhotSession
    const prev = sessionRef.current
    if (prev && next.updated_at < prev.updated_at) return true
    setSession(next)
    sessionRef.current = next
    return prev != null
  }, [])
  const applyHandRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as WhotPlayerHand
    setHands((prev) => {
      const i = prev.findIndex((h) => h.id === next.id)
      if (i === -1) return [...prev, next].sort((a, b) => a.player_order - b.player_order)
      const copy = [...prev]
      copy[i] = next
      return copy
    })
    return true
  }, [])

  // Realtime push: patch session + hands locally on plays (see above), reload for games/players.
  const connected = useGameTableSync(
    gameCode,
    [
      { table: 'games', column: 'id' },
      'players',
      { table: 'whot_sessions', apply: applySessionRow },
      { table: 'whot_player_hands', apply: applyHandRow },
    ],
    load
  )

  usePolling(() => load(), [gameCode, load], {
    intervalMs: POLL_INTERVALS.realtimeFallback,
    enabled: !connected,
    runImmediately: false,
  })

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

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      onHostSeatRemoved(playerId)
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [onHostSeatRemoved]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  const postHostAction = async (path: string, body: Record<string, unknown> = {}) => {
    if (!hostPlayerId) return
    if (!hostResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setHostActing(true)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      playWhotActionSound()
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

  const cfg = gameTypeConfig('whot')
  const joinUrl = `${appOrigin()}/game/${gameCode}`
  const canStart = players.filter((p) => p.spectator !== true).length >= WHOT_MIN_PLAYERS
  const turnPlayerId = session ? currentPlayerId(session) : null
  const turnPlayer = players.find((p) => p.id === turnPlayerId)
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const isHostTurn = turnPlayerId === hostPlayerId

  const { secondsLeft, hasTimer, urgent } = useWhotTurnTimer(gameCode, session, game?.status === 'active')
  const gameTimer = useWhotGameTimer(gameCode, game)

  const myHand = useMemo(() => {
    const row = hands.find((h) => h.player_id === hostPlayerId)
    return row?.cards ?? []
  }, [hands, hostPlayerId])

  useWhotNotifications({
    game,
    session,
    myPlayerId: hostPlayerId,
    myHandCount: myHand.length,
    enabled: hostPlays && game?.status === 'active',
  })

  const tableTimerProps = {
    turnPlayerName: turnPlayer?.name,
    isMyTurn: isHostTurn,
    secondsLeft,
    hasTimer,
    urgent,
  }

  const handCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const h of hands) {
      counts[h.player_id] = h.cards?.length ?? 0
    }
    return counts
  }, [hands])

  const drawDepleted = session ? isDrawPileDepleted(session) : false
  const whotRules = useMemo(() => parseWhotRules(game), [game])
  const hostCanPlay = session ? hasPlayableCard(myHand, session, whotRules) : false
  const pickPenalty = session ? getActivePickPenalty(session) : { type: null, count: 0 }

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  if (!game) {
    return <HostLobbySkeleton />
  }

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  // Primary tab: interactive board when the host is playing, read-only board otherwise.
  const interactivePlay = session && hostPlayerId && (
    <div className="space-y-3">
      <WhotGameTimerBar gameCode={gameCode} game={game} />
      <WhotTable
        session={session}
        players={players}
        myPlayerId={hostPlayerId}
        handCounts={handCounts}
        showStandings={false}
        {...tableTimerProps}
      />
      {isHostTurn && session.phase === 'choose_whot' && (
        <WhotChoosePanel
          acting={hostActing}
          allowNumberCalls={whotRules.numberCallsEnabled}
          onChooseShape={(shape: WhotShape) => void postHostAction('/api/whot/choose', { shape })}
          onChooseNumber={(number) => void postHostAction('/api/whot/choose', { number })}
        />
      )}
      {session.phase === 'playing' && (
        <>
          <WhotHand
            cards={myHand}
            session={session}
            acting={hostActing}
            rules={whotRules}
            onPlay={(cardId) => void postHostAction('/api/whot/play', { cardId })}
          />
          {isHostTurn && !(drawDepleted && hostCanPlay) && (
            <WhotPrimaryButton onClick={() => void postHostAction('/api/whot/draw')} loading={hostActing}>
              {drawDepleted
                ? 'Pass turn'
                : pickPenalty.type === 'pick2'
                  ? `Draw ${pickPenalty.count} (Pick 2)`
                  : pickPenalty.type === 'pick3'
                    ? `Draw ${pickPenalty.count} (Pick 3)`
                    : 'Draw 1 card'}
            </WhotPrimaryButton>
          )}
        </>
      )}
      {/* Roster sits BELOW the host's hand — the hand is what you act on, so it stays
          above the standings (mirrors the player view). */}
      <WhotCard className="p-4">
        <WhotStandings session={session} players={players} myPlayerId={hostPlayerId} handCounts={handCounts} />
      </WhotCard>
    </div>
  )

  const watchBoard = session ? (
    <div className="space-y-3">
      <WhotGameTimerBar gameCode={gameCode} game={game} />
      <WhotTable
        session={session}
        players={players}
        myPlayerId={hostPlayerId}
        handCounts={handCounts}
        {...tableTimerProps}
        isMyTurn={false}
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
      gameType="whot"
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
              boardGameType="whot"
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
            startDisabledHint={
              canStart
                ? null
                : `Need at least ${WHOT_MIN_PLAYERS} players to start (${players.length}/${WHOT_MIN_PLAYERS})`
            }
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

  // Active game → design-system room shell + the same play surface players see.
  // The marketing header + floating voice are gated out for card-table games
  // while active (see `useHostRoomChromeMode`), so the DS voice rail is the only
  // chrome — and it also owns the host actions: ⚙ Settings (icon), Transfer host
  // + End game (⋯ menu), Share (icon). No separate host-controls bar.
  if (game.status === 'active') {
    // End the game from the voice rail's ⋯ menu (RoomVoiceBar shows the confirm
    // sheet). Same endpoint the old inline "End game" button used.
    const endGame = async () => {
      try {
        const res = await fetch(`/api/games/${gameCode}/finish-game`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostToken }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toastError(data.error ?? 'Failed to end game')
          return
        }
        await load()
      } catch {
        toastError('Failed to end game')
      }
    }
    return (
      <HostRoomShell
        gameCode={gameCode}
        hostToken={hostToken}
        resumeToken={hostResumeToken ?? undefined}
        gameName={cfg.label}
        onEndGame={endGame}
        onSettings={() => setSettingsOpen(true)}
        hostMenuExtra={<TransferHostControl triggerClassName="ct-voice-menu-item" />}
        onEditName={renameHost}
      >
        {/* Whot's active state renders here instead of HostGameLayout, so mirror
            its host-rejoin banner: a host flipped to spectator mid-game (e.g. a
            play-again reset re-seats everyone) can promote back to a player. */}
        {(() => {
          const hostPlayer = hostPlayerId ? (players.find((p) => p.id === hostPlayerId) ?? null) : null
          return hostPlayer && playerIsViewer(hostPlayer, game) ? (
            <ViewerModeBanner
              gameCode={gameCode}
              playerId={hostPlayerId}
              game={game}
              player={hostPlayer}
              players={players}
              onPromoted={load}
            />
          ) : null
        })()}
        {session ? (
          <>
            {/* Host game settings (host+play toggle · Whot rules) — opened from
                the rail's ⚙ icon; a fixed sheet, so it can mount anywhere. */}
            <CardTableSettingsSheet
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              hostPlays={hostPlays}
              onModeChange={changeHostMode}
              // Seat is fixed once the game is active — this sheet only renders
              // mid-game, so the Play-as-yourself toggle is always locked here
              // (you can only take/drop a spot in the lobby).
              modeLocked
            >
              {manage}
            </CardTableSettingsSheet>
            <WhotPlaySurface
              session={session}
              players={players}
              myPlayerId={hostPlayerId}
              myHand={myHand}
              handCounts={handCounts}
              rules={whotRules}
              turnPlayerId={turnPlayerId}
              isMyTurn={hostPlays && isHostTurn}
              watching={!hostPlays}
              acting={hostActing}
              drawCount={session.draw_pile?.length ?? 0}
              drawDepleted={drawDepleted}
              myCanPlay={hostCanPlay}
              whotCallActive={hasActiveWhotCall(session)}
              pickPenalty={pickPenalty}
              turnTimer={{ secondsLeft, hasTimer, urgent }}
              gameTimer={gameTimer}
              onPlay={(cardId) => void postHostAction('/api/whot/play', { cardId })}
              onDraw={() => void postHostAction('/api/whot/draw')}
              onChooseShape={(shape) => void postHostAction('/api/whot/choose', { shape })}
              onChooseNumber={(number) => void postHostAction('/api/whot/choose', { number })}
            />
          </>
        ) : (
          <p className="turn-status g" style={{ textAlign: 'center', padding: 24 }}>
            Waiting for the round to begin…
          </p>
        )}
      </HostRoomShell>
    )
  }

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
          minPlayers={WHOT_MIN_PLAYERS}
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

  // Fresh lobby (not the active card-table room, and not the play-again ready-up flow).
  const waitingLobby = game.status === 'waiting' && !game.replay_pending
  if (waitingLobby) {
    return (
      <HostLobby
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        gameTypeLabel={cfg.label}
        players={players}
        maxPlayers={lobbyMaxPlayersFromGameClient('whot', game) ?? game.max_players}
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
              boardGameType="whot"
              playerCount={players.length}
              onGameUpdate={setGame}
            />
            <TransferHostControl triggerClassName="btn-secondary w-full flex items-center justify-center gap-2" />
          </>
        }
        onStart={() => void startGame()}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={
          canStart ? null : `Need at least ${WHOT_MIN_PLAYERS} players to start (${players.length}/${WHOT_MIN_PLAYERS})`
        }
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
      primary={<div className="max-w-lg mx-auto w-full">{hostPlays ? interactivePlay : watchBoard}</div>}
      manage={manage}
      finished={
        <>
          <WhotFinalResultsShareBlock
            game={game}
            players={players}
            hands={hands}
            session={session}
            winnerName={winner?.name}
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
              gameType="whot"
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
