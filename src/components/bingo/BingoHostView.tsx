'use client'

import { useCallback, useEffect, useState } from 'react'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { BingoCardGrid, CalledNumbersBoard } from '@/components/bingo/BingoCardGrid'
import { BingoFinalResultsShareBlock } from '@/components/bingo/BingoFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { ExitIcon } from '@/components/host/host-icons'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { gameTypeConfig } from '@/lib/game-types'
import {
  BINGO_CALL_INTERVAL_OPTIONS,
  BINGO_DEFAULT_CALL_INTERVAL,
  BINGO_DEFAULT_CALL_MODE,
  BINGO_MIN_PLAYERS,
  bingoCallIntervalFromGame,
  bingoCallModeFromGame,
  formatBingoNumber,
  getBingoHostMode,
  setBingoHostMode,
  hasBingoWin,
  type BingoHostMode,
} from '@/lib/bingo'
import { supabase } from '@/lib/supabase'
import {
  BINGO_CALLED_NUMBER_SELECT,
  BINGO_CARD_SELECT,
  BINGO_CLAIM_SELECT,
  GAME_SELECT,
  PLAYER_SELECT,
} from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import type { BingoCallMode, BingoCalledNumber, BingoClaim, BingoCard, Game, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useBingoWinNotification, useBingoStartNotification } from '@/hooks/useBingoNotifications'
import { useBingoAutoCall } from '@/hooks/useBingoAutoCall'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'

type HostTab = 'play' | 'manage'

export function BingoHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [calledNumbers, setCalledNumbers] = useState<BingoCalledNumber[]>([])
  const [winner, setWinner] = useState<BingoClaim | null>(null)
  const [starting, setStarting] = useState(false)
  const [calling, setCalling] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [lobbyCallMode, setLobbyCallMode] = useState<BingoCallMode>(BINGO_DEFAULT_CALL_MODE)
  const [lobbyCallInterval, setLobbyCallInterval] = useState(BINGO_DEFAULT_CALL_INTERVAL)
  const [lobbyMaxPlayers, setLobbyMaxPlayers] = useState(BINGO_MIN_PLAYERS)

  // Host+play mode
  const [hostMode, setHostMode] = useState<BingoHostMode>('spectator')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostResumeToken, setHostResumeToken] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [hostCard, setHostCard] = useState<BingoCard | null>(null)
  const [hostMarking, setHostMarking] = useState(false)
  const [hostClaiming, setHostClaiming] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')

  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const loadHostCard = useCallback(
    async (playerId: string) => {
      const res = await supabase
        .from('bingo_cards')
        .select(BINGO_CARD_SELECT)
        .eq('game_id', gameCode)
        .eq('player_id', playerId)
        .maybeSingle()
      if (res.data) setHostCard(res.data as BingoCard)
    },
    [gameCode]
  )

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, calledRes, claimRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase
        .from('bingo_called_numbers')
        .select(BINGO_CALLED_NUMBER_SELECT)
        .eq('game_id', gameCode)
        .order('called_at'),
      supabase
        .from('bingo_claims')
        .select(BINGO_CLAIM_SELECT)
        .eq('game_id', gameCode)
        .eq('status', 'approved')
        .maybeSingle(),
    ])
    if (!supabasePollOk(gameRes, plrsRes, calledRes, claimRes)) return false
    if (gameRes.data) {
      setGame(gameRes.data)
      setLobbyCallMode(bingoCallModeFromGame(gameRes.data))
      setLobbyCallInterval(bingoCallIntervalFromGame(gameRes.data))
      setLobbyMaxPlayers(gameRes.data.max_players ?? BINGO_MIN_PLAYERS)
    }
    setPlayers(plrsRes.data ?? [])
    setCalledNumbers(calledRes.data ?? [])
    setWinner(claimRes.data ?? null)
    return true
  }, [gameCode])

  useEffect(() => {
    load()
    setHostMode(getBingoHostMode(gameCode))
    const session = getPlayerSession(gameCode)
    if (session) {
      setHostPlayerId(session.playerId)
      setHostResumeToken(session.resumeToken ?? null)
      setHostPlayerName(session.playerName)
    }
  }, [gameCode, load])

  useEffect(() => {
    if (hostPlayerId && game?.status === 'active' && !hostCard) {
      void loadHostCard(hostPlayerId)
    }
  }, [hostPlayerId, game?.status, hostCard, loadHostCard])

  useEffect(() => {
    const channel = supabase
      .channel(`bingo-host-${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          const next = payload.new as Game
          setGame(next)
          setLobbyCallMode(bingoCallModeFromGame(next))
          setLobbyCallInterval(bingoCallIntervalFromGame(next))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const player = payload.new as Player
          setPlayers((prev) => (prev.some((p) => p.id === player.id) ? prev : [...prev, player]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bingo_called_numbers', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const row = payload.new as BingoCalledNumber
          setCalledNumbers((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, row]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bingo_claims', filter: `game_id=eq.${gameCode}` },
        (payload) => setWinner(payload.new as BingoClaim)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bingo_cards', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          if (hostPlayerId && (payload.new as BingoCard).player_id === hostPlayerId) {
            setHostCard(payload.new as BingoCard)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode, load, hostPlayerId])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      if (playerId === hostPlayerId) {
        setHostPlayerId(null)
        setHostResumeToken(null)
        setHostPlayerName('')
        setHostCard(null)
        clearPlayerSession(gameCode)
      }
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [gameCode, hostPlayerId]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  const playerManageBlock =
    game && (game.status === 'waiting' || game.status === 'active') ? (
      <HostLobbyPlayersSection
        players={players}
        removingPlayerId={removingPlayerId}
        onRemovePlayer={removePlayer}
        highlightPlayerId={hostPlayerId}
        alwaysShowReady={game?.status === 'waiting'}
      />
    ) : null

  useBingoAutoCall({ gameCode, game, enabled: game?.status === 'active', onSynced: load })

  const changeHostMode = (mode: BingoHostMode) => {
    if (game?.status !== 'waiting') return
    setHostMode(mode)
    setBingoHostMode(gameCode, mode)
  }

  const hostJoinGame = async () => {
    const name = hostJoinName.trim()
    if (!name) return
    setHostJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerName: name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender, data.resumeToken)
      setHostPlayerId(data.playerId)
      setHostResumeToken(data.resumeToken ?? null)
      setHostPlayerName(data.playerName)
      setHostMode('player')
      setBingoHostMode(gameCode, 'player')
      await load()
      success(`Joined as ${data.playerName}`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
    }
  }

  const markHostNumber = async (cellIndex: number) => {
    if (!hostPlayerId || !hostCard || hostMarking) return
    if (!hostResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setHostMarking(true)
    try {
      const res = await fetch('/api/bingo/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken, cellIndex }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to mark')
      if (data.marked_indices) {
        setHostCard((prev) => (prev ? { ...prev, marked_indices: data.marked_indices } : prev))
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to mark')
    } finally {
      setHostMarking(false)
    }
  }

  const claimHostBingo = async () => {
    if (!hostPlayerId || hostClaiming) return
    if (!hostResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setHostClaiming(true)
    try {
      const res = await fetch('/api/bingo/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to claim')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to claim')
    } finally {
      setHostClaiming(false)
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
      await load()
      success('Bingo started — cards dealt!')
      if (hostMode === 'player' && hostPlayerId) setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const saveLobbySettings = async () => {
    setSavingSettings(true)
    try {
      const res = await fetch('/api/bingo/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          hostToken,
          bingo_call_mode: lobbyCallMode,
          bingo_call_interval_seconds: lobbyCallInterval,
          max_players: lobbyMaxPlayers,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save settings')
      if (data.game) setGame(data.game)
      await load()
      success('Settings saved')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  const callNumber = async (random = true, number?: number) => {
    setCalling(true)
    try {
      const res = await fetch('/api/bingo/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken, random, number }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to call number')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to call number')
    } finally {
      setCalling(false)
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
      setWinner(null)
      setCalledNumbers([])
      setHostCard(null)
      await load()
      success('Lobby reopened — waiting for players!')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const cfg = gameTypeConfig('bingo')
  const called = calledNumbers.map((row) => row.number)
  const lastCalled = called.length > 0 ? called[called.length - 1] : null
  const winnerPlayer = winner ? players.find((p) => p.id === winner.player_id) : null
  const playerLink = `${appOrigin()}/game/${gameCode}`
  const callMode = game ? bingoCallModeFromGame(game) : BINGO_DEFAULT_CALL_MODE
  const callInterval = game ? bingoCallIntervalFromGame(game) : BINGO_DEFAULT_CALL_INTERVAL
  const isAuto = callMode === 'auto'
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const hostCanBingo = !!(hostCard && hasBingoWin(hostCard.cells, hostCard.marked_indices, 'line') && !winner)

  useBingoStartNotification({ game, enabled: !!game })
  useBingoWinNotification({
    winner,
    winnerName: winnerPlayer?.name ?? null,
    enabled: game?.status === 'active' || game?.status === 'finished',
  })

  // Land on the primary (Play/Watch) tab when the game starts, and on Manage when it ends.
  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [game?.status])

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

  // Read-only live board for the Watch tab (host-only) — no controls.
  const calledBoard = (
    <div className="glass-card p-5">
      <CalledNumbersBoard calledNumbers={called} lastCalled={lastCalled} />
    </div>
  )

  // Primary tab: interactive card for a host-player, read-only board for a host-only host.
  const interactivePlay = hostPlays && game.status === 'active' && (
    <div className="space-y-4">
      {hostCard ? (
        <>
          <div className="glass-card p-4">
            <BingoCardGrid
              cells={hostCard.cells}
              markedIndices={hostCard.marked_indices}
              calledNumbers={called}
              onMark={markHostNumber}
              disabled={hostMarking}
            />
          </div>
          {hostCanBingo && (
            <button
              type="button"
              onClick={claimHostBingo}
              disabled={hostClaiming}
              className="btn-primary w-full text-lg font-black"
            >
              {hostClaiming ? 'Claiming…' : '🎉 BINGO!'}
            </button>
          )}
          {winner && (
            <div className="glass-card p-4 text-center font-semibold text-emerald-700 dark:text-emerald-200">
              {winnerPlayer ? `${winnerPlayer.name} called Bingo!` : 'Bingo claimed!'}
            </div>
          )}
        </>
      ) : (
        <div className="glass-card p-6 text-center text-muted text-sm">Loading your card…</div>
      )}
      <div className="glass-card p-4">
        <CalledNumbersBoard calledNumbers={called} lastCalled={lastCalled} />
      </div>
    </div>
  )

  const watchRound = (
    <div className="space-y-4">
      {lastCalled != null && (
        <div className="glass-card p-5">
          <p className="text-center text-muted text-sm">
            Last: <span className="font-bold text-blue-300">{formatBingoNumber(lastCalled)}</span> · {called.length}/75
            called
          </p>
        </div>
      )}
      {calledBoard}
    </div>
  )

  const manage = (
    <div className="space-y-4 sm:space-y-5 animate-stagger">
      {game.status === 'waiting' && (
        <HostModeSelector
          mode={hostMode}
          onChange={changeHostMode}
          joinedPlayerId={hostPlayerId}
          joinedPlayerName={hostPlayerName}
          joinName={hostJoinName}
          onJoinNameChange={setHostJoinName}
          onJoin={() => void hostJoinGame()}
          joining={hostJoining}
          spectatorHint="Watch the game from the Watch tab"
          playingNote={
            <p className="text-sm text-muted">
              Playing as <strong className="text-body">{hostPlayerName}</strong> — you&apos;ll get a card when the game
              starts.
            </p>
          }
        />
      )}
      {game.status !== 'finished' && <HostRulesRow gameType="bingo" />}

      {game.status === 'waiting' && (
        <>
          {playerManageBlock}
          <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))] bg-[var(--card-strong)]/95 p-5 space-y-4">
            <div className="space-y-3">
              <p className="label-caps">Game settings</p>
              <label className="block text-sm text-muted">
                Max players
                <select
                  value={lobbyMaxPlayers}
                  onChange={(e) => setLobbyMaxPlayers(Number(e.target.value))}
                  className="input-field w-full mt-1"
                >
                  {Array.from({ length: 30 - BINGO_MIN_PLAYERS + 1 }, (_, i) => i + BINGO_MIN_PLAYERS).map((n) => (
                    <option key={n} value={n}>
                      {n} players
                    </option>
                  ))}
                </select>
              </label>
              <HostAllowViewersField
                embedded
                gameCode={gameCode}
                hostToken={hostToken}
                game={game}
                onGameUpdate={setGame}
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLobbyCallMode('manual')}
                  className={[
                    'rounded-2xl border-2 px-4 py-3 text-left',
                    lobbyCallMode === 'manual'
                      ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                      : 'border-[var(--border-strong)] text-muted',
                  ].join(' ')}
                >
                  <span className="font-bold block text-sm">Manual</span>
                  <span className="text-faint text-xs">You call numbers</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLobbyCallMode('auto')}
                  className={[
                    'rounded-2xl border-2 px-4 py-3 text-left',
                    lobbyCallMode === 'auto'
                      ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                      : 'border-[var(--border-strong)] text-muted',
                  ].join(' ')}
                >
                  <span className="font-bold block text-sm">Automatic</span>
                  <span className="text-faint text-xs">Computer calls</span>
                </button>
              </div>
              {lobbyCallMode === 'auto' && (
                <label className="block text-sm text-muted">
                  Seconds between calls
                  <select
                    value={lobbyCallInterval}
                    onChange={(e) => setLobbyCallInterval(Number(e.target.value))}
                    className="input-field w-full mt-1"
                  >
                    {BINGO_CALL_INTERVAL_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s} seconds
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                onClick={saveLobbySettings}
                disabled={savingSettings}
                className="btn-secondary w-full py-3"
              >
                {savingSettings ? 'Saving…' : 'Save settings'}
              </button>
            </div>

            <HostLobbyWaitingFooter
              gameCode={gameCode}
              hostToken={hostToken}
              onStart={startGame}
              onEnded={load}
              canStart={players.length >= BINGO_MIN_PLAYERS}
              starting={starting}
              startDisabledHint={
                players.length >= BINGO_MIN_PLAYERS
                  ? null
                  : `Need at least ${BINGO_MIN_PLAYERS} players to start (${players.length}/${BINGO_MIN_PLAYERS})`
              }
            />
          </div>
        </>
      )}

      {game.status === 'active' && (
        <>
          {playerManageBlock}
          <div className="glass-card p-5 space-y-4">
            <p className="label-caps">{isAuto ? 'Automatic calling' : 'Call numbers'}</p>
            {isAuto ? (
              <p className="text-center text-muted text-sm sm:text-base">
                Numbers are called automatically every <span className="font-bold text-body">{callInterval}s</span>.
                Keep this tab open or let players stay connected — anyone in the game keeps it running.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => callNumber(true)}
                  disabled={calling || called.length >= 75}
                  className="btn-primary flex-1 min-w-[140px]"
                >
                  {calling ? 'Calling…' : 'Call random'}
                </button>
              </div>
            )}
            {lastCalled != null && (
              <p className="text-center text-muted text-sm">
                Last: <span className="font-bold text-blue-300">{formatBingoNumber(lastCalled)}</span> · {called.length}
                /75 called
              </p>
            )}
          </div>
          <div className="glass-card p-5">
            <CalledNumbersBoard calledNumbers={called} lastCalled={lastCalled} />
          </div>
          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={load}
            label="End game"
            icon={<ExitIcon size={16} />}
            className="btn-danger-soft"
          />
        </>
      )}
    </div>
  )

  const finished =
    game.status === 'finished' ? (
      winnerPlayer ? (
        <>
          <BingoFinalResultsShareBlock
            game={game}
            players={players}
            winnerName={winnerPlayer.name}
            playAgainButton={
              <button type="button" onClick={playAgain} disabled={playingAgain} className="btn-secondary w-full">
                {playingAgain ? 'Resetting…' : 'Play again'}
              </button>
            }
          />
          {hostPlayerId && winner?.player_id === hostPlayerId && (
            <PostWinToCommunity
              gameType="bingo"
              gameCode={gameCode}
              winnerName={hostPlayerName}
              roundKey={winner?.id}
            />
          )}
        </>
      ) : (
        <div className="space-y-4">
          <button type="button" onClick={playAgain} disabled={playingAgain} className="btn-secondary w-full">
            {playingAgain ? 'Resetting…' : 'Play again'}
          </button>
          <CreateNewGameButton />
        </div>
      )
    ) : null

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
      primary={hostPlays ? interactivePlay : watchRound}
      manage={manage}
      finished={finished}
    />
  )
}
