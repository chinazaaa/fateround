'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WhotCard, WhotLoadingScreen, WhotSecondaryButton, WhotShell } from '@/components/whot/WhotChrome'
import { WhotPlaySurface } from '@/components/whot/WhotPlaySurface'
import { PlayerRoomShell } from '@/components/rooms/PlayerRoomShell'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { useRosterBase } from '@/components/roster/RosterDrawerContext'
import { WhotFinalResultsShareBlock } from '@/components/whot/WhotFinalResultsShareBlock'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { gameTypeConfig } from '@/lib/game-types'
import {
  currentPlayerId,
  getActivePickPenalty,
  hasActiveWhotCall,
  hasPlayableCard,
  isDrawPileDepleted,
  parseWhotRules,
  WHOT_MIN_PLAYERS,
} from '@/lib/whot'
import { supabase } from '@/lib/supabase'
import { WHOT_PLAYER_HANDS_SELECT, WHOT_SESSION_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, WhotPlayerHand, WhotSession } from '@/types'
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
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useWhotTurnTimer } from '@/hooks/useWhotTurnTimer'
import { useWhotGameTimer } from '@/hooks/useWhotGameTimer'
import { useWhotNotifications, playWhotActionSound } from '@/hooks/useWhotNotifications'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

export function WhotPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [session, setSession] = useState<WhotSession | null>(null)
  const sessionRef = useRef<WhotSession | null>(null)
  sessionRef.current = session
  const [hands, setHands] = useState<WhotPlayerHand[]>([])
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  const [acting, setActing] = useState(false)

  // Game-specific load: fetch the whot session + player hands (the shared game/players
  // fetch + session resolution lives in useGameViewBootstrap).
  const loadGameState = useCallback(async (): Promise<{ state: WhotSession | null; ok: boolean }> => {
    const [sessionRes, handsRes] = await Promise.all([
      supabase.from('whot_sessions').select(WHOT_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('whot_player_hands').select(WHOT_PLAYER_HANDS_SELECT).eq('game_id', gameCode).order('player_order'),
    ])
    const sessionData = supabasePollOk(sessionRes) ? (sessionRes.data as WhotSession | null) : null
    if (sessionData) setSession(sessionData)
    if (supabasePollOk(handsRes)) setHands((handsRes.data as WhotPlayerHand[]) ?? [])
    return { state: sessionData, ok: supabasePollOk(sessionRes, handsRes) }
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
    join,
  } = useGameViewBootstrap<Screen, WhotSession | null>({
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

  // Delta fast-path (dual-table). The screen is derived purely from game.status, so session
  // and hand writes only update the board/hand UI — patch them locally and skip the full
  // reload. The active→finished transition rides the games-row event (no apply → still
  // reloads), and the fallback poll stays the reconciliation net.
  const applySessionRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as WhotSession
    const prev = sessionRef.current
    if (prev && next.updated_at < prev.updated_at) return true // stale/reordered
    setSession(next)
    sessionRef.current = next
    return prev != null // first session still reloads (harmless; games event also covers start)
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
    return true // a hand change never changes the screen — always safe to skip the reload
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

  // Ready-up ring: readiness = holding a seat, so this reuses /players/ready (which
  // toggles the spectator flag). `ready:false` sits the player back out.
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
        playWhotActionSound()
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
    for (const h of hands) {
      counts[h.player_id] = h.cards?.length ?? 0
    }
    return counts
  }, [hands])

  const cfg = gameTypeConfig('whot')
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = myPlayerId != null && turnPlayerId === myPlayerId
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  // "Out" = we can see this player's dealt hand and it's now empty (they played their last
  // card and went out). Require the hand row to actually be loaded — after a network drop
  // `hands` can be briefly empty/unfetched, and treating a not-yet-loaded hand as empty would
  // flip a still-playing player into the watch-only UI until the next refetch.
  const isOut = !!myHandRow && myHand.length === 0 && game?.status === 'active'
  const isWatching = isViewer || isOut

  // Turn timer (per-player countdown) + game timer (overall duration). Both hooks
  // also drive side effects (deadline sync, auto-expire); their values render as
  // the seat countdown chip + the top game-time bar in the play surface.
  const turnTimer = useWhotTurnTimer(gameCode, session, game?.status === 'active' && screen === 'active')
  const gameTimer = useWhotGameTimer(gameCode, game)

  useWhotNotifications({
    game,
    session,
    myPlayerId,
    myHandCount: myHand.length,
    enabled: game?.status === 'active' && screen === 'active',
  })

  const drawDepleted = session ? isDrawPileDepleted(session) : false
  const whotRules = useMemo(() => parseWhotRules(game), [game])
  const myCanPlay = session ? hasPlayableCard(myHand, session, whotRules) : false
  const whotCallActive = session ? hasActiveWhotCall(session) : false
  const pickPenalty = session ? getActivePickPenalty(session) : { type: null, count: 0 }

  // Feed the roster side-drawer from THIS view's bootstrap (authoritative players +
  // myPlayerId) rather than the dispatcher's useGameSession copy — otherwise a
  // spectator's own row can miss the "· you" highlight when the two pipelines drift.
  // `PollGamePlayerExperience` skips its own registration for Whot (SELF_ROSTERING).
  useRosterBase(game?.status === 'active' ? players : undefined, game, myPlayerId)

  // Change name · Leave game for players/spectators live behind the main chrome's ⚙
  // gear (top header) — the in-room bar that used to hold them is gone. Registered
  // while the game is active; `GameChromeSettings` renders it inside the one sheet.
  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId || game?.status !== 'active') return null
    return (
      <div className="space-y-3">
        <EditNameInline
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={activePlayer?.name ?? roomDisplayName ?? ''}
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
  }, [myPlayerId, game?.status, gameCode, activePlayer?.name, roomDisplayName, isWatching, load, router])
  useRegisterGameSettings(playerSettingsNode)

  if (screen === 'loading') return <WhotLoadingScreen />

  if (screen === 'not_found') {
    return (
      <WhotShell title="Game not found">
        <WhotCard className="p-6 text-center">
          <p className="text-muted mb-4">This game code does not exist.</p>
          <WhotSecondaryButton onClick={() => router.push('/')}>Go home</WhotSecondaryButton>
        </WhotCard>
      </WhotShell>
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
            gameType="whot"
            subtitle={
              joiningAsViewer
                ? 'Game in progress — join as a viewer (read-only).'
                : '2–6 players · match shape or number'
            }
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          joining={joining}
          gameType="whot"
          submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
          label=""
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="whot" variant="subtle" />
            </p>
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'waiting') {
    const me = players.find((p) => p.id === myPlayerId)
    // "Play again · same settings" reopened the lobby with the ready-up ring.
    if (game?.replay_pending) {
      return (
        <WhotShell>
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={WHOT_MIN_PLAYERS}
            onToggleReady={(ready) => void toggleReplayReady(ready)}
            onStart={() => {}}
            pending={replayReadyPending}
            gameCode={gameCode}
            onLeft={handlePlayerLeft}
          />
        </WhotShell>
      )
    }
    return (
      <GameJoinLobbyShell gameCode={gameCode}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={me?.name ?? ''}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Waiting for the host to start"
          rulesLink={<GameRulesLink gameType="whot" variant="subtle" />}
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
      <WhotShell>
        {game ? (
          <WhotFinalResultsShareBlock
            game={game}
            players={players}
            hands={hands}
            session={session}
            winnerName={winner?.name}
            highlightPlayerId={myPlayerId}
          />
        ) : (
          <WhotCard className="py-10 text-center space-y-2">
            <div className="text-6xl mb-3">🏆</div>
            {winner && <p className="text-2xl font-black text-[var(--marry)]">{winner.name}</p>}
          </WhotCard>
        )}
        {myPlayerId && session?.winner_player_id === myPlayerId && (
          <PostWinToCommunity
            gameType="whot"
            gameCode={gameCode}
            winnerName={players.find((p) => p.id === myPlayerId)?.name ?? ''}
            roundKey={session?.id}
          />
        )}
      </WhotShell>
    )
  }

  if (!session) return <WhotLoadingScreen />

  // The active play surface mounts inside the design-system room frame, which
  // supplies the `.fr-room-poll` → `.pr-main` → `.pr-stage` layout the `.ct-surface`
  // needs. The room chrome is the app's fixed top header + the floating Join-voice pill.
  const roomShell = (children: React.ReactNode) => <PlayerRoomShell>{children}</PlayerRoomShell>

  if (isWatching) {
    return roomShell(
      <WhotPlaySurface
        session={session}
        players={players}
        myPlayerId={myPlayerId}
        myHand={myHand}
        handCounts={handCounts}
        rules={whotRules}
        turnPlayerId={turnPlayerId}
        isMyTurn={false}
        watching
        acting={acting}
        drawCount={session.draw_pile?.length ?? 0}
        drawDepleted={drawDepleted}
        myCanPlay={myCanPlay}
        whotCallActive={whotCallActive}
        pickPenalty={pickPenalty}
        turnTimer={turnTimer}
        gameTimer={gameTimer}
        onPlay={(cardId) => void postAction('/api/whot/play', { cardId })}
        onDraw={() => void postAction('/api/whot/draw', {})}
        onChooseShape={(shape) => void postAction('/api/whot/choose', { shape })}
        onChooseNumber={(number) => void postAction('/api/whot/choose', { number })}
      />
    )
  }

  return roomShell(
    <WhotPlaySurface
      session={session}
      players={players}
      myPlayerId={myPlayerId}
      myHand={myHand}
      handCounts={handCounts}
      rules={whotRules}
      turnPlayerId={turnPlayerId}
      isMyTurn={isMyTurn}
      acting={acting}
      drawCount={session.draw_pile?.length ?? 0}
      drawDepleted={drawDepleted}
      myCanPlay={myCanPlay}
      whotCallActive={whotCallActive}
      pickPenalty={pickPenalty}
      turnTimer={turnTimer}
      gameTimer={gameTimer}
      onPlay={(cardId) => void postAction('/api/whot/play', { cardId })}
      onDraw={() => void postAction('/api/whot/draw', {})}
      onChooseShape={(shape) => void postAction('/api/whot/choose', { shape })}
      onChooseNumber={(number) => void postAction('/api/whot/choose', { number })}
    />
  )
}
