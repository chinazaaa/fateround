'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UnoCard, UnoLoadingScreen, UnoSecondaryButton, UnoShell } from '@/components/uno/UnoChrome'
import { UnoPlaySurface } from '@/components/uno/UnoPlaySurface'
import { PlayerRoomShell } from '@/components/rooms/PlayerRoomShell'
import { UnoFinalResultsShareBlock } from '@/components/uno/UnoFinalResultsShareBlock'
import { UnoRulePills } from '@/components/uno/UnoRulePills'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
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
import { UNO_SESSION_SELECT } from '@/lib/supabase-selects'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { supabase } from '@/lib/supabase'
import { fetchUnoHands } from '@/lib/hands-client'
import { clearPlayerSession, getPlayerSession } from '@/lib/utils'
import type { Game, UnoPlayerHand, UnoSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useUnoTurnTimer } from '@/hooks/useUnoTurnTimer'
import { useUnoGameTimer } from '@/hooks/useUnoGameTimer'
import { useUnoNotifications, playUnoActionSound } from '@/hooks/useUnoNotifications'
import { useUnoQuickChat } from '@/hooks/useUnoQuickChat'
import { useGamePlacements, useGameStats } from '@/components/roster/RosterDrawerContext'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

export function UnoPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [session, setSession] = useState<UnoSession | null>(null)
  const sessionRef = useRef<UnoSession | null>(null)
  sessionRef.current = session
  const [hands, setHands] = useState<UnoPlayerHand[]>([])
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  const [acting, setActing] = useState(false)

  const loadGameState = useCallback(async (): Promise<{ state: UnoSession | null; ok: boolean }> => {
    // Hands come from /api/uno/hands, not the table: other players' `cards` must never reach
    // this client (see lib/hand-redaction.ts). Own cards come back in full, everyone else's as
    // `card_count` — and in Team-Up mode the caller's teammate's hand also comes back in full.
    const [sessionRes, handsData] = await Promise.all([
      supabase.from('uno_sessions').select(UNO_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      // Read the token from the session store rather than the hook value: this callback is
      // defined before useGameViewBootstrap (which itself takes `load`), so closing over
      // myResumeToken here would be a cycle.
      fetchUnoHands(gameCode, { resumeToken: getPlayerSession(gameCode)?.resumeToken }),
    ])
    const sessionData = supabasePollOk(sessionRes) ? (sessionRes.data as UnoSession | null) : null
    if (sessionData) setSession(sessionData)
    // null = the fetch failed. Leave the previous hands in place rather than clearing them —
    // an empty hand is meaningful state here ("you are out"), so a transport blip must not
    // masquerade as one.
    if (handsData) setHands(handsData)
    return { state: sessionData, ok: supabasePollOk(sessionRes) && handsData !== null }
  }, [gameCode])

  const computeScreen = useCallback((gameData: Game, playerId: string | null): Screen => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'game_ended') return 'game_ended'
      return 'join'
    }
    if (gameData.status === 'waiting') return 'waiting'
    if (gameData.status === 'active') return 'active'
    return 'finished'
  }, [])

  const {
    screen,
    game,
    players,
    myPlayerId,
    setMyPlayerId,
    myResumeToken,
    joinName,
    setJoinName,
    joining,
    load,
    lobbyFull,
    join,
  } = useGameViewBootstrap<Screen, UnoSession | null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    joinExtras,
    onJoinError: toastError,
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  useApplyGameTheme(screen === 'game_ended' ? 'default' : game?.theme)

  const applySessionRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as UnoSession
    const prev = sessionRef.current
    if (prev && next.updated_at < prev.updated_at) return true
    setSession(next)
    sessionRef.current = next
    return prev != null
  }, [])
  const applyHandRow = useCallback(
    (row: Record<string, unknown>): boolean => {
      const next = row as unknown as UnoPlayerHand
      // Once `cards` is revoked from anon, realtime payloads carry no cards at all. Applying
      // one verbatim to OUR OWN row would blank the hand — and because `isOut` is derived from
      // an empty hand, it would read as "you are out" mid-game. In Team-Up the same is true of
      // the teammate's row: we're authorized to see their cards (the route returns them), but a
      // redacted realtime payload would blank the partner panel until the next full load. So for
      // either our own or our teammate's redacted row, re-fetch through the authorized route
      // instead of applying the payload.
      const teammateId =
        game?.uno_team_mode === true && myPlayerId
          ? unoTeammateId(sessionRef.current?.turn_order ?? [], myPlayerId)
          : null
      const isSelfOrTeammate = next.player_id === myPlayerId || next.player_id === teammateId
      if (isSelfOrTeammate && myPlayerId && !Array.isArray(next.cards)) {
        void fetchUnoHands(gameCode, { resumeToken: getPlayerSession(gameCode)?.resumeToken }).then((hands) => {
          if (hands) setHands(hands)
        })
        return true
      }
      setHands((prev) => {
        const i = prev.findIndex((h) => h.id === next.id)
        // Carry a known count forward when the payload omits it, so an opponent never
        // momentarily renders as holding zero cards.
        const merged: UnoPlayerHand = {
          ...next,
          card_count: next.card_count ?? (Array.isArray(next.cards) ? next.cards.length : prev[i]?.card_count),
        }
        if (i === -1) return [...prev, merged].sort((a, b) => a.player_order - b.player_order)
        const copy = [...prev]
        copy[i] = merged
        return copy
      })
      return true
    },
    [gameCode, myPlayerId, game?.uno_team_mode]
  )

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

  // In the lobby / play-again ring, a join or "ready" is a players-only realtime event —
  // and Supabase postgres_changes occasionally drops those, leaving the roster stale until a
  // manual refresh (the `!connected` safety poll never fires while the socket is healthy). So
  // keep a short reconciling poll running there even when connected. Active play is kept on the
  // cheap disconnected-only poll — its frequent session/hand events already keep it fresh.
  const inLobby = screen === 'waiting' || screen === 'game_started_waiting'
  usePolling(() => load(), [gameCode, load], {
    intervalMs: inLobby ? POLL_INTERVALS.lobby : POLL_INTERVALS.realtimeFallback,
    enabled: inLobby || !connected,
    runImmediately: false,
  })

  const [replayReadyPending, setReplayReadyPending] = useState(false)
  const toggleReplayReady = useCallback(
    async (ready: boolean) => {
      if (!myResumeToken) {
        toastError('Your player session expired — rejoin to continue')
        return
      }
      setReplayReadyPending(true)
      try {
        const res = await fetch('/api/players/ready', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, ready }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to update ready')
        await load()
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Failed to update ready')
      } finally {
        setReplayReadyPending(false)
      }
    },
    [gameCode, myResumeToken, load, toastError]
  )

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting') void load()
  })

  useRoomMemberAutoJoin({
    gameCode,
    displayName: roomDisplayName,
    resolving: resolvingRoomMember,
    screen,
    gameStatus: game?.status,
    hasPlayerSession: !!myPlayerId,
    joining,
    onJoin: (name) => join({ name }),
  })

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    void load()
  }

  const postAction = async (path: string, body: Record<string, unknown>) => {
    if (!myPlayerId) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setActing(true)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, ...body }),
      })
      const data = await res.json()
      if (!res.ok) toastError(data.error ?? 'Action failed')
      else {
        playUnoActionSound()
        await load()
      }
    } finally {
      setActing(false)
    }
  }

  const myHandRow = useMemo(() => hands.find((h) => h.player_id === myPlayerId), [hands, myPlayerId])
  const myHand = useMemo(() => myHandRow?.cards ?? [], [myHandRow])

  const handCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const h of hands) counts[h.player_id] = h.card_count ?? h.cards?.length ?? 0
    return counts
  }, [hands])

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

  const cfg = gameTypeConfig('uno')
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = myPlayerId != null && turnPlayerId === myPlayerId
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  const isOut = !!myHandRow && myHand.length === 0 && game?.status === 'active'
  const isWatching = isViewer || isOut

  // Team-Up: your teammate's hand is visible to you (read-only), never to opponents.
  const partner = useMemo(() => {
    if (game?.uno_team_mode !== true || !session || !myPlayerId || isWatching) return null
    const mateId = unoTeammateId(session.turn_order ?? [], myPlayerId)
    if (!mateId) return null
    // A teammate who left mid-round is no longer a partner (their seat stays for parity).
    if ((session.left_player_ids ?? []).includes(mateId)) return null
    const mateCards = hands.find((h) => h.player_id === mateId)?.cards ?? []
    const mateName = players.find((p) => p.id === mateId)?.name ?? 'Partner'
    return { id: mateId, name: mateName, cards: mateCards }
  }, [game?.uno_team_mode, session, myPlayerId, isWatching, hands, players])

  // Team-Up quick messages — a partner-private "emote" channel (colours / values /
  // actions). Ephemeral broadcast, only active while a live partner exists.
  const quickChatEnabled = !!partner && game?.status === 'active' && screen === 'active'
  const {
    incoming: quickChatIncoming,
    send: sendQuickMessage,
    dismiss: dismissQuickMessage,
  } = useUnoQuickChat(gameCode, myPlayerId, quickChatEnabled)
  const quickChat = useMemo(() => {
    if (!partner?.id) return null
    return {
      incoming: quickChatIncoming,
      onDismiss: dismissQuickMessage,
      onSend: (messageId: string) => sendQuickMessage(partner.id, activePlayer?.name ?? 'Partner', messageId),
    }
  }, [partner, quickChatIncoming, dismissQuickMessage, sendQuickMessage, activePlayer?.name])

  const turnTimer = useUnoTurnTimer(gameCode, session, game?.status === 'active' && screen === 'active')
  const gameTimer = useUnoGameTimer(gameCode, game)

  useUnoNotifications({
    game,
    session,
    myPlayerId,
    myHandCount: myHand.length,
    enabled: game?.status === 'active' && screen === 'active',
  })

  const drawDepleted = session ? isDrawPileDepleted(session) : false
  const myCanPlay = session ? hasPlayableCard(myHand, session) : false
  const drawPenalty = session?.draw_penalty ?? 0

  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId) return null
    return (
      <div className="space-y-3">
        <EditNameInline
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={activePlayer?.name ?? ''}
          onRenamed={() => void load()}
          spectating={isWatching}
        />
        <LeaveGameButton
          gameCode={gameCode}
          playerId={myPlayerId}
          onLeft={() => {
            clearPlayerSession(gameCode)
            router.push('/')
          }}
          confirmMessage="You can rejoin with your player code if the host opens the lobby again."
        />
      </div>
    )
  }, [myPlayerId, gameCode, activePlayer?.name, isWatching, load, router])
  useRegisterGameSettings(playerSettingsNode)

  if (screen === 'loading') return <UnoLoadingScreen />

  if (screen === 'not_found') {
    return (
      <UnoShell title="Game not found">
        <UnoCard className="p-6 text-center">
          <p className="text-muted mb-4">This game code does not exist.</p>
          <UnoSecondaryButton onClick={() => router.push('/')}>Go home</UnoSecondaryButton>
        </UnoCard>
      </UnoShell>
    )
  }

  if (screen === 'game_started_waiting' && game) {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => void load()} />
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'join') {
    if (resolvingRoomMember) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted text-lg">Joining from your game room…</p>
        </div>
      )
    }

    const joiningAsViewer = game?.status === 'active'
    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        header={
          <GameJoinHeader
            emoji="🃏"
            title={game?.title ?? cfg.label}
            gameType="uno"
            subtitle={
              joiningAsViewer
                ? 'Game in progress — join as a viewer (read-only).'
                : game?.uno_team_mode
                  ? 'Team-Up · 4 players in 2 teams of 2'
                  : '2–10 players · match colour or number'
            }
            meta={game ? <GameInfoChips game={game} /> : null}
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          lobbyFull={lobbyFull}
          onJoinAsViewer={() => void join({ joinAsViewer: true })}
          joining={joining}
          gameType="uno"
          submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
          label=""
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="uno" variant="subtle" />
            </p>
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'waiting') {
    const me = players.find((p) => p.id === myPlayerId)
    if (game?.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode}>
          {game ? <UnoRulePills game={game} className="mb-4" /> : null}
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={game?.uno_team_mode ? UNO_TEAM_PLAYERS : UNO_MIN_PLAYERS}
            capacityGame={game}
            onToggleReady={(ready) => void toggleReplayReady(ready)}
            onStart={() => {}}
            pending={replayReadyPending}
            gameCode={gameCode}
            onLeft={handlePlayerLeft}
          />
        </GameJoinLobbyShell>
      )
    }
    return (
      <GameJoinLobbyShell gameCode={gameCode}>
        {game ? <UnoRulePills game={game} className="mb-4" /> : null}
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          capacityGame={game}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={me?.name ?? ''}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Waiting for the host to start"
          rulesLink={<GameRulesLink gameType="uno" variant="subtle" />}
          isSpectator={me?.spectator === true}
          onReady={async () => {
            if (!myResumeToken) return
            await fetch('/api/players/ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
            })
            await load()
          }}
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'finished') {
    return (
      <UnoShell title="Game over!" subtitle={winner ? `${winner.name} wins` : undefined}>
        {game ? (
          <UnoFinalResultsShareBlock
            game={game}
            players={players}
            hands={hands}
            session={session}
            winnerName={winner?.name}
            highlightPlayerId={myPlayerId}
          />
        ) : (
          <UnoCard className="py-10 text-center space-y-2">
            <div className="text-6xl mb-3">🏆</div>
            {winner && <p className="text-2xl font-black text-[var(--marry)]">{winner.name}</p>}
          </UnoCard>
        )}
        {myPlayerId &&
          unoPlayerSharesWin(
            session?.turn_order ?? [],
            session?.winner_player_id,
            myPlayerId,
            game?.uno_team_mode === true
          ) && (
            <PostWinToCommunity
              gameType="uno"
              gameCode={gameCode}
              winnerName={players.find((p) => p.id === myPlayerId)?.name ?? ''}
              roundKey={session?.id}
            />
          )}
      </UnoShell>
    )
  }

  if (!session) return <UnoLoadingScreen />

  const surface = (
    <UnoPlaySurface
      session={session}
      players={players}
      myPlayerId={myPlayerId}
      myHand={myHand}
      handCounts={handCounts}
      turnPlayerId={turnPlayerId}
      isMyTurn={isMyTurn && !isWatching}
      watching={isWatching}
      acting={acting}
      drawCount={session.draw_pile?.length ?? 0}
      drawDepleted={drawDepleted}
      myCanPlay={myCanPlay}
      drawPenalty={drawPenalty}
      turnTimer={turnTimer}
      gameTimer={gameTimer}
      onPlay={(cardId) => void postAction('/api/uno/play', { cardId })}
      onDraw={() => void postAction('/api/uno/draw', {})}
      onChooseColor={(color) => void postAction('/api/uno/choose', { color })}
      onChallenge={(challenge) => void postAction('/api/uno/challenge', { challenge })}
      onCallUno={() => void postAction('/api/uno/call-uno', {})}
      onSwap={(targetId) => void postAction('/api/uno/swap', { targetId })}
      onPass={() => void postAction('/api/uno/pass', {})}
      multiPlayMode={parseMultiPlayMode(game?.uno_multi_play_mode)}
      onPlayMulti={(cardIds) => void postAction('/api/uno/play-multi', { cardIds })}
      jumpInEnabled={game?.uno_jump_in === true}
      onJumpIn={(cardId) => void postAction('/api/uno/jump-in', { cardId })}
      partner={partner}
      quickChat={quickChat}
      onTeamLeaveDecision={(decision) => void postAction('/api/uno/team-leave', { decision })}
    />
  )

  return <PlayerRoomShell>{surface}</PlayerRoomShell>
}
