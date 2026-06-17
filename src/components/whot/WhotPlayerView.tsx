'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  WhotCard,
  WhotLoadingScreen,
  WhotPrimaryButton,
  WhotSecondaryButton,
  WhotShell,
} from '@/components/whot/WhotChrome'
import { WhotChoosePanel, WhotHand, WhotTable } from '@/components/whot/WhotBoard'
import { WhotGameTimerBar } from '@/components/whot/WhotGameTimerBar'
import { gameTypeConfig } from '@/lib/game-types'
import { currentPlayerId, hasPlayableCard, isDrawPileDepleted } from '@/lib/whot'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT, WHOT_PLAYER_HANDS_SELECT, WHOT_SESSION_SELECT } from '@/lib/supabase-selects'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import type { Game, Player, WhotPlayerHand, WhotSession, WhotShape } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { ShareGameLinkCard } from '@/components/ShareGameLinkCard'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useWhotTurnTimer } from '@/hooks/useWhotTurnTimer'
import { useWhotNotifications, playWhotActionSound } from '@/hooks/useWhotNotifications'

type Screen = 'loading' | 'join' | 'game_started_waiting' | 'waiting' | 'active' | 'finished' | 'not_found'

export function WhotPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<WhotSession | null>(null)
  const [hands, setHands] = useState<WhotPlayerHand[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const [acting, setActing] = useState(false)

  useApplyGameTheme(game?.theme)

  const syncScreen = useCallback((gameData: Game, playerId: string | null) => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') {
        setScreen('game_started_waiting')
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
      supabase.from('whot_sessions').select(WHOT_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('whot_player_hands').select(WHOT_PLAYER_HANDS_SELECT).eq('game_id', gameCode).order('player_order'),
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
    setSession(sessionRes.data as WhotSession | null)
    setHands((handsRes.data as WhotPlayerHand[]) ?? [])

    const stored = getPlayerSession(gameCode)
    let playerId = stored?.playerId ?? null
    if (stored && plrs && !plrs.some((p) => p.id === stored.playerId)) {
      clearPlayerSession(gameCode)
      playerId = null
      setMyPlayerId(null)
    } else if (stored) {
      setMyPlayerId(stored.playerId)
    }

    syncScreen(gameData, playerId)
    return true
  }, [gameCode, syncScreen])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`whot-player-${gameCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whot_sessions', filter: `game_id=eq.${gameCode}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whot_player_hands', filter: `game_id=eq.${gameCode}` }, () => void load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting') void load()
  })

  const join = async () => {
    if (!joinName.trim()) return
    setJoining(true)
    try {
      const joiningAsViewer = game?.status === 'active'
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameCode,
          playerName: joinName.trim(),
          ...(joiningAsViewer ? { joinAsViewer: true } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Failed to join')
        return
      }
      setPlayerSession(gameCode, data.playerId, data.playerName, 'both')
      setMyPlayerId(data.playerId)
      await load()
    } finally {
      setJoining(false)
    }
  }

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    void load()
  }

  const postAction = async (path: string, body: Record<string, unknown>) => {
    if (!myPlayerId) return
    setActing(true)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId, ...body }),
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

  const { secondsLeft, hasTimer, urgent } = useWhotTurnTimer(
    gameCode,
    session,
    game?.status === 'active' && screen === 'active'
  )

  useWhotNotifications({
    game,
    session,
    myPlayerId,
    enabled: game?.status === 'active' && screen === 'active',
  })

  const tableTimerProps = {
    turnPlayerName: turnPlayer?.name,
    isMyTurn: isMyTurn && !isViewer,
    secondsLeft,
    hasTimer,
    urgent,
  }

  const drawDepleted = session ? isDrawPileDepleted(session) : false
  const myCanPlay = session ? hasPlayableCard(myHand, session) : false

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

  if (screen === 'join') {
    const joiningAsViewer = game?.status === 'active'
    return (
      <WhotShell title={game?.title ?? cfg.label} subtitle="Enter your name to join">
        <WhotCard className="p-6 space-y-5 max-w-md mx-auto">
          <div className="text-center">
            <div className="text-5xl mb-3">🃏</div>
            <p className="text-sm text-muted">
              {joiningAsViewer
                ? 'Game in progress — join as a viewer (read-only).'
                : '2–6 players · match shape or number'}
            </p>
          </div>
          <input
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="Your name"
            className="input-field w-full"
            maxLength={40}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
          <WhotPrimaryButton onClick={() => void join()} disabled={!joinName.trim()} loading={joining}>
            {joiningAsViewer ? 'Join as viewer' : 'Join game'}
          </WhotPrimaryButton>
        </WhotCard>
        <p className="text-center">
          <GameRulesLink gameType="whot" variant="subtle" />
        </p>
        <ShareGameLinkCard gameCode={gameCode} className="max-w-md mx-auto" />
      </WhotShell>
    )
  }

  if (screen === 'waiting') {
    const myName = players.find((p) => p.id === myPlayerId)?.name ?? ''
    return (
      <WhotShell title={game?.title} subtitle="Waiting for the host to start">
        <WhotCard className="p-4 text-center">
          <p className="text-3xl font-black text-[var(--primary)]">{players.length}</p>
          <p className="text-sm text-muted">
            {players.length} player{players.length === 1 ? '' : 's'} in the lobby
          </p>
        </WhotCard>
        {myPlayerId && myName && (
          <PlayerSessionControls
            gameCode={gameCode}
            playerId={myPlayerId}
            currentName={myName}
            onRenamed={() => void load()}
            onLeft={handlePlayerLeft}
            inLobby
          />
        )}
        <p className="text-center">
          <GameRulesLink gameType="whot" variant="subtle" />
        </p>
        <ShareGameLinkCard gameCode={gameCode} />
      </WhotShell>
    )
  }

  if (screen === 'finished') {
    return (
      <WhotShell title="Game over!" subtitle={winner ? `${winner.name} wins` : undefined}>
        <WhotCard className="py-10 text-center space-y-2">
          <div className="text-6xl mb-3">🏆</div>
          {winner && <p className="text-2xl font-black text-[var(--marry)]">{winner.name}</p>}
          {session?.status_message && (
            <p className="text-sm text-muted max-w-sm mx-auto">{session.status_message}</p>
          )}
          <p className="text-sm text-muted mt-2">First to empty their hand wins — or lowest hand total when time runs out</p>
        </WhotCard>
        <WhotSecondaryButton onClick={() => router.push('/games')}>Create a new game</WhotSecondaryButton>
      </WhotShell>
    )
  }

  if (!session) return <WhotLoadingScreen />

  const myPlayer = activePlayer
  const myName = myPlayer?.name ?? ''

  if (isViewer) {
    return (
      <WhotShell title={game?.title} wide compact>
        <ViewerModeBanner gameCode={gameCode} playerId={myPlayerId} game={game} player={myPlayer} />
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

      <WhotTable
        session={session}
        players={players}
        myPlayerId={myPlayerId}
        handCounts={handCounts}
        {...tableTimerProps}
      />

      {isMyTurn && session.phase === 'choose_whot' && (
        <WhotChoosePanel
          acting={acting}
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
                  : (session.pick_two_stack ?? 0) > 0
                    ? 'Pick 2 active — play a 2, play WHOT, or draw the penalty.'
                    : (session.pick_five_stack ?? 0) > 0
                      ? 'Pick 3 active — play a 5, play WHOT, or draw the penalty.'
                      : 'Tap a highlighted card to play, or draw from the pile.'}
            </p>
          )}
          <WhotHand
            cards={myHand}
            session={session}
            acting={acting}
            onPlay={(cardId) => void postAction('/api/whot/play', { cardId })}
          />
          {isMyTurn && !(drawDepleted && myCanPlay) && (
            <WhotPrimaryButton
              onClick={() => void postAction('/api/whot/draw', {})}
              loading={acting}
            >
              {drawDepleted
                ? 'Pass turn'
                : (session.pick_two_stack ?? 0) > 0
                  ? `Draw ${session.pick_two_stack} (Pick 2)`
                  : (session.pick_five_stack ?? 0) > 0
                    ? `Draw ${session.pick_five_stack} (Pick 3)`
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
    </WhotShell>
  )
}
