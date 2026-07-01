'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import { CodewordsLeaveButton } from '@/components/codewords/CodewordsLeaveButton'
import { CodewordsFinalResultsShareBlock } from '@/components/codewords/CodewordsFinalResultsShareBlock'
import { CodewordsEndGameStats } from '@/components/codewords/CodewordsEndGameStats'
import { CodewordsActiveRound } from '@/components/codewords/CodewordsActiveRound'
import { CodewordsScoreboard } from '@/components/codewords/CodewordsScoreboard'
import { CodewordsBoardGrid, CodewordsTeamBadge } from '@/components/codewords/CodewordsBoardGrid'
import { CodewordsCurrentClueCard } from '@/components/codewords/CodewordsCurrentClueCard'
import { CodewordsWaitingPanel } from '@/components/codewords/CodewordsWaitingPanel'
import { GameLobbyPlayerList } from '@/components/ui/GameLobbyPlayerList'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { gameTypeConfig } from '@/lib/game-types'
import {
  codewordsPlayerPicks,
  codewordsRandomizeTeams,
  guessAttributionMap,
  mergeCodewordsGuesses,
  roleLabel,
  teamLabel,
  waitingTurnMessage,
} from '@/lib/codewords'
import { useCodewordsRealtime } from '@/hooks/useCodewordsRealtime'
import { useCodewordsNotifications } from '@/hooks/useCodewordsNotifications'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { allowLateJoin, allowLatePlayers, playerIsViewer, preJoinScreen } from '@/lib/viewers'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import { markPlayerReady } from '@/lib/player-ready'
import { resolvePlayerSession } from '@/lib/player-resume'
import type {
  CodewordsBoard,
  CodewordsGuess,
  CodewordsPlayerRole,
  CodewordsRole,
  CodewordsTeam,
  Game,
  Player,
} from '@/types'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { useToast } from '@/components/ui/Toast'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'late_join_choice'
  | 'game_ended'
  | 'lobby'
  | 'active'
  | 'finished'
  | 'not_found'

export function CodewordsPlayerView({ gameCode }: { gameCode: string }) {
  const { success, error: toastError } = useToast()
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myResumeToken, setMyResumeToken] = useState<string | null>(null)
  const [myPlayerName, setMyPlayerName] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  const [myRole, setMyRole] = useState<CodewordsPlayerRole | null>(null)
  const [board, setBoard] = useState<CodewordsBoard | null>(null)
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [allRoles, setAllRoles] = useState<CodewordsPlayerRole[]>([])
  const [guesses, setGuesses] = useState<CodewordsGuess[]>([])
  const [pickingTeam, setPickingTeam] = useState<CodewordsTeam | null>(null)
  const [pickingRole, setPickingRole] = useState<CodewordsRole | null>(null)
  const [savingRole, setSavingRole] = useState(false)
  const myPlayerIdRef = useRef<string | null>(null)

  useEffect(() => {
    myPlayerIdRef.current = myPlayerId
  }, [myPlayerId])

  const handlePlayerRemoved = useCallback(() => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyResumeToken(null)
    setMyPlayerName('')
    setMyRole(null)
    setJoinName('')
    setScreen('join')
    toastError('You were removed from the game')
  }, [gameCode, toastError])

  const leaveGame = useCallback(() => {
    myPlayerIdRef.current = null
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyResumeToken(null)
    setMyPlayerName('')
    setMyRole(null)
    setJoinName('')
    setScreen('join')
  }, [gameCode])

  const refreshMyRole = useCallback(
    async (playerId: string | null) => {
      if (!playerId) {
        setMyRole(null)
        return
      }
      const { data: role } = await supabase
        .from('codewords_player_roles')
        .select('*')
        .eq('game_id', gameCode)
        .eq('player_id', playerId)
        .maybeSingle()
      const typed = role as CodewordsPlayerRole | null
      setMyRole(typed)
      if (typed) {
        setPickingTeam(typed.team)
        setPickingRole(typed.role)
      }
    },
    [gameCode]
  )

  const syncScreen = useCallback((gameData: Game, playerId: string | null) => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') {
        setScreen('game_started_waiting')
        return
      }
      if (pre === 'late_join_choice') {
        setScreen('late_join_choice')
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
      setScreen(playerId ? 'lobby' : 'join')
      return
    }
    if (gameData.status === 'active') {
      setScreen(playerId ? 'active' : 'join')
      return
    }
    setScreen(playerId ? 'finished' : 'game_ended')
  }, [])

  const loadBoard = useCallback(async () => {
    const { data: boardData } = await supabase
      .from('codewords_boards')
      .select('*')
      .eq('game_id', gameCode)
      .maybeSingle()
    if (boardData) setBoard(boardData as CodewordsBoard)
    return boardData as CodewordsBoard | null
  }, [gameCode])

  const loadGuesses = useCallback(async () => {
    const { data } = await supabase
      .from('codewords_guesses')
      .select('*')
      .eq('game_id', gameCode)
      .order('created_at', { ascending: true })
    setGuesses(mergeCodewordsGuesses([], (data as CodewordsGuess[]) ?? []))
  }, [gameCode])

  const loadScoreboard = useCallback(async () => {
    const [{ data: plrs }, { data: roleRows }] = await Promise.all([
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('codewords_player_roles').select('*').eq('game_id', gameCode),
    ])
    setAllPlayers(plrs ?? [])
    setAllRoles(roleRows ?? [])
  }, [gameCode])

  const load = useCallback(async () => {
    const [{ data: gameData }, { data: plrs }] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])

    if (!gameData) {
      setScreen('not_found')
      return
    }

    setGame(gameData)

    const session = await resolvePlayerSession(gameCode, plrs ?? [])
    const playerId = session?.playerId ?? null
    if (session) {
      setMyPlayerId(session.playerId)
      setMyResumeToken(session.resumeToken ?? null)
      setMyPlayerName(session.playerName)
      await refreshMyRole(session.playerId)
    } else {
      setMyPlayerId(null)
      setMyResumeToken(null)
      setMyPlayerName('')
      setMyRole(null)
    }

    if (gameData.status === 'active' || gameData.status === 'finished') {
      await Promise.all([loadBoard(), loadScoreboard(), loadGuesses()])
    } else {
      setBoard(null)
      setGuesses([])
      await loadScoreboard()
    }

    syncScreen(gameData, playerId)
  }, [gameCode, loadBoard, loadGuesses, loadScoreboard, refreshMyRole, syncScreen])

  useEffect(() => {
    load()
  }, [load])

  useCodewordsRealtime(gameCode, 'player', {
    onGame: (next) => {
      setGame(next)
      syncScreen(next, myPlayerId)
      if (next.status === 'active') {
        void loadBoard()
        void loadScoreboard()
        void loadGuesses()
      }
      if (next.status === 'waiting') {
        setBoard(null)
        setGuesses([])
        void refreshMyRole(myPlayerId)
        void loadScoreboard()
      }
    },
    onPlayers: (updater) => {
      setAllPlayers((prev) => {
        const next = updater(prev)
        const playerId = myPlayerIdRef.current
        if (playerId && prev.some((p) => p.id === playerId) && !next.some((p) => p.id === playerId)) {
          handlePlayerRemoved()
        }
        return next
      })
    },
    onRoles: (updater) => {
      setAllRoles((prev) => {
        const next = updater(prev)
        return next
      })
      void refreshMyRole(myPlayerId)
    },
    onBoard: setBoard,
    onGuesses: (updater) => setGuesses(updater),
    onReload: load,
  })

  useEffect(() => {
    if (screen !== 'active' || board) return
    void loadBoard()
  }, [board, loadBoard, screen])

  const joinGame = useCallback(
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
            ...(game?.status === 'active' ? { joinAsViewer: opts?.joinAsViewer } : {}),
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to join')
        setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender, data.resumeToken)
        setMyPlayerId(data.playerId)
        setMyResumeToken(data.resumeToken ?? null)
        setMyPlayerName(data.playerName)
        if (data.codewordsRole) setMyRole(data.codewordsRole)
        await load()
        if (data.codewordsRole) {
          success(`You're ${teamLabel(data.codewordsRole.team)} operative`)
        } else {
          success(`Joined as ${data.playerName}`)
        }
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Failed to join')
      } finally {
        setJoining(false)
      }
    },
    [game?.status, gameCode, joinExtras, joinName, load, success, toastError]
  )

  useRoomMemberAutoJoin({
    gameCode,
    displayName: roomDisplayName,
    resolving: resolvingRoomMember,
    screen,
    gameStatus: game?.status,
    hasPlayerSession: !!myPlayerId,
    joining,
    onJoin: (name) => joinGame({ name }),
  })

  const saveRole = async () => {
    if (!myPlayerId || !pickingTeam || !pickingRole) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setSavingRole(true)
    try {
      const res = await fetch('/api/codewords/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, team: pickingTeam, role: pickingRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save role')
      setMyRole(data.role)
      success(`You're ${teamLabel(pickingTeam)} ${roleLabel(pickingRole)}`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save role')
    } finally {
      setSavingRole(false)
    }
  }

  const openLobbyJoin = useCallback(() => {
    setScreen('join')
    void load()
  }, [load])

  const markReady = useCallback(async () => {
    if (!myResumeToken) return
    await markPlayerReady(gameCode, myResumeToken)
    await load()
  }, [gameCode, load, myResumeToken])

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting' || screen === 'late_join_choice') void load()
  })

  const cfg = gameTypeConfig('codewords')
  const me = allPlayers.find((p) => p.id === myPlayerId)
  const isViewer = !!(game && me && playerIsViewer(me, game))
  const { context: viewerPromoteContext } = useLateJoinContext(gameCode, game, isViewer && screen === 'active')
  const playersPickTeams = game ? codewordsPlayerPicks(game) : true
  const randomizeTeams = game ? codewordsRandomizeTeams(game) : false
  const lateJoinAllowed = game ? allowLateJoin(game) : false
  const lateJoinAsPlayer = game ? allowLatePlayers(game) : false
  const { context: lateJoinContext, loading: lateJoinContextLoading } = useLateJoinContext(
    gameCode,
    game,
    screen === 'late_join_choice'
  )
  const myTeam = myRole?.team
  const needsTeamPick = !!myPlayerId && !myRole && playersPickTeams && !randomizeTeams && game?.status === 'waiting'
  const waitingInLobby = !!myPlayerId && !myRole && game?.status === 'waiting' && (!playersPickTeams || randomizeTeams)
  const waitingForAssignment =
    !!myPlayerId && !myRole && game?.status === 'active' && !lateJoinAllowed && !playersPickTeams

  useCodewordsNotifications({
    game,
    board,
    myRole,
    enabled: !!myPlayerId && !!game && screen !== 'active',
  })

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  if (screen === 'not_found') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-xl font-bold">Game not found</p>
      </div>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={openLobbyJoin} />
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'late_join_choice' && game) {
    return (
      <LateJoinChoice
        gameCode={gameCode}
        game={game}
        context={lateJoinContext}
        contextLoading={lateJoinContextLoading}
        playersAllowed={game ? allowLatePlayers(game) : false}
        showNameField
        nameInput={joinName}
        onNameChange={setJoinName}
        joining={joining}
        onJoinAsViewer={() => void joinGame({ joinAsViewer: true })}
        onJoinAsPlayer={() => void joinGame({ joinAsViewer: false })}
      />
    )
  }

  if (screen === 'join') {
    if (resolvingRoomMember) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted text-lg">Joining from your game room…</p>
        </div>
      )
    }

    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        header={<GameJoinHeader emoji={cfg.headerEmoji} title={game?.title} gameType="codewords" />}
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void joinGame()}
          joining={joining}
          hint={
            game?.status === 'active'
              ? lateJoinAllowed
                ? 'This game is in progress — join as a player (auto-assigned to a team) or watch as a viewer.'
                : 'This game has already started.'
              : playersPickTeams
                ? "You'll pick a team and role in the lobby before the host starts."
                : randomizeTeams
                  ? 'The host picks spymasters — your team is shuffled when the game starts.'
                  : 'The host will assign your team and role in the lobby.'
          }
        />
      </GameJoinLobbyShell>
    )
  }

  const leaveButton = myPlayerId ? (
    <CodewordsLeaveButton gameCode={gameCode} playerId={myPlayerId} onLeft={leaveGame} />
  ) : null

  if (needsTeamPick || waitingInLobby) {
    const isSpectator = me?.spectator === true
    return (
      <GameJoinLobbyShell gameCode={gameCode}>
        <div className="space-y-5">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-black">
              {game?.status === 'active'
                ? 'Join the game'
                : randomizeTeams
                  ? 'Waiting for teams'
                  : playersPickTeams
                    ? 'Pick your team & role'
                    : 'Waiting in lobby'}
            </h2>
            {!isSpectator ? <p className="text-muted text-sm">Playing as {myPlayerName}</p> : null}
            <p className="flex items-center justify-center gap-1.5 pt-0.5 text-sm font-bold text-[var(--foreground)]">
              <span className="leading-none">{cfg.headerEmoji}</span>
              <span>{cfg.label}</span>
            </p>
          </div>
          {isSpectator && game?.status === 'waiting' && (
            <button
              type="button"
              onClick={() => void markReady()}
              className="btn-primary w-full py-3 text-base font-bold"
            >
              I&apos;m in — ready to play
            </button>
          )}
          {myPlayerId && (
            <PlayerSessionControls
              gameCode={gameCode}
              playerId={myPlayerId}
              currentName={myPlayerName}
              onRenamed={(name) => setMyPlayerName(name)}
              onLeft={leaveGame}
              inLobby={game?.status === 'waiting'}
            />
          )}

          <p className="text-center">
            <GameRulesLink gameType="codewords" variant="subtle" />
          </p>
          <GameLobbyPlayerList players={allPlayers} myPlayerId={myPlayerId} label="In lobby" />

          {playersPickTeams ? (
            <>
              <div className="space-y-2">
                <p className="label-caps">Team</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['red', 'blue'] as const).map((team) => (
                    <button
                      key={team}
                      type="button"
                      onClick={() => setPickingTeam(team)}
                      className={[
                        'rounded-xl border-2 px-3 py-3 font-bold text-sm transition-all',
                        pickingTeam === team
                          ? team === 'red'
                            ? 'border-red-500 bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-100'
                            : 'border-blue-500 bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-100'
                          : 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)] text-muted',
                      ].join(' ')}
                    >
                      {team === 'red' ? '🔴 Red' : '🔵 Blue'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="label-caps">Role</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['spymaster', 'operative'] as const).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setPickingRole(role)}
                      className={[
                        'rounded-xl border-2 px-3 py-3 font-bold text-sm transition-all',
                        pickingRole === role
                          ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)] text-[var(--foreground)]'
                          : 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)] text-muted',
                      ].join(' ')}
                    >
                      {role === 'spymaster' ? '🕵️ Spymaster' : '🎯 Operative'}
                    </button>
                  ))}
                </div>
                <p className="text-faint text-xs leading-relaxed">
                  <strong>Spymaster</strong> sees the secret key and gives one-word clues. <strong>Operative</strong>{' '}
                  guesses words on the grid.
                </p>
              </div>

              <button
                type="button"
                onClick={saveRole}
                disabled={!pickingTeam || !pickingRole || savingRole}
                className="btn-primary w-full"
              >
                {savingRole ? 'Saving…' : 'Confirm team & role'}
              </button>
            </>
          ) : randomizeTeams ? (
            <p className="text-sm text-muted text-center leading-relaxed">
              The host is picking spymasters. Everyone else will be randomly split into red and blue when the game
              starts.
            </p>
          ) : (
            <p className="text-sm text-muted text-center leading-relaxed">
              The host assigns teams for this game. You&apos;ll see your role here once you&apos;re placed on a team.
            </p>
          )}

          <p className="text-center text-faint text-xs">
            {game?.status === 'active' ? 'You can play as soon as your team is set.' : 'Waiting for the host to start…'}
          </p>

          <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] p-4 space-y-2">
            <p className="label-caps text-xs">While you wait — how to play</p>
            <p className="text-faint text-xs leading-relaxed">
              Spymasters give one-word clues; operatives guess words on the grid. First team to find all their words
              wins — but avoid the assassin!
            </p>
          </div>
        </div>
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'lobby' && myPlayerId && myRole) {
    return (
      <GameJoinLobbyShell gameCode={gameCode}>
        <div className="space-y-3">
          <CodewordsWaitingPanel
            playerName={myPlayerName}
            myRole={myRole}
            players={allPlayers}
            myPlayerId={myPlayerId}
            isSpectator={me?.spectator === true}
            onReady={markReady}
          />
          {leaveButton}
        </div>
      </GameJoinLobbyShell>
    )
  }

  if (waitingForAssignment) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="glass-card p-6 w-full max-w-md space-y-4 text-center">
          <p className="text-3xl">⏳</p>
          <h2 className="text-xl font-black">Game in progress</h2>
          <p className="text-muted text-sm leading-relaxed">
            Hi {myPlayerName} — the host needs to place you on a team before you can play. Hang tight!
          </p>
          <p className="text-faint text-xs">You&apos;ll jump in automatically once you&apos;re assigned.</p>
          {leaveButton}
        </div>
      </div>
    )
  }

  if (screen === 'finished') {
    if (!board || !game || !myPlayerId) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4">
          <p className="text-muted">Loading…</p>
        </div>
      )
    }

    const iWon = board.winner && myTeam === board.winner
    const playerNameById = new Map(allPlayers.map((p) => [p.id, p.name]))
    const cellAttribution = guessAttributionMap(guesses, playerNameById)
    const winnerLabel = board.winner
      ? iWon
        ? 'Your team wins!'
        : `${teamLabel(board.winner)} team wins!`
      : 'Session ended'
    const winnerSubtitle = board.winner
      ? iWon
        ? `Great spycraft, ${myPlayerName}.`
        : 'The host can start a new round.'
      : 'The host closed this game. Wait for them to reopen the lobby.'
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-2xl space-y-4">
          <CodewordsFinalResultsShareBlock
            game={game}
            players={allPlayers}
            guesses={guesses}
            roles={allRoles}
            winnerLabel={winnerLabel}
            subtitle={winnerSubtitle}
            highlightPlayerId={myPlayerId}
            winner={board.winner}
          />
          <div className="glass-card p-4 space-y-4">
            <p className="label-caps text-center">Full board</p>
            <CodewordsBoardGrid board={board} showKey cellAttribution={cellAttribution} />
            <CodewordsScoreboard board={board} players={allPlayers} roles={allRoles} highlightPlayerId={myPlayerId} />
            <CodewordsEndGameStats
              guesses={guesses}
              roles={allRoles}
              players={allPlayers}
              highlightPlayerId={myPlayerId}
              winner={board.winner}
            />
          </div>
        </div>
      </div>
    )
  }

  if (isViewer && board && game && myPlayerId && screen === 'active') {
    const playerNameById = new Map(allPlayers.map((p) => [p.id, p.name]))
    const cellAttribution = guessAttributionMap(guesses, playerNameById)
    return (
      <div className="min-h-screen pb-24">
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
          <ViewerModeBanner
            gameCode={gameCode}
            playerId={myPlayerId}
            game={game}
            player={me}
            playerDetail={viewerPromoteContext?.playerDetail}
            onPromoted={load}
          />
          <div className="text-center space-y-1">
            <div className="text-3xl">{cfg.headerEmoji}</div>
            <h1 className="text-xl font-black gradient-title">{game.title}</h1>
            <p className="text-muted text-sm">Watching as {myPlayerName}</p>
          </div>
          <div className="glass-card p-4 space-y-4">
            <div className="glass-card p-4 text-center text-sm font-medium text-muted">
              <CodewordsTeamBadge team={board.current_turn} /> {waitingTurnMessage(board, allRoles, playerNameById)}
            </div>
            <CodewordsCurrentClueCard board={board} showGuessesRemaining />
            <CodewordsBoardGrid board={board} cellAttribution={cellAttribution} />
            <CodewordsScoreboard board={board} players={allPlayers} roles={allRoles} />
          </div>
          {leaveButton && <div className="max-w-md mx-auto">{leaveButton}</div>}
        </div>
      </div>
    )
  }

  if (!board || !myRole || !game || !myPlayerId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg space-y-3">
          <CodewordsWaitingPanel
            playerName={myPlayerName}
            myRole={myRole}
            players={allPlayers}
            myPlayerId={myPlayerId}
            variant="starting"
          />
          {leaveButton}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="text-center space-y-1 mb-5">
          <div className="text-3xl">{cfg.headerEmoji}</div>
          <h1 className="text-xl font-black gradient-title">{game.title}</h1>
        </div>
        <CodewordsActiveRound
          gameCode={gameCode}
          game={game}
          board={board}
          myPlayerId={myPlayerId}
          myResumeToken={myResumeToken}
          myPlayerName={myPlayerName}
          myRole={myRole}
          players={allPlayers}
          roles={allRoles}
          guesses={guesses}
          onBoardChange={setBoard}
          onReload={load}
        />
      </div>
      {leaveButton && (
        <div className="fixed bottom-0 inset-x-0 z-30 p-4 bg-[var(--background)]/90 backdrop-blur-sm border-t border-[var(--border)]">
          <div className="max-w-xs mx-auto">{leaveButton}</div>
        </div>
      )}
    </div>
  )
}
