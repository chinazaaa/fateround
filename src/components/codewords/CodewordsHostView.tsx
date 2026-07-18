'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CodewordsActiveRound } from '@/components/codewords/CodewordsActiveRound'
import { CodewordsHostManagePanel } from '@/components/codewords/CodewordsHostManagePanel'
import { CodewordsSpectatorBoard } from '@/components/codewords/CodewordsSpectatorBoard'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { TransferHostControl } from '@/components/TransferHostControl'
import { lobbyMaxPlayersFromGameClient } from '@/lib/game-limits'
import { gameTypeConfig } from '@/lib/game-types'
import {
  CODEWORDS_DEFAULT_OPERATIVE_TIMER,
  CODEWORDS_DEFAULT_SPYMASTER_TIMER,
  CODEWORDS_MIN_PLAYERS,
  codewordsInLobby,
  codewordsPlayerPicks,
  codewordsRandomizeTeams,
  lobbyReadyForGame,
  mergeCodewordsGuesses,
  teamLabel,
} from '@/lib/codewords'
import { useCodewordsRealtime } from '@/hooks/useCodewordsRealtime'
import { useCodewordsNotifications } from '@/hooks/useCodewordsNotifications'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useHostSeat } from '@/hooks/useHostSeat'
import type {
  CodewordsBoard,
  CodewordsGuess,
  CodewordsPlayerRole,
  CodewordsRole,
  CodewordsTeam,
  Game,
  Player,
} from '@/types'
import { useToast } from '@/components/ui/Toast'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { PlayAgainSetup, playAgainNeedsSetup, type PlayAgainPayload } from '@/components/PlayAgainSetup'
import { customQuestionCount, parseQuestionSource } from '@/lib/custom-questions'
import { parseGameType } from '@/lib/game-types'

type HostTab = 'play' | 'manage'

export function CodewordsHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [roles, setRoles] = useState<CodewordsPlayerRole[]>([])
  const [board, setBoard] = useState<CodewordsBoard | null>(null)
  const [guesses, setGuesses] = useState<CodewordsGuess[]>([])
  const [starting, setStarting] = useState(false)
  const [firstTeam, setFirstTeam] = useState<'random' | 'red' | 'blue'>('random')
  const [playingAgain, setPlayingAgain] = useState(false)
  const [ending, setEnding] = useState(false)
  const [randomizingTeams, setRandomizingTeams] = useState(false)
  const [savingRoleFor, setSavingRoleFor] = useState<string | null>(null)
  const [spymasterTimer, setSpymasterTimer] = useState(CODEWORDS_DEFAULT_SPYMASTER_TIMER)
  const [operativeTimer, setOperativeTimer] = useState(CODEWORDS_DEFAULT_OPERATIVE_TIMER)
  const [savingTimers, setSavingTimers] = useState(false)
  const [benchingPlayerId, setBenchingPlayerId] = useState<string | null>(null)
  const [tab, setTab] = useState<HostTab>('manage')
  const [playAgainOpen, setPlayAgainOpen] = useState(false)
  const [lobbyPoolOpen, setLobbyPoolOpen] = useState(false)
  const [savingLobbyPool, setSavingLobbyPool] = useState(false)
  const suppressRoundDataUntilRef = useRef(0)

  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const isReopeningLobby = useCallback(() => Date.now() < suppressRoundDataUntilRef.current, [])

  const applyLobbyReopenState = useCallback((gameData: Game | null) => {
    if (!gameData) return
    setGame({
      ...gameData,
      status: 'waiting',
      current_round_number: 0,
      session_started_at: null,
      finished_at: null,
    })
    setBoard(null)
    setGuesses([])
  }, [])

  const load = useCallback(async () => {
    const [{ data: gameData }, { data: plrs }, { data: roleRows }, { data: boardData }, { data: guessRows }] =
      await Promise.all([
        supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
        supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
        supabase.from('codewords_player_roles').select('*').eq('game_id', gameCode),
        supabase.from('codewords_boards').select('*').eq('game_id', gameCode).maybeSingle(),
        supabase.from('codewords_guesses').select('*').eq('game_id', gameCode).order('created_at', { ascending: true }),
      ])

    const reopening = Date.now() < suppressRoundDataUntilRef.current

    if (gameData) {
      if (reopening || gameData.status === 'waiting') {
        applyLobbyReopenState(gameData)
      } else {
        setGame(gameData)
      }
      setSpymasterTimer(gameData.timer_seconds ?? CODEWORDS_DEFAULT_SPYMASTER_TIMER)
      setOperativeTimer(gameData.operative_timer_seconds ?? CODEWORDS_DEFAULT_OPERATIVE_TIMER)
    }
    setPlayers(plrs ?? [])
    setRoles(roleRows ?? [])
    if (reopening) {
      setBoard(null)
      setGuesses([])
    } else {
      setBoard(boardData as CodewordsBoard | null)
      setGuesses(mergeCodewordsGuesses([], (guessRows as CodewordsGuess[]) ?? []))
    }
  }, [applyLobbyReopenState, gameCode])

  useEffect(() => {
    load()
  }, [gameCode, load])

  useCodewordsRealtime(gameCode, 'host', {
    onGame: (nextGame) => {
      if (isReopeningLobby() || nextGame.status === 'waiting') {
        applyLobbyReopenState(nextGame)
        return
      }
      setGame(nextGame)
    },
    onPlayers: (updater) => setPlayers(updater),
    onRoles: (updater) => setRoles(updater),
    onBoard: (nextBoard) => {
      if (isReopeningLobby() && nextBoard) return
      setBoard(nextBoard)
    },
    onGuesses: (updater) => {
      if (isReopeningLobby()) {
        setGuesses([])
        return
      }
      setGuesses(updater)
    },
    onReload: load,
  })

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
      setRoles((prev) => prev.filter((r) => r.player_id !== playerId))
    },
    [onHostSeatRemoved]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  // Change the lobby team-assignment mode (players pick / host assigns / random)
  // via the game PATCH — mirrors the two flags codewords stores.
  const changeTeamAssignment = useCallback(
    async (mode: 'players' | 'host' | 'randomize') => {
      const flags =
        mode === 'randomize'
          ? { codewords_player_picks: false, codewords_randomize_teams: true }
          : mode === 'host'
            ? { codewords_player_picks: false, codewords_randomize_teams: false }
            : { codewords_player_picks: true, codewords_randomize_teams: false }
      try {
        const res = await fetch(`/api/games/${gameCode}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostToken, ...flags }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toastError(data.error ?? 'Could not update team assignment')
          return
        }
        await load()
      } catch {
        toastError('Could not update team assignment')
      }
    },
    [gameCode, hostToken, load, toastError]
  )

  const lateJoinNotifyReadyRef = useRef(false)
  const prevPlayerIdsRef = useRef<Set<string>>(new Set())
  const prevRolesByPlayerRef = useRef<Map<string, CodewordsPlayerRole>>(new Map())

  useEffect(() => {
    if (!game || game.status !== 'active') {
      lateJoinNotifyReadyRef.current = false
      prevPlayerIdsRef.current = new Set(players.map((p) => p.id))
      prevRolesByPlayerRef.current = new Map(roles.map((r) => [r.player_id, r]))
      return
    }

    if (!lateJoinNotifyReadyRef.current) {
      lateJoinNotifyReadyRef.current = true
      prevPlayerIdsRef.current = new Set(players.map((p) => p.id))
      prevRolesByPlayerRef.current = new Map(roles.map((r) => [r.player_id, r]))
      return
    }

    for (const player of players) {
      const role = roles.find((r) => r.player_id === player.id)
      const prevRole = prevRolesByPlayerRef.current.get(player.id)
      const isNewPlayer = !prevPlayerIdsRef.current.has(player.id)
      if (role?.role === 'operative' && (isNewPlayer || !prevRole)) {
        success(
          isNewPlayer
            ? `${player.name} joined mid-game — ${teamLabel(role.team)} operative`
            : `${player.name} assigned to ${teamLabel(role.team)} team`
        )
      }
    }

    prevPlayerIdsRef.current = new Set(players.map((p) => p.id))
    prevRolesByPlayerRef.current = new Map(roles.map((r) => [r.player_id, r]))
  }, [game, players, roles, success])

  const assignRole = async (playerId: string, team: CodewordsTeam, role: CodewordsRole) => {
    setSavingRoleFor(playerId)
    try {
      const res = await fetch('/api/codewords/host-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken, playerId, team, role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update role')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setSavingRoleFor(null)
    }
  }

  const moveTeam = (playerId: string, team: CodewordsTeam) => {
    const current = roles.find((r) => r.player_id === playerId)
    const role: CodewordsRole = current?.role === 'spymaster' ? 'spymaster' : 'operative'
    void assignRole(playerId, team, role)
  }

  const setSpymaster = (playerId: string, team: CodewordsTeam, makeSpymaster: boolean) => {
    void assignRole(playerId, team, makeSpymaster ? 'spymaster' : 'operative')
  }

  const startGame = async () => {
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, firstTeam: firstTeam === 'random' ? undefined : firstTeam }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start')
      await load()
      success('Codewords started!')
      if (hostMode === 'player') setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const shuffleTeams = async () => {
    setRandomizingTeams(true)
    try {
      const res = await fetch('/api/codewords/randomize-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to shuffle teams')
      await load()
      success('Teams shuffled!')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to shuffle teams')
    } finally {
      setRandomizingTeams(false)
    }
  }

  const benchPlayer = async (playerId: string) => {
    setBenchingPlayerId(playerId)
    try {
      const res = await fetch('/api/codewords/host-role', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken, playerId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to move player to waiting room')
      onHostSeatRemoved(playerId)
      await load()
      success('Player moved to waiting room')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to move player to waiting room')
    } finally {
      setBenchingPlayerId(null)
    }
  }

  const saveTimers = async () => {
    setSavingTimers(true)
    try {
      const res = await fetch('/api/codewords/timers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          hostToken,
          spymasterTimerSeconds: spymasterTimer,
          operativeTimerSeconds: operativeTimer,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update timers')
      if (data.game) setGame(data.game)
      await load()
      success('Timer settings updated')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to update timers')
    } finally {
      setSavingTimers(false)
    }
  }

  const executePlayAgain = async (payload?: PlayAgainPayload) => {
    setPlayingAgain(true)
    suppressRoundDataUntilRef.current = Date.now() + 8000
    setBoard(null)
    setGuesses([])
    setGame((current) =>
      current
        ? {
            ...current,
            status: 'waiting',
            current_round_number: 0,
            session_started_at: null,
            finished_at: null,
            ...(payload?.custom_questions
              ? { custom_questions: payload.custom_questions, question_source: 'custom' as const }
              : {}),
          }
        : current
    )
    setTab('manage')
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostToken,
          hostPlayerId: hostPlayerId ?? undefined,
          ...payload,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset')
      if (data.game) {
        setGame(data.game as Game)
      } else if (payload?.custom_questions) {
        setGame((current) =>
          current
            ? {
                ...current,
                custom_questions: payload.custom_questions,
                question_source: 'custom',
              }
            : current
        )
      }
      await load()
      success('Lobby reopened!')
      setTab('manage')
    } catch (err) {
      suppressRoundDataUntilRef.current = 0
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
      setPlayAgainOpen(false)
    }
  }

  const playAgain = () => {
    if (game && playAgainNeedsSetup(game)) {
      setPlayAgainOpen(true)
      return
    }
    void executePlayAgain()
  }

  const handleLobbyPoolSave = async (payload: PlayAgainPayload = {}) => {
    if (!payload.custom_questions && !payload.question_source) {
      setLobbyPoolOpen(false)
      return
    }
    setSavingLobbyPool(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/lobby-pool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostToken,
          custom_questions: payload.custom_questions,
          question_source: payload.question_source,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save word list')
      if (data.game) setGame(data.game as Game)
      await load()
      success('Word list updated')
      setLobbyPoolOpen(false)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save word list')
    } finally {
      setSavingLobbyPool(false)
    }
  }

  const endSession = async () => {
    setEnding(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/finish-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to end session')
      await load()
      setTab('manage')
      success('Session closed')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to end session')
    } finally {
      setEnding(false)
    }
  }

  const cfg = gameTypeConfig('codewords')
  const playerLink = `${appOrigin()}/game/${gameCode}`
  const playersPickTeams = game ? codewordsPlayerPicks(game) : true
  const randomizeTeams = game ? codewordsRandomizeTeams(game) : false
  const hostMyRole = hostPlayerId ? roles.find((r) => r.player_id === hostPlayerId) : undefined
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const inLobby = game ? codewordsInLobby(game.status, board) : false
  const inActivePlay = game?.status === 'active' && !!board

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  useCodewordsNotifications({
    game,
    board,
    myRole: hostMyRole,
    enabled: !!game && game.status === 'active' && hostMode === 'spectator',
  })

  useEffect(() => {
    if (game?.status === 'finished' || inLobby) setTab('manage')
  }, [game?.status, inLobby])

  useEffect(() => {
    if (inActivePlay) setTab('play')
  }, [inActivePlay])

  if (!game) {
    return <HostLobbySkeleton />
  }

  const showTabs = game.status !== 'finished'
  const gameStarted = inActivePlay // active && board present — respects the lobby-reopen window
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  // Primary tab: interactive round for a host-player with a role, read-only board otherwise.
  const primary = board ? (
    hostPlays && hostMyRole ? (
      <CodewordsActiveRound
        gameCode={gameCode}
        game={game}
        board={board}
        myPlayerId={hostPlayerId!}
        myResumeToken={hostResumeToken}
        myPlayerName={hostPlayerName}
        myRole={hostMyRole}
        players={players}
        roles={roles}
        guesses={guesses}
        onBoardChange={setBoard}
        onReload={load}
      />
    ) : (
      <CodewordsSpectatorBoard board={board} players={players} roles={roles} guesses={guesses} />
    )
  ) : null

  // Lobby mode selector (play card) — reused by the new HostLobby and the tabbed manage.
  const codewordsModeCard = (
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
      spectatorHint="Watch once the round starts"
      playerHint="Join a team below · Play tab opens once the round starts"
      playingNote={
        <p className="text-xs text-muted">
          Playing as <strong>{hostPlayerName}</strong> —{' '}
          {randomizeTeams
            ? 'pick spymasters in Teams below, then shuffle or start.'
            : playersPickTeams
              ? 'pick your team in Teams below, or assign yourself there.'
              : 'assign yourself in Teams below.'}
        </p>
      }
    />
  )

  // Shared props for CodewordsHostManagePanel (teams + settings). Rendered in the tabbed
  // manage and — with embeddedInLobby — as the new HostLobby's main-screen children.
  const codewordsPanelProps = {
    game,
    gameCode,
    hostToken,
    playerLink,
    players,
    roles,
    board,
    guesses,
    hostPlayerId,
    hostPlays,
    spymasterTimer,
    operativeTimer,
    savingTimers,
    savingRoleFor,
    starting,
    playingAgain,
    ending,
    onSpymasterTimerChange: setSpymasterTimer,
    onOperativeTimerChange: setOperativeTimer,
    onSaveTimers: saveTimers,
    onSetSpymaster: setSpymaster,
    onMoveTeam: moveTeam,
    firstTeam,
    onFirstTeamChange: setFirstTeam,
    teamAssignment: (randomizeTeams ? 'randomize' : playersPickTeams ? 'players' : 'host') as
      | 'players'
      | 'host'
      | 'randomize',
    onTeamAssignmentChange: changeTeamAssignment,
    onStartGame: startGame,
    onRandomizeTeams: shuffleTeams,
    randomizingTeams,
    onPlayAgain: playAgain,
    onEndSession: endSession,
    onReload: load,
    onGameUpdate: setGame,
    onBenchPlayer: benchPlayer,
    onRemovePlayer: removePlayer,
    benchingPlayerId,
    removingPlayerId,
    customWordCount:
      game && parseQuestionSource(game.question_source, parseGameType(game.game_type)) === 'custom'
        ? customQuestionCount(game)
        : 0,
    onEditWordPool: game ? () => setLobbyPoolOpen(true) : undefined,
    savingWordPool: savingLobbyPool,
    settingsBottom:
      game.status === 'waiting' ? (
        <HostLobbySettingBlock title="Late joiners">
          <HostAllowViewersField
            embedded
            hideHeader
            gameCode={gameCode}
            hostToken={hostToken}
            game={game}
            onGameUpdate={setGame}
          />
        </HostLobbySettingBlock>
      ) : undefined,
  }

  const manage = (
    <div className="space-y-4 sm:space-y-5 animate-stagger">
      {game.status === 'waiting' && codewordsModeCard}

      <HostRulesRow gameType="codewords" />

      <CodewordsHostManagePanel {...codewordsPanelProps} />

      {game.status === 'active' && (
        <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
      )}
    </div>
  )

  // Fresh lobby (not the play-again ready-up flow, which keeps the tabbed layout for now).
  const waitingLobby = inLobby && !game.replay_pending
  const playerIds = players.map((p) => p.id)
  const lobbyReady = lobbyReadyForGame(roles, playerIds, randomizeTeams)
  const canStart = players.length >= CODEWORDS_MIN_PLAYERS && lobbyReady.ok

  return (
    <>
      {waitingLobby ? (
        <HostLobby
          gameCode={gameCode}
          hostToken={hostToken}
          game={game}
          gameTypeLabel={cfg.label}
          players={players}
          maxPlayers={lobbyMaxPlayersFromGameClient('codewords', game) ?? game.max_players}
          resumeToken={hostResumeToken}
          playCard={codewordsModeCard}
          settingsChildren={
            <>
              <CodewordsHostManagePanel {...codewordsPanelProps} embeddedInLobby slot="lobby-settings" />
              <TransferHostControl triggerClassName="btn-secondary w-full flex items-center justify-center gap-2" />
            </>
          }
          onStart={() => void startGame()}
          starting={starting}
          startDisabled={!canStart}
          startDisabledHint={
            players.length < CODEWORDS_MIN_PLAYERS
              ? `Need at least ${CODEWORDS_MIN_PLAYERS} players to start (${players.length}/${CODEWORDS_MIN_PLAYERS})`
              : lobbyReady.ok
                ? null
                : lobbyReady.error
          }
          startLabel="Start codewords"
          onRemovePlayer={removePlayer}
          removingPlayerId={removingPlayerId}
          highlightPlayerId={hostPlayerId}
          onEnded={load}
        >
          <CodewordsHostManagePanel {...codewordsPanelProps} embeddedInLobby slot="lobby-teams" />
        </HostLobby>
      ) : (
        <HostGameLayout
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
          primary={primary}
          manage={manage}
        />
      )}

      {game && (
        <PlayAgainSetup
          open={playAgainOpen}
          onClose={() => setPlayAgainOpen(false)}
          game={game}
          participants={[]}
          loading={playingAgain}
          onConfirm={(payload) => executePlayAgain(payload)}
        />
      )}
      {game && (
        <PlayAgainSetup
          open={lobbyPoolOpen}
          onClose={() => setLobbyPoolOpen(false)}
          game={game}
          participants={[]}
          loading={savingLobbyPool}
          variant="lobby"
          onConfirm={(payload) => handleLobbyPoolSave(payload)}
        />
      )}
    </>
  )
}
