'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MahjongCard,
  MahjongLoadingScreen,
  MahjongSecondaryButton,
  MahjongShell,
} from '@/components/mahjong/MahjongChrome'
import { MahjongGamePanel } from '@/components/mahjong/MahjongBoard'
import { MahjongFinalResultsShareBlock } from '@/components/mahjong/MahjongFinalResultsShareBlock'
import { gameTypeConfig } from '@/lib/game-types'
import { currentMahjongPlayerId } from '@/lib/mahjong'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { setPlayerSession, clearPlayerSession } from '@/lib/utils'
import { resolvePlayerSession } from '@/lib/player-resume'
import type { Game, MahjongClaimType, MahjongPlayerState, MahjongSession, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { supabasePollOk, usePolling } from '@/hooks/usePolling'
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
import { useMahjongTurnTimer } from '@/hooks/useMahjongTurnTimer'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

const MAHJONG_POLL_INTERVAL_MS = 1500

export function MahjongPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<MahjongSession | null>(null)
  const [states, setStates] = useState<MahjongPlayerState[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myResumeToken, setMyResumeToken] = useState<string | null>(null)
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const [acting, setActing] = useState(false)
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)

  useApplyGameTheme(screen === 'game_ended' ? 'default' : game?.theme)

  const syncScreen = useCallback((gameData: Game, playerId: string | null, sessionData: MahjongSession | null) => {
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
    if (gameData.status === 'active' && sessionData?.phase !== 'finished') {
      setScreen('active')
      return
    }
    setScreen('finished')
  }, [])

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, playersRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])
    if (!supabasePollOk(gameRes, playersRes)) return false

    const gameData = gameRes.data
    const plrs = playersRes.data

    if (!gameData) {
      setScreen('not_found')
      return true
    }

    const playerSession = await resolvePlayerSession(gameCode, plrs)
    const playerId = playerSession?.playerId ?? null
    const resumeToken = playerSession?.resumeToken ?? null
    const params = new URLSearchParams({ gameId: gameCode })
    if (playerId && resumeToken) {
      params.set('playerId', playerId)
      params.set('resumeToken', resumeToken)
    }

    const snapshotRes = await fetch(`/api/mahjong/state?${params.toString()}`)
    if (!snapshotRes.ok) return false
    const snapshot = (await snapshotRes.json()) as {
      session: MahjongSession | null
      states: MahjongPlayerState[]
    }

    setGame(gameData)
    setPlayers(plrs ?? [])
    setSession(snapshot.session)
    setStates(snapshot.states ?? [])
    setMyPlayerId(playerId)
    setMyResumeToken(resumeToken)
    syncScreen(gameData, playerId, snapshot.session)
    return true
  }, [gameCode, syncScreen])

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(id)
  }, [load])

  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleLoad = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = setTimeout(() => void load(), 90)
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`mahjong-player-${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        scheduleLoad
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        scheduleLoad
      )
      .subscribe()
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
      supabase.removeChannel(channel)
    }
  }, [gameCode, scheduleLoad])

  usePolling(() => load(), [gameCode, load], { intervalMs: MAHJONG_POLL_INTERVAL_MS })

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

  const postAction = async (path: string, body: Record<string, unknown> = {}) => {
    if (!myPlayerId || !myResumeToken) return
    setActing(true)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId, resumeToken: myResumeToken, ...body }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Action failed')
      } else {
        await load()
      }
    } finally {
      setActing(false)
    }
  }

  const cfg = gameTypeConfig('mahjong')
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const turnPlayerId = session ? currentMahjongPlayerId(session) : null
  const isMyTurn = myPlayerId != null && turnPlayerId === myPlayerId
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  const myName = activePlayer?.name ?? ''

  const { secondsLeft, hasTimer, urgent } = useMahjongTurnTimer(
    gameCode,
    session,
    game?.status === 'active' && !isViewer && (isMyTurn || session?.phase === 'claim')
  )

  if (screen === 'loading') return <MahjongLoadingScreen />

  if (screen === 'not_found') {
    return (
      <MahjongShell title="Game not found">
        <MahjongCard className="p-6 text-center space-y-3">
          <p className="text-muted">This game code doesn&apos;t exist.</p>
          <MahjongSecondaryButton onClick={() => router.push('/')}>Go home</MahjongSecondaryButton>
        </MahjongCard>
      </MahjongShell>
    )
  }

  if (screen === 'join') {
    if (resolvingRoomMember) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted text-lg">Joining from your game room...</p>
        </div>
      )
    }

    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        header={
          <GameJoinHeader
            emoji={cfg.headerEmoji}
            title={game?.title ?? cfg.label}
            gameType="mahjong"
            subtitle={cfg.tagline}
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          joining={joining}
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="mahjong" variant="subtle" />
            </p>
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => void load()} />
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'waiting') {
    const me = players.find((p) => p.id === myPlayerId)
    return (
      <GameJoinLobbyShell gameCode={gameCode}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={myName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Waiting for host to start"
          description="Mahjong starts when exactly four active players are ready."
          rulesLink={<GameRulesLink gameType="mahjong" variant="subtle" />}
          isSpectator={me?.spectator === true}
          onReady={async () => {
            if (!myPlayerId) return
            await fetch('/api/players/ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId }),
            })
            await load()
          }}
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'finished') {
    return (
      <MahjongShell compact>
        {game ? (
          <MahjongFinalResultsShareBlock
            game={game}
            players={players}
            session={session}
            winnerName={winner?.name}
            highlightPlayerId={myPlayerId}
          />
        ) : (
          <MahjongCard className="p-6 text-center">
            <p className="text-2xl font-black">Game over</p>
          </MahjongCard>
        )}
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
      </MahjongShell>
    )
  }

  return (
    <MahjongShell title={game?.title ?? cfg.label} compact wide>
      {isViewer && <ViewerModeBanner />}
      {session && (
        <MahjongGamePanel
          session={session}
          states={states}
          players={players}
          myPlayerId={myPlayerId}
          isViewer={isViewer}
          secondsLeft={secondsLeft}
          hasTimer={hasTimer}
          urgent={urgent}
          acting={acting}
          onDiscard={(tile) => void postAction('/api/mahjong/discard', { tile })}
          onClaim={(claimType: MahjongClaimType, tiles?: string[]) =>
            void postAction('/api/mahjong/claim', { claimType, tiles })
          }
          onRiichi={() => void postAction('/api/mahjong/riichi')}
          onPass={() => void postAction('/api/mahjong/pass')}
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
    </MahjongShell>
  )
}
