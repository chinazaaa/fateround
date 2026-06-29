'use client'

import { useCallback, useEffect, useState } from 'react'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'
import { currentTurnPlayerId, isScrabbleResultsPhase } from '@/lib/scrabble-board'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  PLAYER_SELECT,
  SCRABBLE_SESSION_SELECT,
  SCRABBLE_PLAYER_STATE_SELECT,
} from '@/lib/supabase-selects'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import type { Game, Player, ScrabbleSession, ScrabblePlayerState, ScrabblePlacedTile } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { ScrabbleGamePanel } from '@/components/scrabble/ScrabbleBoard'
import { ScrabbleFinalResultsShareBlock } from '@/components/scrabble/ScrabbleFinalResultsShareBlock'
import { ScrabblePrimaryButton } from '@/components/scrabble/ScrabbleChrome'
import { ScrabbleHostTimeExtension } from '@/components/scrabble/ScrabbleHostTimeExtension'
import { ScrabbleGameTimerBar } from '@/components/scrabble/ScrabbleGameTimerBar'
import { SCRABBLE_GAME_DURATION_OPTIONS, formatScrabbleGameDuration } from '@/lib/scrabble'
import {
  SCRABBLE_DICTIONARY_OPTIONS,
  SCRABBLE_DICTIONARY_LABELS,
  parseScrabbleDictionaryId,
} from '@/lib/scrabble-dictionary-meta'
import { tileSetForDictionary } from '@/lib/scrabble-rulesets'

type HostTab = 'play' | 'manage'
type ScrabbleHostMode = 'spectator' | 'player'

/** Minimum players to start a Scrabble game (kept client-side; engine enforces it server-side). */
const SCRABBLE_MIN_PLAYERS = 2

const HOST_MODE_KEY = 'scrabble_host_mode'

function getHostMode(gameCode: string): ScrabbleHostMode {
  if (typeof window === 'undefined') return 'spectator'
  return (localStorage.getItem(`${HOST_MODE_KEY}_${gameCode}`) as ScrabbleHostMode) ?? 'spectator'
}

function setHostMode(gameCode: string, mode: ScrabbleHostMode): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${HOST_MODE_KEY}_${gameCode}`, mode)
}

export function ScrabbleHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<ScrabbleSession | null>(null)
  const [playerStates, setPlayerStates] = useState<ScrabblePlayerState[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [hostMode, setHostModeState] = useState<ScrabbleHostMode>('spectator')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostResumeToken, setHostResumeToken] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [hostActing, setHostActing] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')
  const [loading, setLoading] = useState(true)

  useApplyGameTheme(game?.theme)
  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])
    if (!supabasePollOk(gameRes, plrsRes)) return false

    setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setLoading(false)

    const [sessionRes, statesRes] = await Promise.all([
      supabase.from('scrabble_sessions').select(SCRABBLE_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('scrabble_player_state').select(SCRABBLE_PLAYER_STATE_SELECT).eq('game_id', gameCode),
    ])
    if (supabasePollOk(sessionRes)) {
      setSession(sessionRes.data as ScrabbleSession | null)
    }
    if (supabasePollOk(statesRes)) {
      setPlayerStates((statesRes.data ?? []) as ScrabblePlayerState[])
    }
    return supabasePollOk(sessionRes, statesRes)
  }, [gameCode])

  useEffect(() => {
    load()
    setHostModeState(getHostMode(gameCode))
    const stored = getPlayerSession(gameCode)
    if (stored) {
      setHostPlayerId(stored.playerId)
      setHostResumeToken(stored.resumeToken ?? null)
      setHostPlayerName(stored.playerName)
    }
  }, [gameCode, load])

  // Land on the primary (Play/Watch) tab when the game starts, and on Manage at results.
  useEffect(() => {
    if (isScrabbleResultsPhase(game?.status, session)) setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [game?.status, session])

  // Realtime push: reload on any change to this game's row + its tables.
  useGameTableSync(gameCode, [{ table: 'games', column: 'id' }, 'scrabble_sessions', 'scrabble_player_state'], load)

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      if (playerId === hostPlayerId) {
        setHostPlayerId(null)
        setHostResumeToken(null)
        setHostPlayerName('')
        clearPlayerSession(gameCode)
      }
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [gameCode, hostPlayerId]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  const changeHostMode = (mode: ScrabbleHostMode) => {
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
      setHostResumeToken(data.resumeToken ?? null)
      setHostPlayerName(data.playerName)
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
    }
  }

  const playWord = async (tiles: ScrabblePlacedTile[]) => {
    if (!hostPlayerId) return
    if (!hostResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setHostActing(true)
    try {
      const res = await fetch('/api/scrabble/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken, tiles }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Invalid play')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Invalid play')
    } finally {
      setHostActing(false)
    }
  }

  const exchangeTiles = async (tileIndices: number[]) => {
    if (!hostPlayerId) return
    if (!hostResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setHostActing(true)
    try {
      const res = await fetch('/api/scrabble/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken, tileIndices }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Exchange failed')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Exchange failed')
    } finally {
      setHostActing(false)
    }
  }

  const passTurn = async () => {
    if (!hostPlayerId) return
    if (!hostResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setHostActing(true)
    try {
      const res = await fetch('/api/scrabble/pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to pass')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to pass')
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

  const savePatch = async (partial: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, ...partial }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to update settings')
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
      if (data.game) setGame(data.game)
      success('Ready for a new game!')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const readyPlayers = players.filter((p) => p.spectator !== true)
  const canStart = readyPlayers.length >= SCRABBLE_MIN_PLAYERS
  const turnPlayerId = session ? currentTurnPlayerId(session) : null
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const gameFinished = isScrabbleResultsPhase(game?.status, session)
  const isHostTurn = turnPlayerId === hostPlayerId
  const tileSet = tileSetForDictionary(game?.scrabble_dictionary_id)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-muted text-center">Game not found.</p>
      </div>
    )
  }

  const showTabs = !gameFinished
  const gameStarted = game.status === 'active' && !gameFinished
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  const interactivePlay = session && hostPlayerId && game.status === 'active' && !gameFinished && (
    <div className="space-y-3">
      <ScrabbleGameTimerBar gameCode={gameCode} game={game} />
      <ScrabbleGamePanel
        session={session}
        players={players}
        playerStates={playerStates}
        myPlayerId={hostPlayerId}
        isMyTurn={isHostTurn}
        tileValues={tileSet.values}
        alphabet={tileSet.alphabet}
        onPlay={playWord}
        onExchange={exchangeTiles}
        onPass={passTurn}
        acting={hostActing}
      />
    </div>
  )

  const watchBoard = session ? (
    <ScrabbleGamePanel
      session={session}
      players={players}
      playerStates={playerStates}
      myPlayerId={hostPlayerId}
      isMyTurn={false}
      tileValues={tileSet.values}
      alphabet={tileSet.alphabet}
    />
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
      gameType="scrabble"
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
            <div className="glass-card-strong p-5 space-y-3">
              <p className="label-caps">Game settings</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-[var(--foreground)]">Time per turn</span>
                  <select
                    value={[0, 60, 180, 300].includes(game.timer_seconds) ? game.timer_seconds : 0}
                    onChange={(e) => void savePatch({ timer_seconds: Number(e.target.value) })}
                    className="input-field w-full"
                  >
                    <option value={0}>No timer</option>
                    <option value={60}>1 minute</option>
                    <option value={180}>3 minutes</option>
                    <option value={300}>5 minutes</option>
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-[var(--foreground)]">Whole game</span>
                  <select
                    value={
                      SCRABBLE_GAME_DURATION_OPTIONS.includes(
                        (game.game_duration_seconds ?? 0) as (typeof SCRABBLE_GAME_DURATION_OPTIONS)[number]
                      )
                        ? (game.game_duration_seconds ?? 0)
                        : 0
                    }
                    onChange={(e) => void savePatch({ game_duration_seconds: Number(e.target.value) })}
                    className="input-field w-full"
                  >
                    {SCRABBLE_GAME_DURATION_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {formatScrabbleGameDuration(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1.5 col-span-2">
                  <span className="text-sm font-semibold text-[var(--foreground)]">Dictionary</span>
                  <select
                    value={parseScrabbleDictionaryId(game.scrabble_dictionary_id)}
                    onChange={(e) => void savePatch({ scrabble_dictionary_id: e.target.value })}
                    className="input-field w-full"
                  >
                    {SCRABBLE_DICTIONARY_OPTIONS.map((id) => (
                      <option key={id} value={id}>
                        {SCRABBLE_DICTIONARY_LABELS[id]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          {game.status !== 'waiting' && !gameFinished && (
            <p className="text-center text-xs text-muted">
              Dictionary: {SCRABBLE_DICTIONARY_LABELS[parseScrabbleDictionaryId(game.scrabble_dictionary_id)]}
            </p>
          )}

          {game.status === 'active' && !gameFinished && (
            <ScrabbleHostTimeExtension
              gameCode={gameCode}
              game={game}
              hostToken={hostToken}
              onExtended={() => void load()}
            />
          )}
        </>
      }
      footer={
        game.status === 'waiting' ? (
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
                : readyPlayers.length < players.length
                  ? `Waiting for players to tap ready (${readyPlayers.length}/${SCRABBLE_MIN_PLAYERS})`
                  : `Need at least ${SCRABBLE_MIN_PLAYERS} players to start (${players.length}/${SCRABBLE_MIN_PLAYERS})`
            }
            className="space-y-3"
          />
        ) : game.status === 'active' && !gameFinished ? (
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
      status={gameFinished ? 'finished' : game.status}
      tab={tab}
      onTabChange={setTab}
      primaryKind={primaryKind}
      showTabs={showTabs}
      gameStarted={gameStarted}
      header={gameFinished ? undefined : <HostGameHeader game={game} />}
      primary={hostPlays ? interactivePlay : watchBoard}
      manage={manage}
      finished={
        <ScrabbleFinalResultsShareBlock
          game={game}
          players={players}
          session={session}
          playerStates={playerStates}
          winnerName={winner?.name}
          highlightPlayerId={hostPlayerId}
          playAgainButton={
            <ScrabblePrimaryButton onClick={playAgain} loading={playingAgain}>
              Play again
            </ScrabblePrimaryButton>
          }
        />
      }
    />
  )
}
