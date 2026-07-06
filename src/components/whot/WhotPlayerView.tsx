'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WhotCard, WhotLoadingScreen, WhotSecondaryButton, WhotShell } from '@/components/whot/WhotChrome'
import { WhotPlaySurface } from '@/components/whot/WhotPlaySurface'
import { PlayerRoomShell } from '@/components/rooms/PlayerRoomShell'
import { WhotFinalResultsShareBlock } from '@/components/whot/WhotFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { gameTypeConfig } from '@/lib/game-types'
import {
  currentPlayerId,
  getActivePickPenalty,
  hasActiveWhotCall,
  hasPlayableCard,
  isDrawPileDepleted,
  parseWhotRules,
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

  // Realtime push: reload on any change to this game's row + its tables.
  useGameTableSync(gameCode, [{ table: 'games', column: 'id' }, 'whot_sessions', 'whot_player_hands'], load)

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

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

  const myHand = useMemo(() => {
    const row = hands.find((h) => h.player_id === myPlayerId)
    return row?.cards ?? []
  }, [hands, myPlayerId])

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
  const isOut = myHand.length === 0 && game?.status === 'active'
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
      <WhotShell title="Game over!" subtitle={winner ? `${winner.name} wins` : undefined}>
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

  // The active play surface mounts inside the design-system room shell, which
  // supplies the `.fr-room-poll` → `.pr-main` → `.pr-stage` frame the `.ct-surface`
  // needs, with the top voice rail as the room chrome.
  const roomShell = (children: React.ReactNode) => (
    <PlayerRoomShell
      gameCode={gameCode}
      gameName={game?.title ?? cfg.label}
      playerName={activePlayer?.name ?? roomDisplayName}
      playerId={myPlayerId}
      onLeave={() => {
        clearPlayerSession(gameCode)
        router.push('/')
      }}
    >
      {children}
    </PlayerRoomShell>
  )

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
