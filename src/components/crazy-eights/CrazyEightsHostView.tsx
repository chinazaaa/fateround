'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostBoardGameLobbyPanel } from '@/components/host-lobby/HostBoardGameLobbyPanel'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { gameTypeConfig } from '@/lib/game-types'
import {
  currentPlayerId,
  getCrazyEightsHostMode,
  hasPlayableCard,
  getNormalizedPenalties,
  isDrawPileDepleted,
  parseCrazyEightsRules,
  setCrazyEightsHostMode,
  CRAZY8_MIN_PLAYERS,
  type CrazyEightsHostMode,
} from '@/lib/crazy-eights'
import { supabase } from '@/lib/supabase'
import { CRAZY8_SESSION_SELECT, GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostPlayerReconciliation } from '@/hooks/useHostPlayerReconciliation'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import type { Game, Player, CrazyEightsPlayerHand, CrazyEightsSession, CrazyEightsCalledSuit } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { ExitIcon } from '@/components/host/host-icons'
import { useCrazyEightsTurnTimer } from '@/hooks/useCrazyEightsTurnTimer'
import { useCrazyEightsNotifications, playCrazyEightsActionSound } from '@/hooks/useCrazyEightsNotifications'
import { CrazyEightsChoosePanel, CrazyEightsHand, CrazyEightsTable } from '@/components/crazy-eights/CrazyEightsBoard'
import { CrazyEightsGameTimerBar } from '@/components/crazy-eights/CrazyEightsGameTimerBar'
import { CrazyEightsFinalResultsShareBlock } from '@/components/crazy-eights/CrazyEightsFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { CrazyEightsCard, CrazyEightsPrimaryButton } from '@/components/crazy-eights/CrazyEightsChrome'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'

const CRAZY8_PLAYER_HANDS_SELECT = 'id,game_id,player_id,cards,player_order,created_at'

type HostTab = 'play' | 'manage'

export function CrazyEightsHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<CrazyEightsSession | null>(null)
  const [hands, setHands] = useState<CrazyEightsPlayerHand[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [hostMode, setHostMode] = useState<CrazyEightsHostMode>('spectator')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostResumeToken, setHostResumeToken] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [hostActing, setHostActing] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')

  useApplyGameTheme(game?.theme)
  useScrollHostViewToTop({ gameStatus: game?.status, tab })

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
    setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setSession(sessionRes.data as CrazyEightsSession | null)
    setHands((handsRes.data as CrazyEightsPlayerHand[]) ?? [])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
    setHostMode(getCrazyEightsHostMode(gameCode))
    const stored = getPlayerSession(gameCode)
    if (stored) {
      setHostPlayerId(stored.playerId)
      setHostResumeToken(stored.resumeToken ?? null)
      setHostPlayerName(stored.playerName)
    }
  }, [gameCode, load])

  // Land on the primary (Play/Watch) tab when the game starts, and on Manage when it ends.
  useEffect(() => {
    if (game?.status === 'active') setTab('play')
    else if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  // Realtime push: reload on any change to this game's row + its tables.
  useGameTableSync(
    gameCode,
    ['players', { table: 'games', column: 'id' }, 'crazy_eights_sessions', 'crazy_eights_player_hands'],
    load
  )

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      if (playerId === hostPlayerId) {
        setHostPlayerId(null)
        setHostPlayerName('')
        clearPlayerSession(gameCode)
      }
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [gameCode, hostPlayerId]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  // Clear stale host-as-player state if the host's own row is removed elsewhere.
  useHostPlayerReconciliation(players, hostPlayerId, () => handlePlayerRemoved(hostPlayerId!))

  const changeHostMode = (mode: CrazyEightsHostMode) => {
    setHostMode(mode)
    setCrazyEightsHostMode(gameCode, mode)
  }

  const hostJoinGame = async () => {
    if (!hostJoinName.trim()) return
    setHostJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerName: hostJoinName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      setPlayerSession(gameCode, data.playerId, data.playerName, 'both', data.resumeToken)
      setHostPlayerId(data.playerId)
      setHostResumeToken(data.resumeToken ?? null)
      setHostPlayerName(data.playerName)
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
    }
  }

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
      playCrazyEightsActionSound()
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

  const playAgain = async () => {
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset')
      success('Ready for a new game!')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const cfg = gameTypeConfig('crazy_eights')
  const joinUrl = `${appOrigin()}/game/${gameCode}`
  const canStart = players.filter((p) => p.spectator !== true).length >= CRAZY8_MIN_PLAYERS
  const turnPlayerId = session ? currentPlayerId(session) : null
  const turnPlayer = players.find((p) => p.id === turnPlayerId)
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const isHostTurn = turnPlayerId === hostPlayerId

  const { secondsLeft, hasTimer, urgent } = useCrazyEightsTurnTimer(gameCode, session, game?.status === 'active')

  const myHand = useMemo(() => {
    const row = hands.find((h) => h.player_id === hostPlayerId)
    return row?.cards ?? []
  }, [hands, hostPlayerId])

  useCrazyEightsNotifications({
    game,
    session,
    myPlayerId: hostPlayerId,
    myHandCount: myHand.length,
    enabled: hostPlays && game?.status === 'active',
  })

  const tableTimerProps = {
    turnPlayerName: turnPlayer?.name,
    isMyTurn: isHostTurn,
    secondsLeft,
    hasTimer,
    urgent,
  }

  const handCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const h of hands) {
      counts[h.player_id] = h.cards?.length ?? 0
    }
    return counts
  }, [hands])

  const drawDepleted = session ? isDrawPileDepleted(session) : false
  const crazyEightsRules = useMemo(() => parseCrazyEightsRules(game), [game])
  const hostCanPlay = session ? hasPlayableCard(myHand, session, crazyEightsRules) : false
  const penalties = session ? getNormalizedPenalties(session) : { pickTwo: 0, jokerPenalty: 0 }

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  // Primary tab: interactive board when the host is playing, read-only board otherwise.
  const interactivePlay = session && hostPlayerId && (
    <div className="space-y-3">
      <CrazyEightsGameTimerBar gameCode={gameCode} game={game} />
      <CrazyEightsTable
        session={session}
        players={players}
        myPlayerId={hostPlayerId}
        handCounts={handCounts}
        {...tableTimerProps}
      />
      {isHostTurn && session.phase === 'choose_suit' && (
        <CrazyEightsChoosePanel
          acting={hostActing}
          onChooseSuit={(suit: CrazyEightsCalledSuit) => void postHostAction('/api/crazy-eights/choose', { suit })}
        />
      )}
      {session.phase === 'playing' && (
        <>
          <CrazyEightsHand
            cards={myHand}
            session={session}
            acting={hostActing}
            rules={crazyEightsRules}
            onPlay={(cardId) => void postHostAction('/api/crazy-eights/play', { cardId })}
          />
          {isHostTurn && !(drawDepleted && hostCanPlay) && (
            <CrazyEightsPrimaryButton
              onClick={() => void postHostAction('/api/crazy-eights/draw')}
              loading={hostActing}
            >
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
    </div>
  )

  const watchBoard = session ? (
    <div className="space-y-3">
      <CrazyEightsGameTimerBar gameCode={gameCode} game={game} />
      <CrazyEightsTable
        session={session}
        players={players}
        myPlayerId={hostPlayerId}
        handCounts={handCounts}
        {...tableTimerProps}
        isMyTurn={false}
      />
    </div>
  ) : (
    <p className="text-muted text-sm text-center">Waiting for the round to begin…</p>
  )

  const manage = (
    <HostManageSection
      game={game}
      players={players}
      highlightPlayerId={hostPlayerId}
      removingPlayerId={removingPlayerId}
      onRemovePlayer={removePlayer}
      gameType="crazy_eights"
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
            spectatorHint="Spectate from the Watch tab"
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
              boardGameType="crazy_eights"
              playerCount={players.length}
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
            startDisabledHint={
              canStart
                ? null
                : `Need at least ${CRAZY8_MIN_PLAYERS} players to start (${players.length}/${CRAZY8_MIN_PLAYERS})`
            }
            className="space-y-3"
          />
        ) : game.status === 'active' ? (
          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={load}
            label="End game early"
            icon={<ExitIcon size={16} />}
            confirmTitle="End this game early?"
            confirmMessage="The current game will end and players will see the results screen."
            className="btn-danger-soft"
          />
        ) : null
      }
    />
  )

  return (
    <HostGameLayout
      gameCode={gameCode}
      status={game.status}
      tab={tab}
      onTabChange={setTab}
      primaryKind={primaryKind}
      showTabs={showTabs}
      gameStarted={gameStarted}
      header={<HostGameHeader game={game} />}
      primary={hostPlays ? interactivePlay : watchBoard}
      manage={manage}
      finished={
        <>
          <CrazyEightsFinalResultsShareBlock
            game={game}
            players={players}
            hands={hands}
            session={session}
            winnerName={winner?.name}
            highlightPlayerId={hostPlayerId}
            playAgainButton={
              <button
                type="button"
                onClick={() => void playAgain()}
                disabled={playingAgain}
                className="btn-primary w-full py-3"
              >
                {playingAgain ? 'Resetting…' : 'Play again'}
              </button>
            }
          />
          {hostPlayerId && session?.winner_player_id === hostPlayerId && (
            <PostWinToCommunity
              gameType="crazy_eights"
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
