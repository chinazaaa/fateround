'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
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
import { fetchWhotHands } from '@/lib/hands-client'
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
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import {
  useGamePlacements,
  useGameStats,
  useRosterBase,
  useRosterManage,
} from '@/components/roster/RosterDrawerContext'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { HostLeaveSeatButton } from '@/components/host/HostLeaveSeatButton'
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
  // The host's own player resume token WHEN they're seated and playing. Mirrored to a ref so the
  // hand fetch (defined before useHostSeat resolves it) can send it — a hostToken alone can't
  // unredact the host's own hand, so a playing host would otherwise see "0 cards". See load().
  const hostResumeTokenRef = useRef<string | null>(null)
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
      // Via /api/whot/hands. A watching host only gets counts — but a host who is SEATED AND
      // PLAYING needs their own cards, and the redaction route can only unredact via a resume
      // token (a hostToken resolves no viewer). So send the host's player resume token too when we
      // have one; without it a playing host sees "0 cards". The effect below re-fetches once the
      // token resolves (it's resolved by useHostSeat, after this callback is defined).
      fetchWhotHands(gameCode, { hostToken, resumeToken: hostResumeTokenRef.current ?? undefined }),
    ])
    if (!supabasePollOk(gameRes, plrsRes, sessionRes) || handsRes === null) return false
    setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setSession(sessionRes.data as WhotSession | null)
    setHands(handsRes)
    return true
  }, [gameCode, hostToken])

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
      // The host only ever needs counts, but once `cards` is revoked from anon the realtime
      // payload carries neither cards nor card_count — so carry the known count forward rather
      // than letting an opponent flicker to zero (which reads as "out").
      const merged: WhotPlayerHand = {
        ...next,
        card_count: next.card_count ?? (Array.isArray(next.cards) ? next.cards.length : prev[i]?.card_count),
      }
      if (i === -1) return [...prev, merged].sort((a, b) => a.player_order - b.player_order)
      const copy = [...prev]
      copy[i] = merged
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
    intervalMs: game?.status === 'waiting' ? POLL_INTERVALS.lobby : POLL_INTERVALS.realtimeFallback,
    enabled: game?.status === 'waiting' || !connected,
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
  hostResumeTokenRef.current = hostResumeToken

  // The first hand fetch runs before useHostSeat resolves the host's player token, so a playing
  // host's own hand comes back redacted ("0 cards"). Re-fetch with the token the moment it lands.
  useEffect(() => {
    if (!hostResumeToken || game?.status !== 'active') return
    let cancelled = false
    void fetchWhotHands(gameCode, { hostToken, resumeToken: hostResumeToken }).then((h) => {
      if (!cancelled && h) setHands(h)
    })
    return () => {
      cancelled = true
    }
  }, [hostResumeToken, game?.status, gameCode, hostToken])

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
      counts[h.player_id] = h.card_count ?? h.cards?.length ?? 0
    }
    return counts
  }, [hands])

  const drawDepleted = session ? isDrawPileDepleted(session) : false
  const whotRules = useMemo(() => parseWhotRules(game), [game])
  const hostCanPlay = session ? hasPlayableCard(myHand, session, whotRules) : false
  const pickPenalty = session ? getActivePickPenalty(session) : { type: null, count: 0 }

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  // Feed the shared roster side-drawer (opened from the header's people button)
  // while the game is active — the host sees the same who's-here list as players,
  // with a per-row Remove. This replaces the player list that used to live in the
  // host settings sheet. Mirrors HostGameLayout (used for the non-active paths).
  useRosterBase(game?.status === 'active' || game?.status === 'finished' ? players : undefined, game, hostPlayerId)
  const rosterRemove = useMemo(
    () => (row: { id: string; name: string }) => removePlayer(row.id, row.name),
    [removePlayer]
  )
  useRosterManage(game?.status === 'active' ? { hostPlayerId: hostPlayerId ?? null, onRemove: rosterRemove } : null)

  // Winner/runner-up medal pills on the roster drawer. finish_order lists players
  // in the order they emptied their hands (first out = winner); make sure the
  // declared winner is 1st even if they aren't in finish_order yet.
  const placements = useMemo(() => {
    const map: Record<string, number> = {}
    ;(session?.finish_order ?? []).forEach((id, i) => {
      map[id] = i + 1
    })
    const winnerId = session?.winner_player_id
    if (winnerId && !(winnerId in map)) map[winnerId] = 1
    return Object.keys(map).length ? map : null
  }, [session?.finish_order, session?.winner_player_id])
  useGamePlacements(placements)

  // Live card counts in the roster drawer scoreboard (only while playing).
  const rosterDetails = useMemo(() => {
    if (game?.status !== 'active') return null
    const out: Record<string, string> = {}
    for (const [id, n] of Object.entries(handCounts)) out[id] = `🃏 ${n} card${n === 1 ? '' : 's'}`
    return Object.keys(out).length ? out : null
  }, [handCounts, game?.status])
  useGameStats(rosterDetails)

  // Host game settings for the active room live behind the main chrome's ⚙ gear
  // (top header, beside Share) — not a separate in-room bar. Register the body
  // (late-join rules · How to play · End game) while the game is active;
  // `GameChromeSettings` renders it inside the one sheet, and it supplies the
  // universal "Edit your name" row itself. Players are managed from the roster
  // side-drawer, so there's no player list here.
  const hostSettingsNode = useMemo(() => {
    if (game?.status !== 'active') return null
    return (
      <div className="space-y-4">
        <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
        {hostMode === 'player' && !!hostPlayerId && (
          <HostLeaveSeatButton
            onLeave={leaveGameRemovePlayer}
            variant="remove"
            className="btn-secondary w-full py-3 text-base"
          />
        )}
        <HostRulesRow gameType="whot" />
        <HostEndGameButton
          gameCode={gameCode}
          hostToken={hostToken}
          onEnded={load}
          label="End game"
          icon={<ExitIcon size={14} />}
          confirmTitle="End this game?"
          confirmMessage="Everyone sees the final results. You can start a new game from the room afterward."
          className="btn-danger-soft w-full"
        />
      </div>
    )
  }, [game, gameCode, hostToken, setGame, load, hostMode, hostPlayerId, leaveGameRemovePlayer])
  useRegisterGameSettings(hostSettingsNode)

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
            icon={<ExitIcon size={14} />}
            confirmTitle="End this game early?"
            confirmMessage="The current game will end and players will see the results screen."
            className="btn-danger-soft"
          />
        ) : null
      }
    />
  )

  // Active game → design-system room frame + the same play surface players see.
  // The room chrome is the app's fixed top header (logo · roster · Share · ⚙) plus
  // the shared green floating Join-voice pill (mounted by the host page once Whot
  // no longer suppresses it). The host runs the room from the header's ⚙ gear —
  // its settings sheet holds Play-as-yourself, edit name, late-join rules, the
  // roster and End game (registered above via GameSettingsContext). No in-room bar.
  if (game.status === 'active') {
    return (
      <HostRoomShell>
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

  // Fresh lobby (not the active card-table room, and not the play-again ready-up flow).
  const waitingLobby = game.status === 'waiting' && !game.replay_pending
  if (waitingLobby) {
    return (
      <HostLobby
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        gameTypeLabel={cfg.label}
        titleMeta={<GameInfoChips game={game} className="mt-2" />}
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
