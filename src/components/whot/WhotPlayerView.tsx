'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  WhotCard,
  WhotLoadingScreen,
  WhotPrimaryButton,
  WhotSecondaryButton,
  WhotShell,
} from '@/components/whot/WhotChrome'
import { WhotChoosePanel, WhotHand, WhotStandings, WhotTable } from '@/components/whot/WhotBoard'
import { LiveLeaderboardLayout } from '@/components/LiveLeaderboardLayout'
import { WhotGameTimerBar } from '@/components/whot/WhotGameTimerBar'
import { WhotFinalResultsShareBlock } from '@/components/whot/WhotFinalResultsShareBlock'
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
import type { Game, WhotPlayerHand, WhotSession, WhotShape } from '@/types'
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
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useWhotTurnTimer } from '@/hooks/useWhotTurnTimer'
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
  const turnPlayer = players.find((p) => p.id === turnPlayerId)
  const isMyTurn = myPlayerId != null && turnPlayerId === myPlayerId
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  const isOut = myHand.length === 0 && game?.status === 'active'
  const isWatching = isViewer || isOut

  const { secondsLeft, hasTimer, urgent } = useWhotTurnTimer(
    gameCode,
    session,
    game?.status === 'active' && screen === 'active'
  )

  useWhotNotifications({
    game,
    session,
    myPlayerId,
    myHandCount: myHand.length,
    enabled: game?.status === 'active' && screen === 'active',
  })

  const tableTimerProps = {
    turnPlayerName: turnPlayer?.name,
    isMyTurn: isMyTurn && !isWatching,
    secondsLeft,
    hasTimer,
    urgent,
  }

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
      </WhotShell>
    )
  }

  if (!session) return <WhotLoadingScreen />

  const myPlayer = activePlayer
  const myName = myPlayer?.name ?? ''

  if (isWatching) {
    return (
      <WhotShell title={game?.title} wide compact>
        {isOut && !isViewer ? (
          <div className="rounded-xl border border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] px-4 py-3 text-center text-sm text-body">
            <p className="font-semibold">You&apos;re out</p>
            <p className="text-muted text-xs mt-1">You played all your cards — watch until the game ends.</p>
          </div>
        ) : (
          <ViewerModeBanner gameCode={gameCode} playerId={myPlayerId} game={game} player={myPlayer} />
        )}
        {myPlayerId && myName && (
          <PlayerSessionControls
            gameCode={gameCode}
            playerId={myPlayerId}
            currentName={myName}
            onRenamed={() => void load()}
            onLeft={handlePlayerLeft}
          />
        )}
        <WhotGameTimerBar gameCode={gameCode} game={game} />
        <WhotTable
          session={session}
          players={players}
          myPlayerId={myPlayerId}
          handCounts={handCounts}
          {...tableTimerProps}
          isMyTurn={false}
        />
      </WhotShell>
    )
  }

  return (
    <WhotShell title={game?.title} wide compact>
      {myPlayerId && myName && (
        <PlayerSessionControls
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={myName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
        />
      )}

      <WhotGameTimerBar gameCode={gameCode} game={game} />

      {/* Play area on the left; the roster sits on the right on desktop (sm+) and
          stacks below the hand on mobile — matching the trivia leaderboard layout. */}
      <LiveLeaderboardLayout
        sidebar={
          <WhotCard className="p-4">
            <WhotStandings
              session={session}
              players={players}
              myPlayerId={myPlayerId}
              handCounts={handCounts}
              gridClassName="grid-cols-2 sm:grid-cols-1"
            />
          </WhotCard>
        }
      >
        <WhotTable
          session={session}
          players={players}
          myPlayerId={myPlayerId}
          handCounts={handCounts}
          showStandings={false}
          {...tableTimerProps}
        />

        {isMyTurn && session.phase === 'choose_whot' && (
          <WhotChoosePanel
            acting={acting}
            allowNumberCalls={whotRules.numberCallsEnabled}
            onChooseShape={(shape: WhotShape) => void postAction('/api/whot/choose', { shape })}
            onChooseNumber={(number) => void postAction('/api/whot/choose', { number })}
          />
        )}

        {session.phase === 'playing' && (
          <>
            {isMyTurn && (
              <p className="text-center text-xs text-muted px-2">
                {drawDepleted && myCanPlay
                  ? 'Draw pile empty — play a highlighted card.'
                  : drawDepleted && !myCanPlay
                    ? 'Draw pile empty — pass your turn if you cannot play.'
                    : pickPenalty.type === 'pick2'
                      ? 'Pick 2 active — play a 2 or draw the penalty.'
                      : pickPenalty.type === 'pick3'
                        ? 'Pick 3 active — play a 5 or draw the penalty.'
                        : whotCallActive
                          ? whotRules.whotCardsEnabled
                            ? 'Match the WHOT call, play WHOT to override it, or draw from the pile.'
                            : 'Match the WHOT call or draw from the pile.'
                          : 'Tap a highlighted card to play, or draw from the pile.'}
              </p>
            )}
            <WhotHand
              cards={myHand}
              session={session}
              acting={acting}
              rules={whotRules}
              onPlay={(cardId) => void postAction('/api/whot/play', { cardId })}
            />
            {isMyTurn && !(drawDepleted && myCanPlay) && (
              <WhotPrimaryButton onClick={() => void postAction('/api/whot/draw', {})} loading={acting}>
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

        {!isMyTurn && session.phase === 'playing' && (
          <WhotCard className="p-3 text-center text-sm text-muted">
            Waiting for {players.find((p) => p.id === turnPlayerId)?.name ?? 'next player'}…
          </WhotCard>
        )}
      </LiveLeaderboardLayout>
    </WhotShell>
  )
}
