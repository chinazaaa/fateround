'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CodewordsActiveRound } from '@/components/codewords/CodewordsActiveRound'
import { CodewordsHostManagePanel } from '@/components/codewords/CodewordsHostManagePanel'
import { CodewordsSpectatorBoard } from '@/components/codewords/CodewordsSpectatorBoard'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { HostLobbySettingBlock } from '@/components/host-lobby/HostLobbySettingBlock'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { gameTypeConfig } from '@/lib/game-types'
import {
  CODEWORDS_DEFAULT_OPERATIVE_TIMER,
  CODEWORDS_DEFAULT_SPYMASTER_TIMER,
  codewordsInLobby,
  codewordsPlayerPicks,
  codewordsRandomizeTeams,
  getCodewordsHostMode,
  mergeCodewordsGuesses,
  setCodewordsHostMode,
  teamLabel,
  type CodewordsHostMode,
} from '@/lib/codewords'
import { useCodewordsRealtime } from '@/hooks/useCodewordsRealtime'
import { useCodewordsNotifications } from '@/hooks/useCodewordsNotifications'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { useHostPlayerReconciliation } from '@/hooks/useHostPlayerReconciliation'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
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
  const [hostMode, setHostMode] = useState<CodewordsHostMode>('spectator')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostResumeToken, setHostResumeToken] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
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
    setHostMode(getCodewordsHostMode(gameCode))
    const session = getPlayerSession(gameCode)
    if (session) {
      setHostPlayerId(session.playerId)
      setHostResumeToken(session.resumeToken ?? null)
      setHostPlayerName(session.playerName)
    }
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

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      if (playerId === hostPlayerId) {
        setHostPlayerId(null)
        setHostResumeToken(null)
        setHostPlayerName('')
        clearPlayerSession(gameCode)
        setHostMode('spectator')
        setCodewordsHostMode(gameCode, 'spectator')
      }
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
      setRoles((prev) => prev.filter((r) => r.player_id !== playerId))
    },
    [gameCode, hostPlayerId]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  // Clear stale host-as-player state if the host's own row is removed elsewhere.
  useHostPlayerReconciliation(players, hostPlayerId, () => handlePlayerRemoved(hostPlayerId!))

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

  const changeHostMode = (mode: CodewordsHostMode) => {
    if (game?.status !== 'waiting') return
    setHostMode(mode)
    setCodewordsHostMode(gameCode, mode)
    if (mode === 'spectator') setTab('manage')
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
      setCodewordsHostMode(gameCode, 'player')
      await load()
      success(`Joined as ${data.playerName}`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
    }
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
      if (playerId === hostPlayerId) {
        setHostPlayerId(null)
        setHostResumeToken(null)
        setHostPlayerName('')
        clearPlayerSession(gameCode)
      }
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
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
          spectatorHint="Watch from the Watch tab"
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
      )}

      <HostRulesRow gameType="codewords" />

      <CodewordsHostManagePanel
        game={game}
        gameCode={gameCode}
        hostToken={hostToken}
        playerLink={playerLink}
        players={players}
        roles={roles}
        board={board}
        guesses={guesses}
        spymasterTimer={spymasterTimer}
        operativeTimer={operativeTimer}
        savingTimers={savingTimers}
        savingRoleFor={savingRoleFor}
        starting={starting}
        playingAgain={playingAgain}
        ending={ending}
        onSpymasterTimerChange={setSpymasterTimer}
        onOperativeTimerChange={setOperativeTimer}
        onSaveTimers={saveTimers}
        onSetSpymaster={setSpymaster}
        onMoveTeam={moveTeam}
        firstTeam={firstTeam}
        onFirstTeamChange={setFirstTeam}
        onStartGame={startGame}
        onRandomizeTeams={shuffleTeams}
        randomizingTeams={randomizingTeams}
        onPlayAgain={playAgain}
        onEndSession={endSession}
        onReload={load}
        onGameUpdate={setGame}
        onBenchPlayer={benchPlayer}
        onRemovePlayer={removePlayer}
        benchingPlayerId={benchingPlayerId}
        removingPlayerId={removingPlayerId}
        customWordCount={
          game && parseQuestionSource(game.question_source, parseGameType(game.game_type)) === 'custom'
            ? customQuestionCount(game)
            : 0
        }
        onEditWordPool={
          // Available regardless of source — host can switch Platform / Library / Your own.
          game ? () => setLobbyPoolOpen(true) : undefined
        }
        savingWordPool={savingLobbyPool}
        settingsBottom={
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
          ) : undefined
        }
      />

      {game.status === 'active' && (
        <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
      )}
    </div>
  )

  return (
    <>
      <HostGameLayout
        gameCode={gameCode}
        status={game.status}
        tab={tab}
        onTabChange={setTab}
        primaryKind={primaryKind}
        showTabs={showTabs}
        gameStarted={gameStarted}
        header={<HostGameHeader game={game} />}
        primary={primary}
        manage={manage}
      />

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
