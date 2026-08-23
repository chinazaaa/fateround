'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { RulesInPlaySection } from '@/components/game-lobby/RulesInPlaySection'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostBoardGameLobbyPanel } from '@/components/host-lobby/HostBoardGameLobbyPanel'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { TransferHostControl } from '@/components/TransferHostControl'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { gameTypeConfig } from '@/lib/game-types'
import {
  currentPlayerId,
  hasPlayableCard,
  isDrawPileDepleted,
  parseMultiPlayMode,
  unoTeammateId,
  unoPlayerSharesWin,
  UNO_MIN_PLAYERS,
  UNO_TEAM_PLAYERS,
} from '@/lib/uno'
import { supabase } from '@/lib/supabase'
import { fetchUnoHands } from '@/lib/hands-client'
import { mergeHandRow, pushedCardCount } from '@/lib/hand-rows'
import { GAME_SELECT, PLAYER_SELECT, UNO_SESSION_SELECT, isCompleteUnoSessionRow } from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useHostSeat } from '@/hooks/useHostSeat'
import type { Game, Player, UnoPlayerHand, UnoSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { ExitIcon } from '@/components/host/host-icons'
import { useUnoTurnTimer } from '@/hooks/useUnoTurnTimer'
import { useUnoGameTimer } from '@/hooks/useUnoGameTimer'
import { useUnoNotifications, playUnoActionSound } from '@/hooks/useUnoNotifications'
import { useUnoQuickChat } from '@/hooks/useUnoQuickChat'
import { UnoPlaySurface } from '@/components/uno/UnoPlaySurface'
import { HostRoomShell } from '@/components/host/HostRoomShell'
import {
  useGamePlacements,
  useGameStats,
  useRosterBase,
  useRosterManage,
} from '@/components/roster/RosterDrawerContext'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { HostLeaveSeatButton } from '@/components/host/HostLeaveSeatButton'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { playerIsViewer } from '@/lib/viewers'
import { UnoFinalResultsShareBlock } from '@/components/uno/UnoFinalResultsShareBlock'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'

type HostTab = 'play' | 'manage'

export function UnoHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<UnoSession | null>(null)
  const sessionRef = useRef<UnoSession | null>(null)
  sessionRef.current = session
  const [hands, setHands] = useState<UnoPlayerHand[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [hostActing, setHostActing] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')
  // The host's own SEAT token (they're a player too in "Host + play", the default since
  // 50109a2a). `hostToken` proves they run the board; only a resume token proves which seat is
  // theirs — `resolveHandViewer` deliberately returns null for a host token, so without this the
  // redaction route hands a playing host zero cards. Mirrored to a ref because `load` is defined
  // before `useHostSeat` resolves it; the effect below re-fetches once it lands.
  const hostResumeTokenRef = useRef<string | null>(null)

  useApplyGameTheme(game?.theme)
  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, sessionRes, handsRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('uno_sessions').select(UNO_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      // Via /api/uno/hands — opponents' hands come back as counts only (see lib/hand-redaction.ts).
      // The host's own seat is the exception: in "Host + play" they hold cards and must see them,
      // which needs their PLAYER resume token — a host token resolves no seat by design.
      fetchUnoHands(gameCode, { hostToken, resumeToken: hostResumeTokenRef.current }),
    ])
    if (!supabasePollOk(gameRes, plrsRes, sessionRes) || handsRes === null) return false
    setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setSession(sessionRes.data as UnoSession | null)
    setHands(handsRes)
    return true
  }, [gameCode, hostToken])

  useEffect(() => {
    load()
  }, [gameCode, load])

  useEffect(() => {
    if (game?.status === 'active') setTab('play')
    else if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  const applySessionRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as UnoSession
    const prev = sessionRef.current
    if (prev && next.updated_at < prev.updated_at) return true
    // Realtime UPDATE payloads drop unchanged TOAST-ed columns (draw_pile, discard_pile,
    // turn_order once they grow) — arrive as null and would wipe local state, leaving
    // canPlayCard() to read a stale/blank session and every card looks unplayable.
    // Discard and let the debounced full reload refetch the complete row.
    if (!isCompleteUnoSessionRow(row)) return false
    const merged = prev ? { ...prev, ...next } : next
    setSession(merged)
    sessionRef.current = merged
    return prev != null
  }, [])
  const applyHandRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as UnoPlayerHand
    // Once `cards` is revoked from anon the realtime payload carries neither cards nor a count,
    // so mergeHandRow can only carry the STALE count forward (never letting a hand flicker to
    // zero, which reads as "out"). Returning false then lets useGameTableSync run its debounced
    // reconciling reload, which is the only path that can learn the new count — without it every
    // roster count on the host board freezes for the rest of the game.
    setHands((prev) => mergeHandRow(prev, next))
    return pushedCardCount(next) !== null
  }, [])

  const connected = useGameTableSync(
    gameCode,
    [
      'players',
      { table: 'games', column: 'id' },
      { table: 'uno_sessions', apply: applySessionRow },
      { table: 'uno_player_hands', apply: applyHandRow },
    ],
    load
  )

  // In the lobby / play-again ring, joins + "ready" are players-only realtime events that
  // Supabase sometimes drops, leaving the host roster stale until a refresh (the `!connected`
  // poll never fires while the socket is healthy). Keep a short reconciling poll running there
  // even when connected; active play stays on the cheap disconnected-only poll.
  const hostInLobby = game?.status === 'waiting'
  usePolling(() => load(), [gameCode, load], {
    intervalMs: hostInLobby ? POLL_INTERVALS.lobby : POLL_INTERVALS.realtimeFallback,
    enabled: hostInLobby || !connected,
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
  hostResumeTokenRef.current = hostResumeToken ?? null

  // `load` runs before useHostSeat has resolved the host's seat, so the first hands fetch of a
  // "Host + play" game carries no resume token and the route redacts the host's OWN hand. Re-fetch
  // the moment the token lands, or the default host flow sits at zero cards and can never play.
  useEffect(() => {
    if (!hostResumeToken || game?.status !== 'active') return
    let cancelled = false
    void fetchUnoHands(gameCode, { hostToken, resumeToken: hostResumeToken }).then((h) => {
      if (!cancelled && h) setHands(h)
    })
    return () => {
      cancelled = true
    }
  }, [hostResumeToken, hostToken, game?.status, gameCode])

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
      playUnoActionSound()
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

  const cfg = gameTypeConfig('uno')
  const teamMode = game?.uno_team_mode === true
  const seatedCount = players.filter((p) => p.spectator !== true).length
  // Team-Up needs exactly 4 (2v2); classic UNO needs the usual minimum.
  const canStart = teamMode ? seatedCount === UNO_TEAM_PLAYERS : seatedCount >= UNO_MIN_PLAYERS
  const startHint = teamMode
    ? `Team-Up needs exactly ${UNO_TEAM_PLAYERS} players (${seatedCount}/${UNO_TEAM_PLAYERS})`
    : `Need at least ${UNO_MIN_PLAYERS} players to start (${players.length}/${UNO_MIN_PLAYERS})`
  const turnPlayerId = session ? currentPlayerId(session) : null
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const isHostTurn = turnPlayerId === hostPlayerId

  const { secondsLeft, hasTimer, urgent } = useUnoTurnTimer(gameCode, session, game?.status === 'active')
  const gameTimer = useUnoGameTimer(gameCode, game)

  const myHand = useMemo(() => {
    const row = hands.find((h) => h.player_id === hostPlayerId)
    return row?.cards ?? []
  }, [hands, hostPlayerId])

  // Team-Up: the host (when playing) sees their teammate's hand read-only.
  const partner = useMemo(() => {
    if (game?.uno_team_mode !== true || !session || !hostPlayerId || !hostPlays) return null
    const mateId = unoTeammateId(session.turn_order ?? [], hostPlayerId)
    if (!mateId) return null
    // A teammate who left mid-round is no longer a partner (their seat stays for parity).
    if ((session.left_player_ids ?? []).includes(mateId)) return null
    const mateCards = hands.find((h) => h.player_id === mateId)?.cards ?? []
    const mateName = players.find((p) => p.id === mateId)?.name ?? 'Partner'
    return { id: mateId, name: mateName, cards: mateCards }
  }, [game?.uno_team_mode, session, hostPlayerId, hostPlays, hands, players])

  // Team-Up quick messages — a host who plays inside a team gets the same
  // partner-private emote channel as a regular player.
  const {
    incoming: quickChatIncoming,
    send: sendQuickMessage,
    dismiss: dismissQuickMessage,
  } = useUnoQuickChat(gameCode, hostPlayerId, !!partner && hostPlays && game?.status === 'active')
  const quickChat = useMemo(() => {
    if (!partner?.id) return null
    return {
      incoming: quickChatIncoming,
      onDismiss: dismissQuickMessage,
      onSend: (messageId: string) => sendQuickMessage(partner.id, hostPlayerName ?? 'Partner', messageId),
    }
  }, [partner, quickChatIncoming, dismissQuickMessage, sendQuickMessage, hostPlayerName])

  useUnoNotifications({
    game,
    session,
    myPlayerId: hostPlayerId,
    myHandCount: myHand.length,
    enabled: hostPlays && game?.status === 'active',
    players,
  })

  const handCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const h of hands) counts[h.player_id] = h.card_count ?? h.cards?.length ?? 0
    return counts
  }, [hands])

  const drawDepleted = session ? isDrawPileDepleted(session) : false
  const hostCanPlay = session ? hasPlayableCard(myHand, session) : false
  const drawPenalty = session?.draw_penalty ?? 0

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  useRosterBase(game?.status === 'active' || game?.status === 'finished' ? players : undefined, game, hostPlayerId)
  const rosterRemove = useMemo(
    () => (row: { id: string; name: string }) => removePlayer(row.id, row.name),
    [removePlayer]
  )
  useRosterManage(game?.status === 'active' ? { hostPlayerId: hostPlayerId ?? null, onRemove: rosterRemove } : null)

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

  const rosterDetails = useMemo(() => {
    if (game?.status !== 'active') return null
    const out: Record<string, string> = {}
    for (const [id, n] of Object.entries(handCounts)) out[id] = `🃏 ${n} card${n === 1 ? '' : 's'}`
    return Object.keys(out).length ? out : null
  }, [handCounts, game?.status])
  useGameStats(rosterDetails)

  const hostSettingsNode = useMemo(() => {
    if (game?.status !== 'active') return null
    return (
      <div className="space-y-4">
        <RulesInPlaySection game={game} />
        <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
        {hostMode === 'player' && !!hostPlayerId && (
          <HostLeaveSeatButton
            onLeave={leaveGameRemovePlayer}
            variant="remove"
            className="btn-secondary w-full py-3 text-base"
          />
        )}
        <HostRulesRow gameType="uno" />
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
  }, [game, gameCode, hostToken, load, hostMode, hostPlayerId, leaveGameRemovePlayer])
  useRegisterGameSettings(hostSettingsNode)

  if (!game) {
    return <HostLobbySkeleton />
  }

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  const manage = (
    <HostManageSection
      game={game}
      players={players}
      highlightPlayerId={hostPlayerId}
      removingPlayerId={removingPlayerId}
      onRemovePlayer={removePlayer}
      gameType="uno"
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
            spectatorHint="Spectate"
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
              boardGameType="uno"
              playerCount={players.length}
              seatedCount={players.filter((p) => !p.spectator).length}
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
            startDisabledHint={canStart ? null : startHint}
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
  if (game.status === 'active') {
    return (
      <HostRoomShell>
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
          <UnoPlaySurface
            session={session}
            players={players}
            myPlayerId={hostPlayerId}
            myHand={myHand}
            handCounts={handCounts}
            turnPlayerId={turnPlayerId}
            isMyTurn={hostPlays && isHostTurn}
            watching={!hostPlays}
            acting={hostActing}
            drawCount={session.draw_count ?? 0}
            drawDepleted={drawDepleted}
            myCanPlay={hostCanPlay}
            drawPenalty={drawPenalty}
            turnTimer={{ secondsLeft, hasTimer, urgent }}
            gameTimer={gameTimer}
            onPlay={(cardId) => void postHostAction('/api/uno/play', { cardId })}
            onDraw={() => void postHostAction('/api/uno/draw')}
            onChooseColor={(color) => void postHostAction('/api/uno/choose', { color })}
            onChallenge={(challenge) => void postHostAction('/api/uno/challenge', { challenge })}
            onCallUno={() => void postHostAction('/api/uno/call-uno')}
            onSwap={(targetId) => void postHostAction('/api/uno/swap', { targetId })}
            onPass={() => void postHostAction('/api/uno/pass')}
            // Multi-Play is allowed in HS (spec update). Jump-In stays forced OFF in HS.
            multiPlayMode={parseMultiPlayMode(game.uno_multi_play_mode)}
            onPlayMulti={(cardIds) => void postHostAction('/api/uno/play-multi', { cardIds })}
            jumpInEnabled={game.uno_mode !== 'no_mercy' && game.uno_jump_in === true}
            onJumpIn={(cardId) => void postHostAction('/api/uno/jump-in', { cardId })}
            partner={partner}
            quickChat={quickChat}
            onTeamLeaveDecision={(decision) => void postHostAction('/api/uno/team-leave', { decision })}
          />
        ) : (
          <p className="turn-status g" style={{ textAlign: 'center', padding: 24 }}>
            Waiting for the round to begin…
          </p>
        )}
      </HostRoomShell>
    )
  }

  if (game.status === 'waiting' && game.replay_pending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-3 py-8 text-[var(--foreground)]">
        <ReplayReadyRing
          players={players}
          meId={hostPlayerId}
          isHost
          gameCode={gameCode}
          hostToken={hostToken}
          minPlayers={game?.uno_team_mode ? UNO_TEAM_PLAYERS : UNO_MIN_PLAYERS}
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
  if (waitingLobby) {
    return (
      <HostLobby
        gameCode={gameCode}
        hostToken={hostToken}
        resumeToken={hostResumeToken}
        game={game}
        gameTypeLabel={cfg.label}
        titleMeta={<GameInfoChips game={game} className="mt-2" />}
        players={players}
        maxPlayers={lobbyMaxPlayersFromGameClient('uno', game) ?? game.max_players}
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
              boardGameType="uno"
              playerCount={players.length}
              seatedCount={players.filter((p) => !p.spectator).length}
              onGameUpdate={setGame}
            />
            <TransferHostControl triggerClassName="btn-secondary w-full flex items-center justify-center gap-2" />
          </>
        }
        onStart={() => void startGame()}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={canStart ? null : startHint}
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
      primary={
        <div className="max-w-lg mx-auto w-full">
          <p className="text-muted text-sm text-center">Waiting for the round to begin…</p>
        </div>
      }
      manage={manage}
      noManageTab
      finished={
        <>
          <UnoFinalResultsShareBlock
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
          {hostPlayerId &&
            unoPlayerSharesWin(session?.turn_order ?? [], session?.winner_player_id, hostPlayerId, teamMode) && (
              <PostWinToCommunity
                gameType="uno"
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
