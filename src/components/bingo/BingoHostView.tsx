'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { BingoCardGrid, CalledNumbersBoard } from '@/components/bingo/BingoCardGrid'
import { HostActiveSettings } from '@/components/host/HostActiveSettings'
import { HostLeaveSeatButton } from '@/components/host/HostLeaveSeatButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { BingoFinalResultsShareBlock } from '@/components/bingo/BingoFinalResultsShareBlock'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { TransferHostControl } from '@/components/TransferHostControl'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
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
  hasBingoWin,
} from '@/lib/bingo'
import { supabase } from '@/lib/supabase'
import { fetchBingoCard } from '@/lib/hands-client'
import { BINGO_CALLED_NUMBER_SELECT, BINGO_CLAIM_SELECT, GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useHostSeat } from '@/hooks/useHostSeat'
import type { BingoCallMode, BingoCalledNumber, BingoClaim, BingoCard, Game, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useBingoWinNotification, useBingoStartNotification } from '@/hooks/useBingoNotifications'
import { useBingoAutoCall } from '@/hooks/useBingoAutoCall'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { mergeRealtimeGame } from '@/lib/realtime-merge'

type HostTab = 'play' | 'manage'

export function BingoHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
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
  const [hostCard, setHostCard] = useState<BingoCard | null>(null)
  const [hostMarking, setHostMarking] = useState(false)
  const [hostClaiming, setHostClaiming] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')
  // The host seat's resume token comes from useHostSeat, declared further down; a ref lets
  // loadHostCard (defined above it, and captured by the realtime subscription) read the current
  // token without re-subscribing.
  const hostResumeTokenRef = useRef<string | null>(null)

  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  // The host reads a card through /api/bingo/card so `cells`/`marked_indices` never reach the
  // browser via the anon key. It reads it as a PLAYER — with the host seat's own resume token,
  // the same secret markHostNumber/claimHostBingo already require — not with the host token.
  // The host token used to authorize naming ANY player's card, which handed every holder of the
  // shared /host/CODE link every player's card; nothing needed that (claim verification is
  // server-side in /api/bingo/claim), so the route no longer offers it.
  //
  // `ok` means the server answered: a null card then genuinely means "not dealt", so it CLEARS
  // the card rather than leaving a stale one from the previous round. A transport blip leaves
  // the current card alone.
  //
  // Returns the poll health signal: true when the server answered (with or without a card),
  // false only on a transport/authorization failure — so the recovery poll below doesn't back
  // off exponentially while waiting for a card to be dealt.
  const loadHostCard = useCallback(async (): Promise<boolean> => {
    const result = await fetchBingoCard(gameCode, { resumeToken: hostResumeTokenRef.current })
    if (result.ok) setHostCard(result.card)
    return result.ok
  }, [gameCode])

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
  }, [gameCode, load])

  const {
    hostMode,
    hostPlayerId,
    hostResumeToken,
    hostPlayerName,
    hostJoinName,
    setHostJoinName,
    hostJoining,
    changeHostMode,
    hostJoinGame,
    leaveSeatKeepHosting,
    renameHost,
    handlePlayerRemoved: onHostSeatRemoved,
  } = useHostSeat({
    gameCode,
    hostToken,
    gameStatus: game?.status,
    players,
    onReload: load,
    toast: { success, error: toastError },
  })
  hostResumeTokenRef.current = hostResumeToken

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      onHostSeatRemoved(playerId)
      if (playerId === hostPlayerId) setHostCard(null)
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [onHostSeatRemoved, hostPlayerId]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  // A round that ends and is replayed deals fresh cards. Drop the finished round's card as soon
  // as the lobby reopens, so a stale card can't render over the new round (the load effect below
  // only fires while active, so nothing would have cleared it).
  useEffect(() => {
    if (game?.status === 'waiting') setHostCard(null)
  }, [game?.status])

  useEffect(() => {
    if (hostPlayerId && hostResumeToken && game?.status === 'active' && !hostCard) {
      void loadHostCard()
    }
  }, [hostPlayerId, hostResumeToken, game?.status, hostCard, loadHostCard])

  // Recovery poll, mirroring the player view: the deal can land after the game flips to active.
  usePolling(() => loadHostCard(), [loadHostCard], {
    intervalMs: POLL_INTERVALS.lobby,
    enabled: game?.status === 'active' && !!hostPlayerId && !!hostResumeToken && !hostCard,
  })

  useEffect(() => {
    const channel = supabase
      .channel(`bingo-host-${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          const next = payload.new as Game
          setGame((prev) => mergeRealtimeGame(prev, next))
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
          // Post-revoke the payload carries no `cells`/`marked_indices`, so applying it verbatim
          // would blank the host's card. Re-fetch through the authorized route instead.
          if (hostPlayerId && (payload.new as { player_id?: string }).player_id === hostPlayerId) {
            void loadHostCard()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode, load, hostPlayerId, loadHostCard])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

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

  // "Play again · same settings" reopens the game as an open lobby flagged for the
  // ready-up ring; a plain reset (sameSettings=false) is the normal "Return to lobby".
  const resetGame = async (sameSettings: boolean) => {
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined, same_settings: sameSettings }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset')
      setWinner(null)
      setCalledNumbers([])
      setHostCard(null)
      await load()
      success(sameSettings ? 'Ready up for the next game!' : 'Back to the lobby')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const confirmPlayAgain = async () => {
    const ok = await confirm({
      title: 'Play again — same settings?',
      message:
        'Reopens the game with the same settings. Previous watchers and new people can join; everyone taps “ready” and you start the next game once enough players are in.',
      confirmLabel: 'Play again',
    })
    if (ok) void resetGame(true)
  }

  const confirmReturnToLobby = async () => {
    const ok = await confirm({
      title: 'Return to lobby?',
      message:
        'Sends everyone back to the game lobby where you can tweak settings or let new people join before starting again.',
      confirmLabel: 'Return to lobby',
    })
    if (ok) void resetGame(false)
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

  // Host settings for the active game live in the main-header ⚙ gear (no Manage tab).
  // Bingo has no in-game settings, so this is just How-to-play + End game. The frequent
  // "Call random" driver stays in the play body (see `callControl` below), not the gear.
  const hostSettingsNode = useMemo(
    () =>
      game?.status === 'active' ? (
        <HostActiveSettings game={game} gameCode={gameCode} hostToken={hostToken} gameType="bingo" onEnded={load}>
          {hostMode === 'player' && !!hostPlayerId && (
            <HostLeaveSeatButton onLeave={leaveSeatKeepHosting} className="btn-secondary w-full py-3 text-base" />
          )}
        </HostActiveSettings>
      ) : null,
    [game?.status, gameCode, hostToken, load, hostMode, hostPlayerId, leaveSeatKeepHosting]
  )
  useRegisterGameSettings(hostSettingsNode)

  if (!game) {
    return <HostLobbySkeleton />
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

  // The host's number-calling control — lives in the PLAY BODY (not the gear) since
  // manual calling is frequent. Auto mode just shows the interval note.
  const callControl = game?.status === 'active' && (
    <div className="glass-card p-5 space-y-4">
      <p className="label-caps">{isAuto ? 'Automatic calling' : 'Call numbers'}</p>
      {isAuto ? (
        <p className="text-center text-muted text-sm sm:text-base">
          Numbers are called automatically every <span className="font-bold text-body">{callInterval}s</span>. Keep this
          tab open or let players stay connected — anyone in the game keeps it running.
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
          Last: <span className="font-bold text-blue-300">{formatBingoNumber(lastCalled)}</span> · {called.length}/75
          called
        </p>
      )}
    </div>
  )

  // Primary tab: interactive card for a host-player, read-only board for a host-only host.
  const interactivePlay = hostPlays && game.status === 'active' && (
    <div className="space-y-4">
      {callControl}
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
      {callControl}
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
          onEditName={renameHost}
          joinName={hostJoinName}
          onJoinNameChange={setHostJoinName}
          onJoin={() => void hostJoinGame()}
          joining={hostJoining}
          spectatorHint="Watch the game"
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
              game={game ?? undefined}
              onGameUpdate={setGame}
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
            icon={<ExitIcon size={14} />}
            className="btn-danger-soft"
          />
        </>
      )}
    </div>
  )

  const finished =
    game.status === 'finished' ? (
      <>
        <BingoFinalResultsShareBlock
          game={game}
          players={players}
          winnerName={winnerPlayer?.name ?? null}
          playAgainButton={
            <button
              type="button"
              onClick={() => void confirmPlayAgain()}
              disabled={playingAgain}
              className="btn-secondary w-full py-3 text-base disabled:opacity-60"
            >
              {playingAgain ? 'Starting…' : '↻ Play again · same settings'}
            </button>
          }
          returnToLobbyButton={
            <button
              type="button"
              onClick={() => void confirmReturnToLobby()}
              disabled={playingAgain}
              className="w-full py-2.5 text-sm font-semibold text-muted transition-colors hover:text-body disabled:opacity-60"
            >
              Return to lobby
            </button>
          }
          lobbyNote="Same settings reopens the game for ready-up — watchers and new people can join · lobby lets you tweak settings first."
        />
        {winnerPlayer && hostPlayerId && winner?.player_id === hostPlayerId && (
          <PostWinToCommunity gameType="bingo" gameCode={gameCode} winnerName={hostPlayerName} roundKey={winner?.id} />
        )}
      </>
    ) : null

  // "Play again · same settings" reopened the game as an open lobby flagged for the
  // ready-up ring — the host sees the ring + a "Start game" button instead of the lobby.
  if (game.status === 'waiting' && game.replay_pending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-3 py-8 text-[var(--foreground)]">
        <ReplayReadyRing
          players={players}
          meId={hostPlayerId}
          isHost
          gameCode={gameCode}
          hostToken={hostToken}
          minPlayers={BINGO_MIN_PLAYERS}
          capacityGame={game}
          onToggleReady={() => {}}
          onStart={() => void startGame()}
          starting={starting}
        />
        <button
          type="button"
          onClick={() => void confirmReturnToLobby()}
          disabled={playingAgain}
          className="mt-1 py-2 text-sm font-medium text-muted transition-colors hover:text-body disabled:opacity-60"
        >
          Return to lobby instead
        </button>
      </div>
    )
  }

  // Fresh lobby (not the play-again ready-up flow, handled above).
  const waitingLobby = game.status === 'waiting' && !game.replay_pending
  const canStart = players.length >= BINGO_MIN_PLAYERS

  const lobbyModeCard = (
    <HostModeSelector
      mode={hostMode}
      onChange={changeHostMode}
      joinedPlayerId={hostPlayerId}
      joinedPlayerName={hostPlayerName}
      onEditName={renameHost}
      joinName={hostJoinName}
      onJoinNameChange={setHostJoinName}
      onJoin={() => void hostJoinGame()}
      joining={hostJoining}
      spectatorHint="Watch the game once it starts"
      playerHint="Get a card and play along"
      playingNote={
        <p className="text-sm text-muted">
          Playing as <strong className="text-body">{hostPlayerName}</strong> — you&apos;ll get a card when the game
          starts.
        </p>
      }
    />
  )

  const lobbySettings = (
    <>
      <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))] bg-[var(--card-strong)]/95 p-5 space-y-3">
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
      <TransferHostControl triggerClassName="btn-secondary w-full flex items-center justify-center gap-2" />
    </>
  )

  if (waitingLobby) {
    return (
      <HostLobby
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        gameTypeLabel={cfg.label}
        titleMeta={<GameInfoChips game={game} className="mt-2" />}
        players={players}
        maxPlayers={lobbyMaxPlayersFromGameClient('bingo', game) ?? game.max_players}
        resumeToken={hostResumeToken}
        playCard={lobbyModeCard}
        settingsChildren={lobbySettings}
        onStart={() => void startGame()}
        starting={starting}
        startDisabled={!canStart}
        startDisabledHint={
          canStart
            ? null
            : `Need at least ${BINGO_MIN_PLAYERS} players to start (${players.length}/${BINGO_MIN_PLAYERS})`
        }
        startLabel="Start bingo"
        onRemovePlayer={removePlayer}
        removingPlayerId={removingPlayerId}
        highlightPlayerId={hostPlayerId}
        onEnded={load}
      />
    )
  }

  return (
    <HostGameLayout
      onRemovePlayer={removePlayer}
      gameCode={gameCode}
      status={game.status}
      tab={tab}
      onTabChange={setTab}
      primaryKind={primaryKind}
      game={game}
      players={players}
      hostPlayerId={hostPlayerId}
      onHostRejoined={load}
      showTabs={showTabs}
      gameStarted={gameStarted}
      header={<HostGameHeader game={game} />}
      primary={<div className="max-w-lg mx-auto w-full">{hostPlays ? interactivePlay : watchRound}</div>}
      manage={manage}
      noManageTab={game.status === 'active'}
      finished={finished}
    />
  )
}
