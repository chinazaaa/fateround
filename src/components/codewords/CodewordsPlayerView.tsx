'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import { CodewordsLeaveButton } from '@/components/codewords/CodewordsLeaveButton'
import { CodewordsEndGameStats } from '@/components/codewords/CodewordsEndGameStats'
import { CodewordsActiveRound } from '@/components/codewords/CodewordsActiveRound'
import { CodewordsScoreboard } from '@/components/codewords/CodewordsScoreboard'
import { CodewordsBoardGrid, CodewordsTeamBadge } from '@/components/codewords/CodewordsBoardGrid'
import { CodewordsWaitingPanel } from '@/components/codewords/CodewordsWaitingPanel'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import { gameTypeConfig } from '@/lib/game-types'
import {
  codewordsPlayerPicks,
  codewordsRandomizeTeams,
  guessAttributionMap,
  mergeCodewordsGuesses,
  roleLabel,
  teamLabel,
} from '@/lib/codewords'
import { useCodewordsRealtime } from '@/hooks/useCodewordsRealtime'
import { useCodewordsNotifications } from '@/hooks/useCodewordsNotifications'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { ShareGameLinkCard } from '@/components/ShareGameLinkCard'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { allowLateJoin, allowLatePlayers, playerIsViewer, preJoinScreen } from '@/lib/viewers'
import { supabase } from '@/lib/supabase'
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
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { useToast } from '@/components/ui/Toast'

type Screen = 'loading' | 'join' | 'game_started_waiting' | 'late_join_choice' | 'lobby' | 'active' | 'finished' | 'not_found'

export function CodewordsPlayerView({ gameCode }: { gameCode: string }) {
  const { success, error: toastError } = useToast()
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myPlayerName, setMyPlayerName] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
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
    setScreen(playerId ? 'finished' : 'join')
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
      supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
      supabase.from('codewords_player_roles').select('*').eq('game_id', gameCode),
    ])
    setAllPlayers(plrs ?? [])
    setAllRoles(roleRows ?? [])
  }, [gameCode])

  const load = useCallback(async () => {
    const { data: gameData } = await supabase.from('games').select('*').eq('id', gameCode).maybeSingle()

    if (!gameData) {
      setScreen('not_found')
      return
    }

    setGame(gameData)

    const session = getPlayerSession(gameCode)
    let playerId = session?.playerId ?? null
    if (session) {
      const { data: plr } = await supabase.from('players').select('id, name').eq('id', session.playerId).maybeSingle()
      if (!plr) {
        clearPlayerSession(gameCode)
        playerId = null
        setMyPlayerId(null)
        setMyPlayerName('')
        setMyRole(null)
      } else {
        setMyPlayerId(session.playerId)
        setMyPlayerName(session.playerName)
        await refreshMyRole(session.playerId)
      }
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

  const joinGame = async (joinAsViewer?: boolean) => {
    const name = joinName.trim()
    if (!name) return
    setJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameCode,
          playerName: name,
          ...(game?.status === 'active' ? { joinAsViewer } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender)
      setMyPlayerId(data.playerId)
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
  }

  const saveRole = async () => {
    if (!myPlayerId || !pickingTeam || !pickingRole) return
    setSavingRole(true)
    try {
      const res = await fetch('/api/codewords/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId, team: pickingTeam, role: pickingRole }),
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

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting' || screen === 'late_join_choice') void load()
  })

  const cfg = gameTypeConfig('codewords')
  const me = allPlayers.find((p) => p.id === myPlayerId)
  const isViewer = !!(game && me && playerIsViewer(me, game))
  const { context: viewerPromoteContext } = useLateJoinContext(
    gameCode,
    game,
    isViewer && screen === 'active'
  )
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
  const needsTeamPick =
    !!myPlayerId && !myRole && playersPickTeams && !randomizeTeams && game?.status === 'waiting'
  const waitingInLobby =
    !!myPlayerId && !myRole && game?.status === 'waiting' && (!playersPickTeams || randomizeTeams)
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
        onJoinAsViewer={() => void joinGame(true)}
        onJoinAsPlayer={() => void joinGame(false)}
      />
    )
  }

  if (screen === 'join') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card p-6 w-full max-w-md space-y-5">
          <div className="text-center space-y-1">
            <div className="text-4xl">{cfg.headerEmoji}</div>
            <h1 className="text-2xl font-black gradient-title">{game?.title}</h1>
            <GameTypeBadge gameType="codewords" />
          </div>
          <div>
            <label className="label-caps block mb-2">Your name</label>
            <input
              type="text"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && joinGame()}
              placeholder="Enter your name"
              className="input-field w-full"
              maxLength={40}
            />
          </div>
          <p className="text-faint text-xs">
            {game?.status === 'active'
              ? lateJoinAllowed
                ? 'This game is in progress — join as a player (auto-assigned to a team) or watch as a viewer.'
                : 'This game has already started.'
              : playersPickTeams
                ? "You'll pick a team and role in the lobby before the host starts."
                : randomizeTeams
                  ? 'The host picks spymasters — your team is shuffled when the game starts.'
                  : 'The host will assign your team and role in the lobby.'}
          </p>
          <button type="button" onClick={() => void joinGame()} disabled={!joinName.trim() || joining} className="btn-primary w-full">
            {joining ? 'Joining…' : 'Join game'}
          </button>
          <ShareGameLinkCard gameCode={gameCode} />
        </div>
      </div>
    )
  }

  const leaveButton =
    myPlayerId ? (
      <CodewordsLeaveButton gameCode={gameCode} playerId={myPlayerId} onLeft={leaveGame} />
    ) : null

  if (needsTeamPick || waitingInLobby) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="glass-card p-6 w-full max-w-md space-y-5">
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
            <p className="text-muted text-sm">Playing as {myPlayerName}</p>
          </div>
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
              The host is picking spymasters. Everyone else will be randomly split into red and blue when the game starts.
            </p>
          ) : (
            <p className="text-sm text-muted text-center leading-relaxed">
              The host assigns teams for this game. You&apos;ll see your role here once you&apos;re placed on a team.
            </p>
          )}

          <p className="text-center text-faint text-xs">
            {game?.status === 'active'
              ? 'You can play as soon as your team is set.'
              : 'Waiting for the host to start…'}
          </p>

          <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] p-4 space-y-2">
            <p className="label-caps text-xs">While you wait — how to play</p>
            <p className="text-faint text-xs leading-relaxed">
              Spymasters give one-word clues; operatives guess words on the grid. First team to find all their words
              wins — but avoid the assassin!
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'lobby' && myPlayerId && myRole) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg space-y-3">
          <CodewordsWaitingPanel
            playerName={myPlayerName}
            myRole={myRole}
            playerCount={allPlayers.length}
          />
          <ShareGameLinkCard gameCode={gameCode} />
          {leaveButton}
        </div>
      </div>
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
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-2xl space-y-4">
          <div className="glass-card p-8 text-center space-y-2">
            {board.winner ? (
              <>
                <p className="text-4xl">🏆</p>
                {iWon ? (
                  <>
                    <p className="text-2xl font-black text-amber-600 dark:text-amber-200">Your team wins!</p>
                    <p className="text-muted text-sm">Great spycraft, {myPlayerName}.</p>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-black">{teamLabel(board.winner)} team wins</p>
                    <p className="text-muted text-sm">The host can start a new round.</p>
                  </>
                )}
              </>
            ) : (
              <>
                <p className="text-4xl">🛑</p>
                <p className="text-xl font-black">Session ended</p>
                <p className="text-muted text-sm">The host closed this game. Wait for them to reopen the lobby.</p>
              </>
            )}
          </div>
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
          <CreateNewGameButton />
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
            playerCount={allPlayers.length}
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
          myPlayerName={myPlayerName}
          myRole={myRole}
          players={allPlayers}
          roles={allRoles}
          guesses={guesses}
          onBoardChange={setBoard}
          onReload={load}
        />
        {leaveButton && <div className="mt-4 max-w-md mx-auto">{leaveButton}</div>}
      </div>
    </div>
  )
}
