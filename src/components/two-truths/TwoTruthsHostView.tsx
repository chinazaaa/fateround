'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TwoTruthsActiveRound } from '@/components/two-truths/TwoTruthsActiveRound'
import { TwoTruthsHostManagePanel } from '@/components/two-truths/TwoTruthsHostManagePanel'
import { TwoTruthsLobbySubmit } from '@/components/two-truths/TwoTruthsLobbySubmit'
import { HostActiveSettings } from '@/components/host/HostActiveSettings'
import { HostLeaveSeatButton } from '@/components/host/HostLeaveSeatButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { HostMaxPlayersLobbyPanel } from '@/components/host-lobby/HostMaxPlayersLobbyPanel'
import { TransferHostControl } from '@/components/TransferHostControl'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { gameTypeConfig } from '@/lib/game-types'
import { useTwoTruthsAdvance } from '@/hooks/useTwoTruthsAdvance'
import { lobbyReadyForTwoTruths, ownTtlStatementIsFresh, TTL_TIMER_OPTIONS, visibleTtlGuesses } from '@/lib/two-truths'
import { fetchMyTtlGuesses, fetchMyTtlStatement } from '@/lib/two-truths-client'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  PLAYER_SELECT,
  ROUND_SELECT,
  TTL_GUESS_PROGRESS_SELECT,
  TTL_STATEMENT_SELECT,
} from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useHostSeat } from '@/hooks/useHostSeat'
import type { Game, Player, Round, TtlGuess, TtlGuessProgress, TtlStatement } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'

type HostTab = 'play' | 'manage'

export function TwoTruthsHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [statements, setStatements] = useState<TtlStatement[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [guessProgress, setGuessProgress] = useState<TtlGuessProgress[]>([])
  const [ownGuesses, setOwnGuesses] = useState<TtlGuess[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [savingTimer, setSavingTimer] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(45)
  const [tab, setTab] = useState<HostTab>('manage')
  const [editingStatements, setEditingStatements] = useState(false)

  useScrollHostViewToTop({ gameStatus: game?.status, tab })
  useTurnNotifications({ status: game?.status })

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, stmtsRes, rdsRes, gssRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('ttl_statements').select(TTL_STATEMENT_SELECT).eq('game_id', gameCode),
      supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      supabase.from('ttl_guesses').select(TTL_GUESS_PROGRESS_SELECT).eq('game_id', gameCode),
    ])
    if (!supabasePollOk(gameRes, plrsRes, stmtsRes, rdsRes, gssRes)) return false
    if (gameRes.data) {
      setGame(gameRes.data)
      setTimerSeconds(gameRes.data.timer_seconds ?? 45)
    }
    setPlayers(plrsRes.data ?? [])
    setStatements(stmtsRes.data ?? [])
    setRounds(rdsRes.data ?? [])
    setGuessProgress(gssRes.data ?? [])
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
    onModeChange: (mode) => {
      if (mode === 'spectator') setTab('manage')
    },
  })

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      onHostSeatRemoved(playerId)
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [onHostSeatRemoved]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  // Realtime push: reload on any change to this game's row + its tables.
  const connected = useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'ttl_statements', 'rounds', 'ttl_guesses'],
    load
  )

  usePolling(() => load(), [gameCode, load], {
    intervalMs: game?.status === 'waiting' ? POLL_INTERVALS.lobby : POLL_INTERVALS.realtimeFallback,
    enabled: game?.status === 'waiting' || !connected,
    runImmediately: false,
  })

  useTwoTruthsAdvance({
    gameCode,
    game: game ?? ({ status: 'waiting', id: gameCode } as Game),
    enabled: !!game && game.status === 'active',
    onAdvanced: load,
  })

  const prevMyStatement = useRef<TtlStatement | null | undefined>(undefined)

  // Land on the primary (Play/Watch) tab when the game starts, and on Manage when it ends.
  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [game?.status])

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
      if (hostMode === 'player' && hostPlayerId) setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const saveTimer = async () => {
    setSavingTimer(true)
    try {
      const res = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, timer_seconds: timerSeconds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save timer')
      if (data.game) setGame(data.game)
      success('Timer updated')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save timer')
    } finally {
      setSavingTimer(false)
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
      setRounds([])
      setGuessProgress([])
      setOwnGuesses([])
      setStatements([])
      await load()
      success('Lobby reopened!')
      setTab('manage')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  // The bulk read is the roster ("who has submitted") and no longer carries `lie_index` —
  // it's revoked from the anon role. The host's own row, lie included, comes from the
  // token-gated route; prefer it and fall back to the roster row until it lands.
  const rosterStatement = hostPlayerId ? (statements.find((s) => s.player_id === hostPlayerId) ?? null) : null
  const [ownStatement, setOwnStatement] = useState<TtlStatement | null>(null)
  const rosterStatementId = rosterStatement?.id ?? null
  const rosterStatementStamp = rosterStatement?.updated_at ?? null
  useEffect(() => {
    if (!hostResumeToken || !rosterStatementId) return
    let cancelled = false
    void fetchMyTtlStatement(gameCode, hostResumeToken).then((row) => {
      if (!cancelled) setOwnStatement(row)
    })
    return () => {
      cancelled = true
    }
  }, [gameCode, hostResumeToken, rosterStatementId, rosterStatementStamp])
  // Ignore a stale own-row: a different player, a lobby reset that cleared the submission, or
  // a re-submit (which UPSERTs the SAME row id and only bumps updated_at) whose refetch has
  // not landed yet. See ownTtlStatementIsFresh.
  const myStatement = (ownTtlStatementIsFresh(ownStatement, rosterStatement) ? ownStatement : null) ?? rosterStatement
  const existingStatements = myStatement
    ? ([myStatement.statement_a, myStatement.statement_b, myStatement.statement_c] as [string, string, string])
    : null

  // Reset edit mode when statement is freshly saved
  useEffect(() => {
    if (!prevMyStatement.current && myStatement) setEditingStatements(false)
    prevMyStatement.current = myStatement
  }, [myStatement])

  // The bulk `ttl_guesses` read is PROGRESS only — guessed_index/is_correct/points are revoked
  // from anon, because a round ends only once every guesser has answered and those columns
  // handed the lie to whoever had not. A host-player's own rows come from the token-gated
  // route; everyone else's arrive folded into the round metadata at reveal, which is what the
  // host leaderboard scores off.
  const myGuessKey = useMemo(
    () =>
      guessProgress
        .filter((g) => g.player_id === hostPlayerId)
        .map((g) => g.id)
        .sort()
        .join(','),
    [guessProgress, hostPlayerId]
  )
  useEffect(() => {
    if (!hostResumeToken || !myGuessKey) {
      setOwnGuesses([])
      return
    }
    let cancelled = false
    void fetchMyTtlGuesses(gameCode, hostResumeToken).then((rows) => {
      if (!cancelled && rows) setOwnGuesses(rows)
    })
    return () => {
      cancelled = true
    }
  }, [gameCode, hostResumeToken, myGuessKey])
  const guesses = useMemo(() => visibleTtlGuesses(rounds, ownGuesses), [rounds, ownGuesses])

  const hostPlays = hostMode === 'player' && !!hostPlayerId

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  // Host controls for the active room live in the main-header ⚙ gear (no Manage tab —
  // gameplay is the body, roster + Remove in the drawer): late-join rules + End game.
  const hostSettingsNode = useMemo(
    () =>
      game?.status === 'active' ? (
        <HostActiveSettings gameCode={gameCode} hostToken={hostToken} gameType="two_truths" onEnded={load}>
          <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
          {hostMode === 'player' && !!hostPlayerId && (
            <HostLeaveSeatButton onLeave={leaveSeatKeepHosting} className="btn-secondary w-full py-3 text-base" />
          )}
        </HostActiveSettings>
      ) : null,
    [game, gameCode, hostToken, load, hostMode, hostPlayerId, leaveSeatKeepHosting]
  )
  useRegisterGameSettings(hostSettingsNode)

  if (!game) {
    return <HostLobbySkeleton />
  }

  const cfg = gameTypeConfig('two_truths')
  const playerLink = `${appOrigin()}/game/${gameCode}`

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  const panelProps = {
    game,
    gameCode,
    hostToken,
    playerLink,
    players,
    statements,
    rounds,
    guesses,
    starting,
    playingAgain,
    onStartGame: startGame,
    onPlayAgain: playAgain,
    onReload: load,
    timerSeconds,
    onTimerChange: setTimerSeconds,
    savingTimer,
    onSaveTimer: saveTimer,
    onRemovePlayer: removePlayer,
    removingPlayerId,
    onGameUpdate: setGame,
  }

  // Host-player's own statement setup (lobby only) — their input, so it lives with Manage.
  const hostStatementSetup =
    hostPlays &&
    hostPlayerId &&
    game.status === 'waiting' &&
    (myStatement && !editingStatements ? (
      <div className="glass-card p-5 space-y-4">
        <EditNameInline
          gameCode={gameCode}
          playerId={hostPlayerId}
          currentName={hostPlayerName}
          onRenamed={() => void load()}
        />
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-5 text-center space-y-1">
          <p className="text-2xl">✓</p>
          <p className="font-semibold text-emerald-800 dark:text-emerald-200">Statements submitted</p>
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Start the game below when everyone&apos;s ready.
          </p>
        </div>
        <button type="button" onClick={() => setEditingStatements(true)} className="btn-secondary w-full">
          Edit my statements
        </button>
      </div>
    ) : (
      <div className="glass-card p-5 space-y-4">
        <EditNameInline
          gameCode={gameCode}
          playerId={hostPlayerId}
          currentName={hostPlayerName}
          onRenamed={() => void load()}
        />
        <p className="label-caps">Your statements</p>
        <TwoTruthsLobbySubmit
          gameCode={gameCode}
          resumeToken={hostResumeToken}
          existingLieIndex={myStatement?.lie_index}
          existingStatements={existingStatements}
          onSaved={() => {
            setEditingStatements(false)
            void load()
          }}
        />
        {myStatement && (
          <button type="button" onClick={() => setEditingStatements(false)} className="btn-secondary w-full">
            Cancel
          </button>
        )}
      </div>
    ))

  // Primary tab: interactive round for a host-player, read-only gameplay for a host-only host.
  const interactivePlay = hostPlayerId && (
    <TwoTruthsActiveRound
      gameCode={gameCode}
      game={game}
      players={players}
      rounds={rounds}
      guesses={guesses}
      guessProgress={guessProgress}
      myPlayerId={hostPlayerId}
      myResumeToken={hostResumeToken}
      playerName={hostPlayerName}
      onReload={load}
      skipGameSync
    />
  )
  const watchRound = <TwoTruthsHostManagePanel {...panelProps} section="watch" />

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
          onEditName={renameHost}
          spectatorHint="Watch the game from the Watch tab"
          playingNote={
            <p className="text-sm text-muted">
              Playing as <strong className="text-body">{hostPlayerName}</strong> — submit your statements below before
              you start.
            </p>
          }
        />
      )}
      {hostStatementSetup}
      {game.status !== 'finished' && <HostRulesRow gameType="two_truths" />}
      <TwoTruthsHostManagePanel {...panelProps} section="manage" />
    </div>
  )

  // Fresh lobby (not the play-again ready-up flow, which keeps the tabbed layout for now).
  const waitingLobby = game.status === 'waiting' && !game.replay_pending
  const ready = lobbyReadyForTwoTruths(
    players.map((p) => p.id),
    statements
  )

  const lobbyModeCard = (
    <HostModeSelector
      mode={hostMode}
      onChange={changeHostMode}
      joinedPlayerId={hostPlayerId}
      joinedPlayerName={hostPlayerName}
      joinName={hostJoinName}
      onJoinNameChange={setHostJoinName}
      onJoin={() => void hostJoinGame()}
      joining={hostJoining}
      onEditName={renameHost}
      spectatorHint="Watch the game once it starts"
      playerHint="Play along with everyone"
      playingNote={
        <p className="text-sm text-muted">
          Playing as <strong className="text-body">{hostPlayerName}</strong> — submit your statements below before you
          start.
        </p>
      }
    />
  )

  const lobbySettings = (
    <>
      <HostMaxPlayersLobbyPanel
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        limitType="two_truths"
        playerCount={players.length}
        onGameUpdate={setGame}
      />
      <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))] bg-[var(--card-strong)]/95 p-5 space-y-2">
        <p className="label-caps">Guess timer (per round)</p>
        <select
          value={timerSeconds}
          onChange={(e) => setTimerSeconds(Number(e.target.value))}
          className="input-field w-full"
        >
          {TTL_TIMER_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s} seconds
            </option>
          ))}
        </select>
        <button type="button" onClick={saveTimer} disabled={savingTimer} className="btn-secondary w-full">
          {savingTimer ? 'Saving…' : 'Save timer'}
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
        maxPlayers={lobbyMaxPlayersFromGameClient('two_truths', game) ?? game.max_players}
        resumeToken={hostResumeToken}
        playCard={lobbyModeCard}
        settingsChildren={lobbySettings}
        onStart={() => void startGame()}
        starting={starting}
        startDisabled={!ready.ok}
        startDisabledHint={ready.ok ? null : ready.error}
        startLabel="Start game"
        onRemovePlayer={removePlayer}
        removingPlayerId={removingPlayerId}
        highlightPlayerId={hostPlayerId}
        onEnded={load}
      >
        {hostStatementSetup}
      </HostLobby>
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
      primary={hostPlays ? interactivePlay : watchRound}
      manage={manage}
      noManageTab={game?.status === 'active'}
      finished={<TwoTruthsHostManagePanel {...panelProps} section="finished" />}
    />
  )
}
