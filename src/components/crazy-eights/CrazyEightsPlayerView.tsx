'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CrazyEightsCard,
  CrazyEightsLoadingScreen,
  CrazyEightsPrimaryButton,
  CrazyEightsSecondaryButton,
  CrazyEightsShell,
} from '@/components/crazy-eights/CrazyEightsChrome'
import { CrazyEightsChoosePanel, CrazyEightsHand, CrazyEightsTable } from '@/components/crazy-eights/CrazyEightsBoard'
import { CrazyEightsGameTimerBar } from '@/components/crazy-eights/CrazyEightsGameTimerBar'
import { CrazyEightsFinalResultsShareBlock } from '@/components/crazy-eights/CrazyEightsFinalResultsShareBlock'
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
import { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import { resolvePlayerSession } from '@/lib/player-resume'
import type { Game, Player, CrazyEightsPlayerHand, CrazyEightsSession, CrazyEightsCalledSuit } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
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
  'id,game_id,turn_order,current_turn_index,direction,phase,draw_pile,discard_pile,top_card,required_suit,pick_two_stack,joker_penalty,status_message,winner_player_id,turn_deadline_at,created_at,updated_at'
const CRAZY8_PLAYER_HANDS_SELECT = 'id,game_id,player_id,cards,player_order,created_at'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

export function CrazyEightsPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<CrazyEightsSession | null>(null)
  const [hands, setHands] = useState<CrazyEightsPlayerHand[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myResumeToken, setMyResumeToken] = useState<string | null>(null)
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  const [acting, setActing] = useState(false)

  useApplyGameTheme(screen === 'game_ended' ? 'default' : game?.theme)

  const syncScreen = useCallback((gameData: Game, playerId: string | null) => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') {
        setScreen('game_started_waiting')
        return
      }
      if (pre === 'game_ended') {
        setScreen('game_ended')
        return
      }
      setScreen('join')
      return
    }
    if (gameData.status === 'waiting') {
      setScreen('waiting')
      return
    }
    if (gameData.status === 'active') {
      setScreen('active')
      return
    }
    setScreen('finished')
  }, [])

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, sessionRes, handsRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('crazy_eights_sessions').select(CRAZY8_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase
        .from('crazy_eights_player_hands')
        .select(CRAZY8_PLAYER_HANDS_SELECT)
        .eq('game_id', gameCode)
        .order('player_order'),
    ])
    if (!supabasePollOk(gameRes, plrsRes, sessionRes, handsRes)) return false

    const gameData = gameRes.data
    const plrs = plrsRes.data

    if (!gameData) {
      setScreen('not_found')
      return true
    }

    setGame(gameData)
    setPlayers(plrs ?? [])
    setSession(sessionRes.data as CrazyEightsSession | null)
    setHands((handsRes.data as CrazyEightsPlayerHand[]) ?? [])

    const session = await resolvePlayerSession(gameCode, plrs)
    const playerId = session?.playerId ?? null
    if (session) {
      setMyPlayerId(session.playerId)
    } else {
      setMyPlayerId(null)
    }
    setMyResumeToken(session?.resumeToken ?? null)

    syncScreen(gameData, playerId)
    return true
  }, [gameCode, syncScreen])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`crazy-eights-player-${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crazy_eights_sessions', filter: `game_id=eq.${gameCode}` },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crazy_eights_player_hands', filter: `game_id=eq.${gameCode}` },
        () => void load()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting') void load()
  })

  const join = useCallback(
    async (opts?: { joinAsViewer?: boolean; name?: string }) => {
      const name = (opts?.name ?? joinName).trim()
      if (!name) return
      setJoining(true)
      try {
        const res = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameCode,
            playerName: name,
            ...joinExtras,
            ...(game?.status === 'active' ? { joinAsViewer: opts?.joinAsViewer ?? true } : {}),
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toastError(data.error ?? 'Failed to join')
          return
        }
        setPlayerSession(gameCode, data.playerId, data.playerName, 'both', data.resumeToken)
        setMyPlayerId(data.playerId)
        setMyResumeToken(data.resumeToken ?? null)
        await load()
      } finally {
        setJoining(false)
      }
    },
    [game?.status, gameCode, joinExtras, joinName, load, toastError]
  )

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

      <CrazyEightsTable
        session={session}
        players={players}
        myPlayerId={myPlayerId}
        handCounts={handCounts}
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
    </CrazyEightsShell>
  )
}
