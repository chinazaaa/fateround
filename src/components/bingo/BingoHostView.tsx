'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { BingoCardGrid, CalledNumbersBoard } from '@/components/bingo/BingoCardGrid'
import { BingoFinalResultsShareBlock } from '@/components/bingo/BingoFinalResultsShareBlock'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
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
import { getPlayerSession, setPlayerSession } from '@/lib/utils'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import type { BingoCallMode, BingoCalledNumber, BingoClaim, BingoCard, Game, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useBingoWinNotification, useBingoStartNotification } from '@/hooks/useBingoNotifications'
import { useBingoAutoCall } from '@/hooks/useBingoAutoCall'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'

type HostTab = 'play' | 'manage'

export function BingoHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const router = useRouter()
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
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [hostCard, setHostCard] = useState<BingoCard | null>(null)
  const [hostMarking, setHostMarking] = useState(false)
  const [hostClaiming, setHostClaiming] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')

  const loadHostCard = useCallback(async (playerId: string) => {
    const res = await supabase
      .from('bingo_cards')
      .select(BINGO_CARD_SELECT)
      .eq('game_id', gameCode)
      .eq('player_id', playerId)
      .maybeSingle()
    if (res.data) setHostCard(res.data as BingoCard)
  }, [gameCode])

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, calledRes, claimRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('bingo_called_numbers').select(BINGO_CALLED_NUMBER_SELECT).eq('game_id', gameCode).order('called_at'),
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
      setHostPlayerName(session.playerName)
    }
  }, [gameCode, load])

  useEffect(() => {
    if (hostPlayerId && game?.status === 'active' && !hostCard) {
      void loadHostCard(hostPlayerId)
    }
  }, [hostPlayerId, game?.status, hostCard, loadHostCard])

  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  useEffect(() => {
    const channel = supabase
      .channel(`bingo-host-${gameCode}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` }, (payload) => {
        const next = payload.new as Game
        setGame(next)
        setLobbyCallMode(bingoCallModeFromGame(next))
        setLobbyCallInterval(bingoCallIntervalFromGame(next))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` }, (payload) => {
        const player = payload.new as Player
        setPlayers((prev) => (prev.some((p) => p.id === player.id) ? prev : [...prev, player]))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bingo_called_numbers', filter: `game_id=eq.${gameCode}` }, (payload) => {
        const row = payload.new as BingoCalledNumber
        setCalledNumbers((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, row]))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bingo_claims', filter: `game_id=eq.${gameCode}` }, (payload) => setWinner(payload.new as BingoClaim))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bingo_cards', filter: `game_id=eq.${gameCode}` }, (payload) => {
        if (hostPlayerId && (payload.new as BingoCard).player_id === hostPlayerId) {
          setHostCard(payload.new as BingoCard)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameCode, load, hostPlayerId])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

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
      setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender)
      setHostPlayerId(data.playerId)
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
    setHostMarking(true)
    try {
      const res = await fetch('/api/bingo/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: hostPlayerId, cellIndex }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to mark')
      if (data.marked_indices) {
        setHostCard((prev) => prev ? { ...prev, marked_indices: data.marked_indices } : prev)
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to mark')
    } finally {
      setHostMarking(false)
    }
  }

  const claimHostBingo = async () => {
    if (!hostPlayerId || hostClaiming) return
    setHostClaiming(true)
    try {
      const res = await fetch('/api/bingo/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: hostPlayerId }),
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
        body: JSON.stringify({ hostToken }),
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
  const showPlayTab = hostPlays && game?.status !== 'waiting'
  const hostCanBingo = !!(hostCard && hasBingoWin(hostCard.cells, hostCard.marked_indices, 'line') && !winner)

  useBingoStartNotification({ game, enabled: !!game })
  useBingoWinNotification({
    winner,
    winnerName: winnerPlayer?.name ?? null,
    enabled: game?.status === 'active' || game?.status === 'finished',
  })

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="text-center space-y-1">
          <div className="text-4xl">{cfg.headerEmoji}</div>
          <h1 className="text-2xl font-black tracking-tight gradient-title">{game.title}</h1>
          <p className="text-muted text-sm">{cfg.label} · Host panel</p>
        </div>

        {/* Host mode selector — lobby only */}
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
                <span className="text-faint text-xs">Call numbers from Manage</span>
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
                <span className="text-faint text-xs">Play tab + Manage tab</span>
              </button>
            </div>
            {hostMode === 'player' && !hostPlayerId && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={hostJoinName}
                  onChange={(e) => setHostJoinName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && hostJoinGame()}
                  placeholder="Your name"
                  className="input-field flex-1"
                  maxLength={40}
                />
                <button
                  type="button"
                  onClick={hostJoinGame}
                  disabled={!hostJoinName.trim() || hostJoining}
                  className="btn-primary btn-fit shrink-0 px-4 py-2.5 text-sm whitespace-nowrap"
                >
                  {hostJoining ? 'Joining…' : 'Join'}
                </button>
              </div>
            )}
            {hostMode === 'player' && hostPlayerId && (
              <p className="text-sm text-muted">
                Playing as <strong className="text-body">{hostPlayerName}</strong> — you&apos;ll get a card when the game starts.
              </p>
            )}
          </div>
        )}

        {/* Play / Manage tab switcher */}
        {showPlayTab && (
          <div className="flex gap-2 p-1 rounded-xl bg-[var(--surface-inset-bg)] border border-[var(--border-strong)]">
            <button
              type="button"
              onClick={() => setTab('play')}
              className={[
                'flex-1 rounded-lg py-2.5 text-sm font-bold transition-colors',
                tab === 'play' ? 'bg-[var(--card-strong)] shadow-sm' : 'text-muted',
              ].join(' ')}
            >
              Play
            </button>
            <button
              type="button"
              onClick={() => setTab('manage')}
              className={[
                'flex-1 rounded-lg py-2.5 text-sm font-bold transition-colors',
                tab === 'manage' ? 'bg-[var(--card-strong)] shadow-sm' : 'text-muted',
              ].join(' ')}
            >
              Manage
            </button>
          </div>
        )}

        {/* Play tab — host's bingo card */}
        {tab === 'play' && hostPlays && game.status === 'active' && (
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
        )}

        {/* Manage tab (or default when no Play tab) */}
        {(tab === 'manage' || !showPlayTab) && (
          <>
            <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-faint text-xs uppercase tracking-wider">Share with players</p>
                <p className="font-mono font-bold text-lg">{gameCode}</p>
              </div>
              <CopyLinkButton value={playerLink} label="Copy player link" />
            </div>

            {game.status === 'waiting' && (
              <div className="glass-card p-5 space-y-4">
                <div>
                  <p className="label-caps mb-2">Lobby ({players.length} joined)</p>
                  {players.length === 0 ? (
                    <p className="text-muted text-sm">Waiting for players to join…</p>
                  ) : (
                    <ul className="space-y-1">
                      {players.map((p) => (
                        <li key={p.id} className="text-sm font-medium flex items-center gap-2">
                          {p.name}
                          {p.id === hostPlayerId && (
                            <span className="text-[10px] font-bold uppercase text-[var(--primary)]">You</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-3 pt-2 border-t border-[var(--border-strong)]">
                  <p className="label-caps">Game settings</p>
                  <label className="block text-sm text-muted">
                    Max players
                    <select
                      value={lobbyMaxPlayers}
                      onChange={(e) => setLobbyMaxPlayers(Number(e.target.value))}
                      className="input-field w-full mt-1"
                    >
                      {Array.from({ length: 30 - BINGO_MIN_PLAYERS + 1 }, (_, i) => i + BINGO_MIN_PLAYERS).map((n) => (
                        <option key={n} value={n}>{n} players</option>
                      ))}
                    </select>
                  </label>
                  <HostAllowViewersField
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
                          <option key={s} value={s}>{s} seconds</option>
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

                <button
                  type="button"
                  onClick={startGame}
                  disabled={starting || players.length < BINGO_MIN_PLAYERS}
                  className="btn-primary w-full"
                >
                  {starting ? 'Starting…' : `Start Bingo (${BINGO_MIN_PLAYERS}+ players)`}
                </button>
              </div>
            )}

            {game.status === 'active' && (
              <>
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
                      Last: <span className="font-bold text-blue-300">{formatBingoNumber(lastCalled)}</span> ·{' '}
                      {called.length}/75 called
                    </p>
                  )}
                </div>
                <div className="glass-card p-5">
                  <CalledNumbersBoard calledNumbers={called} lastCalled={lastCalled} />
                </div>
                <HostEndGameButton gameCode={gameCode} hostToken={hostToken} onEnded={load} className="btn-secondary w-full" />
              </>
            )}

            {game.status === 'finished' && winnerPlayer && (
              <BingoFinalResultsShareBlock game={game} players={players} winnerName={winnerPlayer.name} />
            )}

            {game.status === 'finished' && (
              <>
                <button type="button" onClick={playAgain} disabled={playingAgain} className="btn-secondary w-full">
                  {playingAgain ? 'Resetting…' : 'Play again'}
                </button>
                <CreateNewGameButton />
              </>
            )}
          </>
        )}

        <button type="button" onClick={() => router.push('/games')} className="btn-ghost w-full text-muted">
          Browse all games
        </button>
      </div>
    </div>
  )
}
