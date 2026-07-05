'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostPageShell, hostPlayLayoutFlags } from '@/components/host/HostPageShell'
import { HostBoardGameLobbyPanel } from '@/components/host-lobby/HostBoardGameLobbyPanel'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useMahjongTurnTimer } from '@/hooks/useMahjongTurnTimer'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { supabasePollOk, usePolling } from '@/hooks/usePolling'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import { currentMahjongPlayerId, MAHJONG_MIN_PLAYERS } from '@/lib/mahjong'
import type { Game, MahjongClaimType, MahjongPlayerState, MahjongSession, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { MahjongGamePanel } from '@/components/mahjong/MahjongBoard'
import { MahjongFinalResultsShareBlock } from '@/components/mahjong/MahjongFinalResultsShareBlock'
import { MahjongCard, MahjongPrimaryButton } from '@/components/mahjong/MahjongChrome'

type HostTab = 'play' | 'manage'
type MahjongHostMode = 'spectator' | 'player'

const HOST_MODE_KEY = 'mahjong_host_mode'
const MAHJONG_POLL_INTERVAL_MS = 1500

function getHostMode(gameCode: string): MahjongHostMode {
  if (typeof window === 'undefined') return 'spectator'
  return (localStorage.getItem(`${HOST_MODE_KEY}_${gameCode}`) as MahjongHostMode) ?? 'spectator'
}

function setHostMode(gameCode: string, mode: MahjongHostMode): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${HOST_MODE_KEY}_${gameCode}`, mode)
}

export function MahjongHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<MahjongSession | null>(null)
  const [states, setStates] = useState<MahjongPlayerState[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [startingNextHand, setStartingNextHand] = useState(false)
  const [hostMode, setHostModeState] = useState<MahjongHostMode>(() => getHostMode(gameCode))
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(() => getPlayerSession(gameCode)?.playerId ?? null)
  const [hostPlayerName, setHostPlayerName] = useState(() => getPlayerSession(gameCode)?.playerName ?? '')
  const [hostResumeToken, setHostResumeToken] = useState<string | null>(
    () => getPlayerSession(gameCode)?.resumeToken ?? null
  )
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [hostActing, setHostActing] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')

  useApplyGameTheme(game?.theme)
  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const load = useCallback(async (): Promise<boolean> => {
    try {
      const [gameRes, playersRes] = await Promise.all([
        supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
        supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      ])
      if (!supabasePollOk(gameRes, playersRes)) return false

      const stored = getPlayerSession(gameCode)
      const params = new URLSearchParams({ gameId: gameCode })
      if (stored?.playerId && stored.resumeToken) {
        params.set('playerId', stored.playerId)
        params.set('resumeToken', stored.resumeToken)
      }
      const snapshotRes = await fetch(`/api/mahjong/state?${params.toString()}`)
      if (!snapshotRes.ok) return false
      const snapshot = (await snapshotRes.json()) as {
        session: MahjongSession | null
        states: MahjongPlayerState[]
      }

      setGame(gameRes.data)
      setPlayers(playersRes.data ?? [])
      setSession(snapshot.session)
      setStates(snapshot.states ?? [])
      return true
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to load Mahjong table')
      return false
    }
  }, [gameCode, toastError])

  useEffect(() => {
    const loadId = window.setTimeout(() => void load(), 0)
    const setupId = window.setTimeout(() => {
      setHostModeState(getHostMode(gameCode))
      const stored = getPlayerSession(gameCode)
      if (stored) {
        setHostPlayerId(stored.playerId)
        setHostPlayerName(stored.playerName)
        setHostResumeToken(stored.resumeToken)
      }
    }, 0)
    return () => {
      window.clearTimeout(loadId)
      window.clearTimeout(setupId)
    }
  }, [gameCode, load])

  useEffect(() => {
    if (game?.status !== 'finished') return
    const id = window.setTimeout(() => setTab('manage'), 0)
    return () => window.clearTimeout(id)
  }, [game?.status])

  useEffect(() => {
    if (hostMode !== 'player' || !hostPlayerId || game?.status !== 'active') return
    const id = window.setTimeout(() => setTab('play'), 0)
    return () => window.clearTimeout(id)
  }, [hostMode, hostPlayerId, game?.status])

  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleLoad = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = setTimeout(() => void load(), 90)
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`mahjong-host-${gameCode}`)
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

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      if (playerId === hostPlayerId) {
        setHostPlayerId(null)
        setHostPlayerName('')
        setHostResumeToken(null)
        clearPlayerSession(gameCode)
      }
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [gameCode, hostPlayerId]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)
  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  const changeHostMode = (mode: MahjongHostMode) => {
    setHostModeState(mode)
    setHostMode(gameCode, mode)
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
      setHostPlayerName(data.playerName)
      setHostResumeToken(data.resumeToken ?? null)
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
    }
  }

  const postAction = async (path: string, body: Record<string, unknown> = {}) => {
    if (!hostPlayerId || !hostResumeToken) return
    setHostActing(true)
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: hostPlayerId, resumeToken: hostResumeToken, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
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
      success('Mahjong table started!')
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
      success('Ready for a new table!')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const startNextHand = async () => {
    setStartingNextHand(true)
    try {
      const res = await fetch('/api/mahjong/next-hand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start next hand')
      success('Next Mahjong hand started!')
      await load()
      if (hostMode === 'player' && hostPlayerId) setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start next hand')
    } finally {
      setStartingNextHand(false)
    }
  }

  const assignChombo = async (playerId: string) => {
    setHostActing(true)
    try {
      const res = await fetch('/api/mahjong/penalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken, playerId, penaltyType: 'chombo' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to apply penalty')
      success('Chombo penalty applied')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to apply penalty')
    } finally {
      setHostActing(false)
    }
  }

  const readyPlayers = players.filter((p) => p.spectator !== true)
  const canStart = readyPlayers.length === MAHJONG_MIN_PLAYERS
  const turnPlayerId = session ? currentMahjongPlayerId(session) : null
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const gameFinished = game?.status === 'finished' || session?.phase === 'finished'
  const showPlayTab = hostPlays && game?.status !== 'waiting' && !gameFinished
  const isHostTurn = turnPlayerId === hostPlayerId

  const { secondsLeft, hasTimer, urgent } = useMahjongTurnTimer(
    gameCode,
    session,
    game?.status === 'active' && (tab === 'play' ? isHostTurn || session?.phase === 'claim' : true)
  )

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading...</p>
      </div>
    )
  }

  const layout = hostPlayLayoutFlags(tab, showPlayTab, game.status)

  return (
    <HostPageShell gameCode={gameCode} {...layout}>
      {!gameFinished && <HostGameHeader game={game} />}

      {game.status === 'waiting' && (
        <div className="glass-card-strong p-5 space-y-3">
          <p className="label-caps">Host mode</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => changeHostMode('spectator')}
              className={[
                'rounded-2xl border-2 px-4 py-4 text-left',
                hostMode === 'spectator'
                  ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                  : 'border-[var(--border-strong)] text-muted',
              ].join(' ')}
            >
              <span className="font-bold block text-base">Host only</span>
              <span className="text-faint text-xs">Manage the table</span>
            </button>
            <button
              type="button"
              onClick={() => changeHostMode('player')}
              className={[
                'rounded-2xl border-2 px-4 py-4 text-left',
                hostMode === 'player'
                  ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                  : 'border-[var(--border-strong)] text-muted',
              ].join(' ')}
            >
              <span className="font-bold block text-base">Host + play</span>
              <span className="text-faint text-xs">Take one of the four seats</span>
            </button>
          </div>
          {hostMode === 'player' && !hostPlayerId && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={hostJoinName}
                onChange={(e) => setHostJoinName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void hostJoinGame()}
                placeholder="Your name"
                className="input-field flex-1"
                maxLength={40}
              />
              <button
                type="button"
                onClick={() => void hostJoinGame()}
                disabled={!hostJoinName.trim() || hostJoining}
                className="btn-primary btn-fit shrink-0 px-4 py-2.5 text-sm whitespace-nowrap"
              >
                {hostJoining ? 'Joining...' : 'Join'}
              </button>
            </div>
          )}
          {hostMode === 'player' && hostPlayerId && (
            <p className="text-sm text-muted">
              Playing as <span className="font-semibold text-[var(--foreground)]">{hostPlayerName}</span>
            </p>
          )}
        </div>
      )}

      {showPlayTab && (
        <div className="flex rounded-xl border border-[var(--border-strong)] p-1 bg-[var(--surface-inset-bg)]">
          <button
            type="button"
            onClick={() => setTab('play')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg ${tab === 'play' ? 'bg-[var(--background)] shadow' : 'text-muted'}`}
          >
            Play
          </button>
          <button
            type="button"
            onClick={() => setTab('manage')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg ${tab === 'manage' ? 'bg-[var(--background)] shadow' : 'text-muted'}`}
          >
            Manage
          </button>
        </div>
      )}

      {tab === 'play' && session && hostPlayerId && game.status === 'active' && !gameFinished && (
        <MahjongGamePanel
          session={session}
          states={states}
          players={players}
          myPlayerId={hostPlayerId}
          secondsLeft={secondsLeft}
          hasTimer={hasTimer}
          urgent={urgent}
          acting={hostActing}
          onDiscard={(tile) => void postAction('/api/mahjong/discard', { tile })}
          onClaim={(claimType: MahjongClaimType, tiles?: string[]) =>
            void postAction('/api/mahjong/claim', { claimType, tiles })
          }
          onRiichi={() => void postAction('/api/mahjong/riichi')}
          onPass={() => void postAction('/api/mahjong/pass')}
        />
      )}

      {(tab === 'manage' || !showPlayTab) && (
        <>
          {!gameFinished && (
            <p className="text-center">
              <GameRulesLink gameType="mahjong" variant="subtle" />
            </p>
          )}

          {gameFinished && (
            <MahjongFinalResultsShareBlock
              game={game}
              players={players}
              session={session}
              winnerName={winner?.name}
              highlightPlayerId={hostPlayerId}
              playAgainButton={
                game.status === 'active' && session?.phase === 'finished' ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <MahjongPrimaryButton onClick={startNextHand} loading={startingNextHand}>
                      Next hand
                    </MahjongPrimaryButton>
                    <HostEndGameButton gameCode={gameCode} hostToken={hostToken} onEnded={load} className="w-full" />
                  </div>
                ) : (
                  <MahjongPrimaryButton onClick={playAgain} loading={playingAgain}>
                    Play again
                  </MahjongPrimaryButton>
                )
              }
            />
          )}

          {session && game.status === 'active' && !gameFinished && (
            <div className="space-y-4">
              <MahjongGamePanel
                session={session}
                states={states}
                players={players}
                myPlayerId={hostPlayerId}
                secondsLeft={secondsLeft}
                hasTimer={hasTimer}
                urgent={urgent}
              />
              <MahjongCard className="p-4 space-y-3">
                <div>
                  <p className="label-caps">Penalty</p>
                  <p className="text-xs text-faint">
                    Host adjudication for dead hands, false wins, and severe table errors.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {players
                    .filter((player) => states.some((state) => state.player_id === player.id))
                    .map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        disabled={hostActing}
                        onClick={() => void assignChombo(player.id)}
                        className="btn-secondary py-2 text-xs"
                      >
                        Chombo · {player.name}
                      </button>
                    ))}
                </div>
              </MahjongCard>
            </div>
          )}

          {game.status === 'waiting' && (
            <HostBoardGameLobbyPanel
              gameCode={gameCode}
              hostToken={hostToken}
              game={game}
              boardGameType="mahjong"
              playerCount={readyPlayers.length}
              onGameUpdate={setGame}
            />
          )}

          {(game.status === 'waiting' || (game.status === 'active' && !gameFinished)) && (
            <HostLobbyPlayersSection
              players={players}
              removingPlayerId={removingPlayerId}
              onRemovePlayer={removePlayer}
              highlightPlayerId={hostPlayerId}
              hint="Mahjong starts with exactly four active players."
            />
          )}

          {game.status === 'waiting' && (
            <HostLobbyWaitingFooter
              gameCode={gameCode}
              hostToken={hostToken}
              onStart={startGame}
              onEnded={load}
              canStart={canStart}
              starting={starting}
              startDisabledHint={
                canStart
                  ? null
                  : `Need exactly ${MAHJONG_MIN_PLAYERS} ready players (${readyPlayers.length}/${MAHJONG_MIN_PLAYERS})`
              }
              className="space-y-3"
            />
          )}

          {game.status === 'active' && !gameFinished && (
            <HostEndGameButton gameCode={gameCode} hostToken={hostToken} onEnded={load} className="w-full" />
          )}
        </>
      )}
    </HostPageShell>
  )
}
