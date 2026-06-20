'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  LudoCard,
  LudoLoadingScreen,
  LudoPrimaryButton,
  LudoSecondaryButton,
  LudoShell,
} from '@/components/ludo/LudoChrome'
import { LudoGamePanel } from '@/components/ludo/LudoBoard'
import { gameTypeConfig } from '@/lib/game-types'
import { currentPlayerId } from '@/lib/ludo'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, LUDO_PLAYER_STATE_SELECT, LUDO_SESSION_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import { resolvePlayerSession } from '@/lib/player-resume'
import type { Game, LudoPlayerState, LudoSession, Player } from '@/types'
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
import { GameLobbyPlayerList } from '@/components/ui/GameLobbyPlayerList'
import { useLudoTurnTimer } from '@/hooks/useLudoTurnTimer'
import { useLudoNotifications, playLudoActionSound, playLudoRollSound } from '@/hooks/useLudoNotifications'

const ROLL_MIN_MS = 700

type Screen = 'loading' | 'join' | 'game_started_waiting' | 'waiting' | 'active' | 'finished' | 'not_found'

export function LudoPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<LudoSession | null>(null)
  const [states, setStates] = useState<LudoPlayerState[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const [acting, setActing] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [displayDice, setDisplayDice] = useState<number | null>(null)
  const rollStartedRef = useRef(0)

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
    const [gameRes, plrsRes, sessionRes, statesRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('ludo_sessions').select(LUDO_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('ludo_player_state').select(LUDO_PLAYER_STATE_SELECT).eq('game_id', gameCode).order('player_order'),
    ])
    if (!supabasePollOk(gameRes, plrsRes, sessionRes, statesRes)) return false

    const gameData = gameRes.data
    const plrs = plrsRes.data

    if (!gameData) {
      setScreen('not_found')
      return true
    }

    setGame(gameData)
    setPlayers(plrs ?? [])
    setSession(sessionRes.data as LudoSession | null)
    setStates((statesRes.data as LudoPlayerState[]) ?? [])

    const session = await resolvePlayerSession(gameCode, plrs)
    const playerId = session?.playerId ?? null
    if (session) {
      setMyPlayerId(session.playerId)
    } else {
      setMyPlayerId(null)
    }

    syncScreen(gameData, playerId)
    return true
  }, [gameCode, syncScreen])

  useEffect(() => {
    load()
  }, [load])

  // A single move can update several rows at once, firing a burst of
  // postgres_changes events. Coalesce them into one reload to avoid refetch
  // storms and flicker from partial mid-write snapshots.
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleLoad = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = setTimeout(() => void load(), 90)
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`ludo-player-${gameCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ludo_sessions', filter: `game_id=eq.${gameCode}` }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ludo_player_state', filter: `game_id=eq.${gameCode}` }, scheduleLoad)
      .subscribe()
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
      supabase.removeChannel(channel)
    }
  }, [gameCode, scheduleLoad])

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
      setPlayerSession(gameCode, data.playerId, data.playerName, 'both', data.resumeToken)
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

  const postAction = async (path: string, body: Record<string, unknown> = {}) => {
    if (!myPlayerId) return
    setActing(true)
    if (path.includes('/roll')) {
      rollStartedRef.current = Date.now()
      setRolling(true)
      setDisplayDice(null)
      playLudoRollSound()
    }
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId, ...body }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Action failed')
      } else {
        if (typeof data.dice === 'number') setDisplayDice(data.dice)
        if (path.includes('/roll') || path.includes('/move')) playLudoActionSound()
        await load()
      }
    } finally {
      setActing(false)
      if (path.includes('/roll')) {
        const wait = Math.max(0, ROLL_MIN_MS - (Date.now() - rollStartedRef.current))
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      }
      setRolling(false)
    }
  }

  const cfg = gameTypeConfig('ludo')
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = myPlayerId != null && turnPlayerId === myPlayerId
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  const myName = activePlayer?.name ?? ''

  const { secondsLeft, hasTimer, urgent } = useLudoTurnTimer(
    gameCode,
    session,
    game?.status === 'active' && !isViewer
  )

  useLudoNotifications({
    game,
    session,
    myPlayerId,
    players,
    enabled: screen === 'active' && !isViewer,
  })

  if (screen === 'loading') return <LudoLoadingScreen />

  if (screen === 'not_found') {
    return (
      <LudoShell title="Game not found">
        <LudoCard className="p-6 text-center space-y-3">
          <p className="text-muted">This game code doesn&apos;t exist.</p>
          <LudoSecondaryButton onClick={() => router.push('/')}>Go home</LudoSecondaryButton>
        </LudoCard>
      </LudoShell>
    )
  }

  if (screen === 'join') {
    return (
      <LudoShell title={game?.title ?? cfg.label} subtitle={cfg.tagline}>
        <LudoCard className="p-5 space-y-4">
          <GameRulesLink gameType="ludo" className="block text-center" />
          <input
            type="text"
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && join()}
            placeholder="Your name"
            className="input-field w-full"
            maxLength={40}
          />
          <LudoPrimaryButton onClick={join} loading={joining} disabled={!joinName.trim()}>
            Join game
          </LudoPrimaryButton>
        </LudoCard>
      </LudoShell>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => void load()} />
  }

  if (screen === 'waiting') {
    return (
      <LudoShell title={game?.title ?? cfg.label} subtitle="Waiting for host to start…" compact>
        <LudoCard className="p-4 space-y-3">
          <ShareGameLinkCard gameCode={gameCode} />
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
          <GameRulesLink gameType="ludo" className="block text-center" variant="subtle" />
          <GameLobbyPlayerList players={players} myPlayerId={myPlayerId} label="In lobby" />
        </LudoCard>
      </LudoShell>
    )
  }

  if (screen === 'finished') {
    return (
      <LudoShell title={game?.title ?? cfg.label} subtitle="Game over">
        <LudoCard className="p-6 text-center space-y-3">
          <p className="text-2xl font-black">🏆 {winner?.name ?? 'Someone'} wins!</p>
          <p className="text-sm text-muted">Waiting for the host to start a new round…</p>
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
        </LudoCard>
      </LudoShell>
    )
  }

  return (
    <LudoShell title={game?.title ?? cfg.label} compact wide>
      {isViewer && <ViewerModeBanner />}
      {session && (
        <LudoGamePanel
          session={session}
          states={states}
          players={players}
          myPlayerId={myPlayerId}
          isMyTurn={isMyTurn && !isViewer}
          secondsLeft={secondsLeft}
          hasTimer={hasTimer}
          urgent={urgent}
          onRoll={isMyTurn && !isViewer ? () => postAction('/api/ludo/roll') : undefined}
          onMovePiece={isMyTurn && !isViewer ? (pieceId) => postAction('/api/ludo/move', { pieceId }) : undefined}
          acting={acting}
          rolling={rolling}
          displayDice={displayDice}
        />
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
    </LudoShell>
  )
}
