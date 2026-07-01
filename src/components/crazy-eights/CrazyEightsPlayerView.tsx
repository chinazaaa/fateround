'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CrazyEightsCard,
  CrazyEightsLoadingScreen,
  CrazyEightsPrimaryButton,
  CrazyEightsSecondaryButton,
  CrazyEightsShell,
} from '@/components/crazy-eights/CrazyEightsChrome'
import {
  CrazyEightsChoosePanel,
  CrazyEightsHand,
  CrazyEightsStandings,
  CrazyEightsTable,
} from '@/components/crazy-eights/CrazyEightsBoard'
import { LiveLeaderboardLayout } from '@/components/LiveLeaderboardLayout'
import { CrazyEightsGameTimerBar } from '@/components/crazy-eights/CrazyEightsGameTimerBar'
import { CrazyEightsFinalResultsShareBlock } from '@/components/crazy-eights/CrazyEightsFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { gameTypeConfig } from '@/lib/game-types'
import {
  currentPlayerId,
  getNormalizedPenalties,
  hasActiveSuitCall,
  hasPlayableCard,
  isDrawPileDepleted,
  parseCrazyEightsRules,
} from '@/lib/crazy-eights'
import { supabase } from '@/lib/supabase'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, CrazyEightsPlayerHand, CrazyEightsSession, CrazyEightsCalledSuit } from '@/types'
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
import { useCrazyEightsTurnTimer } from '@/hooks/useCrazyEightsTurnTimer'
import { useCrazyEightsNotifications, playCrazyEightsActionSound } from '@/hooks/useCrazyEightsNotifications'

const CRAZY8_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,direction,phase,draw_pile,discard_pile,top_card,required_suit,pick_two_stack,joker_penalty,status_message,winner_player_id,finish_order,turn_deadline_at,created_at,updated_at'
const CRAZY8_PLAYER_HANDS_SELECT = 'id,game_id,player_id,cards,player_order,created_at'

type Screen =
  'loading' | 'join' | 'game_started_waiting' | 'game_ended' | 'waiting' | 'active' | 'finished' | 'not_found'

export function CrazyEightsPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [session, setSession] = useState<CrazyEightsSession | null>(null)
  const [hands, setHands] = useState<CrazyEightsPlayerHand[]>([])
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  const [acting, setActing] = useState(false)

  // Game-specific load: fetch the crazy eights session + player hands (the shared
  // game/players fetch + session resolution lives in useGameViewBootstrap).
  const loadGameState = useCallback(async (): Promise<{ state: CrazyEightsSession | null; ok: boolean }> => {
    const [sessionRes, handsRes] = await Promise.all([
      supabase.from('crazy_eights_sessions').select(CRAZY8_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase
        .from('crazy_eights_player_hands')
        .select(CRAZY8_PLAYER_HANDS_SELECT)
        .eq('game_id', gameCode)
        .order('player_order'),
    ])
    const sessionData = supabasePollOk(sessionRes) ? (sessionRes.data as CrazyEightsSession | null) : null
    if (sessionData) setSession(sessionData)
    if (supabasePollOk(handsRes)) setHands((handsRes.data as CrazyEightsPlayerHand[]) ?? [])
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
  } = useGameViewBootstrap<Screen, CrazyEightsSession | null>({
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
  useGameTableSync(
    gameCode,
    ['players', { table: 'games', column: 'id' }, 'crazy_eights_sessions', 'crazy_eights_player_hands'],
    load
  )

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
        playCrazyEightsActionSound()
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

  const cfg = gameTypeConfig('crazy_eights')
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const turnPlayerId = session ? currentPlayerId(session) : null
  const turnPlayer = players.find((p) => p.id === turnPlayerId)
  const isMyTurn = myPlayerId != null && turnPlayerId === myPlayerId
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  const isOut = myHand.length === 0 && game?.status === 'active'
  const isWatching = isViewer || isOut

  const { secondsLeft, hasTimer, urgent } = useCrazyEightsTurnTimer(
    gameCode,
    session,
    game?.status === 'active' && screen === 'active'
  )

  useCrazyEightsNotifications({
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
  const crazyEightsRules = useMemo(() => parseCrazyEightsRules(game), [game])
  const myCanPlay = session ? hasPlayableCard(myHand, session, crazyEightsRules) : false
  const suitCallActive = session ? hasActiveSuitCall(session) : false
  const penalties = session ? getNormalizedPenalties(session) : { pickTwo: 0, jokerPenalty: 0 }

  if (screen === 'loading') return <CrazyEightsLoadingScreen />

  if (screen === 'not_found') {
    return (
      <CrazyEightsShell title="Game not found">
        <CrazyEightsCard className="p-6 text-center">
          <p className="text-muted mb-4">This game code does not exist.</p>
          <CrazyEightsSecondaryButton onClick={() => router.push('/')}>Go home</CrazyEightsSecondaryButton>
        </CrazyEightsCard>
      </CrazyEightsShell>
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
            gameType="crazy_eights"
            subtitle={
              joiningAsViewer ? 'Game in progress — join as a viewer (read-only).' : '2–6 players · match suit or rank'
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
              <GameRulesLink gameType="crazy_eights" variant="subtle" />
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
          rulesLink={<GameRulesLink gameType="crazy_eights" variant="subtle" />}
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
      <CrazyEightsShell title="Game over!" subtitle={winner ? `${winner.name} wins` : undefined}>
        {game ? (
          <CrazyEightsFinalResultsShareBlock
            game={game}
            players={players}
            hands={hands}
            session={session}
            winnerName={winner?.name}
            highlightPlayerId={myPlayerId}
          />
        ) : (
          <CrazyEightsCard className="py-10 text-center space-y-2">
            <div className="text-6xl mb-3">🏆</div>
            {winner && <p className="text-2xl font-black text-[var(--marry)]">{winner.name}</p>}
          </CrazyEightsCard>
        )}
        {myPlayerId && session?.winner_player_id === myPlayerId && (
          <PostWinToCommunity
            gameType="crazy_eights"
            gameCode={gameCode}
            winnerName={players.find((p) => p.id === myPlayerId)?.name ?? ''}
            roundKey={session?.id}
          />
        )}
      </CrazyEightsShell>
    )
  }

  if (!session) return <CrazyEightsLoadingScreen />

  const myPlayer = activePlayer
  const myName = myPlayer?.name ?? ''

  if (isWatching) {
    return (
      <CrazyEightsShell title={game?.title} wide compact>
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
        <CrazyEightsGameTimerBar gameCode={gameCode} game={game} />
        <CrazyEightsTable
          session={session}
          players={players}
          myPlayerId={myPlayerId}
          handCounts={handCounts}
          {...tableTimerProps}
          isMyTurn={false}
        />
      </CrazyEightsShell>
    )
  }

  return (
    <CrazyEightsShell title={game?.title} wide compact>
      {myPlayerId && myName && (
        <PlayerSessionControls
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={myName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
        />
      )}

      <CrazyEightsGameTimerBar gameCode={gameCode} game={game} />

      {/* Play area on the left; the roster sits on the right on desktop (sm+) and
          stacks below the hand on mobile — matching the trivia leaderboard layout. */}
      <LiveLeaderboardLayout
        sidebar={
          <CrazyEightsCard className="p-4">
            <CrazyEightsStandings
              session={session}
              players={players}
              myPlayerId={myPlayerId}
              handCounts={handCounts}
              gridClassName="grid-cols-2 sm:grid-cols-1"
            />
          </CrazyEightsCard>
        }
      >
        <CrazyEightsTable
          session={session}
          players={players}
          myPlayerId={myPlayerId}
          handCounts={handCounts}
          showStandings={false}
          {...tableTimerProps}
        />

        {isMyTurn && session.phase === 'choose_suit' && (
          <CrazyEightsChoosePanel
            acting={acting}
            onChooseSuit={(suit: CrazyEightsCalledSuit) => void postAction('/api/crazy-eights/choose', { suit })}
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
                    : penalties.pickTwo > 0
                      ? 'Pick 2 active — play a 2 or draw the penalty.'
                      : penalties.jokerPenalty > 0
                        ? 'Joker — draw the penalty, no defending.'
                        : suitCallActive
                          ? 'Match the called suit, play an 8 / Joker to name a new one, or draw from the pile.'
                          : 'Tap a highlighted card to play, or draw from the pile.'}
              </p>
            )}
            <CrazyEightsHand
              cards={myHand}
              session={session}
              acting={acting}
              rules={crazyEightsRules}
              onPlay={(cardId) => void postAction('/api/crazy-eights/play', { cardId })}
            />
            {isMyTurn && !(drawDepleted && myCanPlay) && (
              <CrazyEightsPrimaryButton onClick={() => void postAction('/api/crazy-eights/draw', {})} loading={acting}>
                {drawDepleted
                  ? 'Pass turn'
                  : penalties.pickTwo > 0
                    ? `Draw ${penalties.pickTwo} (Pick 2)`
                    : penalties.jokerPenalty > 0
                      ? `Draw ${penalties.jokerPenalty} (Joker)`
                      : 'Draw 1 card'}
              </CrazyEightsPrimaryButton>
            )}
          </>
        )}

        {!isMyTurn && session.phase === 'playing' && (
          <CrazyEightsCard className="p-3 text-center text-sm text-muted">
            Waiting for {players.find((p) => p.id === turnPlayerId)?.name ?? 'next player'}…
          </CrazyEightsCard>
        )}
      </LiveLeaderboardLayout>
    </CrazyEightsShell>
  )
}
