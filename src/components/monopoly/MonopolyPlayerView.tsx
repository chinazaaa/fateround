'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MonopolyActiveLayout } from '@/components/monopoly/MonopolyActiveLayout'
import { MonopolyJoinForm } from '@/components/monopoly/MonopolyJoinForm'
import { tokenColorForOrder } from '@/components/monopoly/monopoly-ui'
import { monopolyTokenEmoji, type MonopolyTokenId } from '@/lib/monopoly-tokens'
import { MONOPOLY_COLOR_CLASSES } from '@/lib/monopoly'
import type { MonopolyColorGroup } from '@/lib/monopoly'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { LeaderboardJoinNote } from '@/components/game-lobby/LeaderboardJoinNote'
import { MonopolyPageHeader } from '@/components/monopoly/MonopolyChrome'
import { gameTypeConfig } from '@/lib/game-types'
import { MonopolyFinalResultsShareBlock } from '@/components/monopoly/MonopolyFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { buildMonopolyStandings, MONOPOLY_MIN_PLAYERS, MONOPOLY_STARTING_CASH } from '@/lib/monopoly'
import { formatThemedMoney } from '@/components/monopoly/monopoly-themes'
import { supabase } from '@/lib/supabase'
import { MONOPOLY_BOARD_SELECT, MONOPOLY_PLAYER_STATE_SELECT, isCompleteMonopolyBoardRow } from '@/lib/supabase-selects'
import { clearPlayerSession, isFetchNetworkError, messageFromFetchActionError } from '@/lib/utils'
import type { Game, MonopolyBoard, MonopolyPlayerState } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { markPlayerReady } from '@/lib/player-ready'
import { useMonopolyNotifications } from '@/hooks/useMonopolyNotifications'
import { preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

function colorBarClass(color?: MonopolyColorGroup): string {
  if (!color) return 'bg-neutral-500'
  return MONOPOLY_COLOR_CLASSES[color] ?? 'bg-neutral-500'
}

export function MonopolyPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [board, setBoard] = useState<MonopolyBoard | null>(null)
  const boardRef = useRef<MonopolyBoard | null>(null)
  boardRef.current = board
  const [states, setStates] = useState<MonopolyPlayerState[]>([])
  const [joinToken, setJoinToken] = useState<MonopolyTokenId | null>(null)
  const {
    displayName: roomDisplayName,
    joinExtras: roomExtras,
    resolving: resolvingRoomMember,
  } = useRoomMemberJoin(gameCode)
  const [acting, setActing] = useState(false)
  const actingRef = useRef(false)

  // Game-specific load: fetch the monopoly board + per-player state (both playerId-
  // independent). The shared game/players fetch + session resolution lives in
  // useGameViewBootstrap.
  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    const [boardRes, stateRes] = await Promise.all([
      supabase.from('monopoly_boards').select(MONOPOLY_BOARD_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase
        .from('monopoly_player_state')
        .select(MONOPOLY_PLAYER_STATE_SELECT)
        .eq('game_id', gameCode)
        .order('player_order'),
    ])
    const ok = supabasePollOk(boardRes, stateRes)
    if (ok) {
      setBoard(boardRes.data as MonopolyBoard | null)
      setStates((stateRes.data as MonopolyPlayerState[]) ?? [])
    }
    return { state: null, ok }
  }, [gameCode])

  // Pure status → screen mapping (the board is playerId-independent, so no afterResolve).
  const computeScreen = useCallback((gameData: Game, playerId: string | null): Screen => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'game_ended') return 'game_ended'
      return 'join'
    }
    if (gameData.status === 'waiting') return 'waiting'
    if (gameData.status === 'active') return 'active'
    return 'finished'
  }, [])

  // Reproduce the original conditional join body without changing the hook. The original
  // sent `{ monopolyToken }` for a player join and `{ joinAsViewer }` for a viewer (active
  // game) join. A viewer join carries no board token (the picker is hidden and the submit
  // guard below only requires a token when NOT joining as a viewer), so the presence of
  // `joinToken` cleanly distinguishes the two: token → player join body; no token → viewer
  // join, where the hook appends `joinAsViewer` off its own resolved game status.
  const joinExtras: Record<string, unknown> = joinToken ? { ...roomExtras, monopolyToken: joinToken } : roomExtras

  const {
    screen,
    setScreen,
    game,
    players,
    myPlayerId,
    setMyPlayerId,
    myResumeToken,
    setMyResumeToken,
    joinName,
    setJoinName,
    joining,
    load,
    lobbyFull,
    join,
  } = useGameViewBootstrap<Screen, null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    joinExtras,
    onJoinError: toastError,
  })

  useApplyGameTheme(screen === 'game_ended' ? 'default' : game?.theme)
  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)

  // Realtime push: reload on any change to this game's row + its tables.
  // Delta fast-path (dual-table). Screen derives from game.status, so board/state writes only
  // update the UI — patch locally and skip the reload; active→finished rides the games-row
  // event, and the fallback poll reconciles.
  const applyBoardRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as MonopolyBoard
    const prev = boardRef.current
    if (prev && next.updated_at < prev.updated_at) return true
    // Realtime UPDATE payloads drop unchanged TOAST-ed columns (large jsonb such as
    // property_owners) — they arrive as null once a game has enough owned properties. Applying
    // such a partial row would wipe ownership/buildings on screen (players show 0 property, can't
    // see who owns what). Discard it and let the debounced full reload refetch the complete row.
    if (!isCompleteMonopolyBoardRow(row)) return false
    setBoard(next)
    boardRef.current = next
    return prev != null
  }, [])
  const applyStateRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as MonopolyPlayerState
    setStates((prev) => {
      const i = prev.findIndex((s) => s.id === next.id)
      if (i === -1) return [...prev, next]
      const copy = [...prev]
      copy[i] = next
      return copy
    })
    return true
  }, [])

  const connected = useGameTableSync(
    gameCode,
    [
      { table: 'games', column: 'id' },
      'players',
      { table: 'monopoly_boards', apply: applyBoardRow },
      { table: 'monopoly_player_state', apply: applyStateRow },
    ],
    load
  )

  usePolling(() => load(), [gameCode, load], {
    intervalMs: POLL_INTERVALS.realtimeFallback,
    enabled: !connected,
    runImmediately: false,
  })

  // Ready-up ring: readiness = holding a seat, so this reuses /players/ready (which
  // toggles the spectator flag). `ready:false` sits the player back out.
  const [replayReadyPending, setReplayReadyPending] = useState(false)
  const toggleReplayReady = useCallback(
    async (ready: boolean) => {
      if (!myResumeToken) {
        toastError('Your player session expired — rejoin to continue')
        return
      }
      setReplayReadyPending(true)
      try {
        const res = await fetch('/api/players/ready', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, ready }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to update ready')
        await load()
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Failed to update ready')
      } finally {
        setReplayReadyPending(false)
      }
    },
    [gameCode, myResumeToken, load, toastError]
  )

  const openLobbyJoin = useCallback(() => {
    setScreen('join')
    void load()
  }, [setScreen, load])

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting') void load()
  })

  const postAction = async (url: string, body: Record<string, unknown> = {}) => {
    if (!myPlayerId || actingRef.current) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    actingRef.current = true
    setActing(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, ...body }),
      })
      let data: { error?: string }
      try {
        data = await res.json()
      } catch {
        throw new Error(res.ok ? 'Invalid server response' : `Request failed (${res.status})`)
      }
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      await load()
    } catch (err) {
      toastError(messageFromFetchActionError(err))
      if (isFetchNetworkError(err)) await load()
    } finally {
      actingRef.current = false
      setActing(false)
    }
  }

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyResumeToken(null)
    setJoinName('')
    setJoinToken(null) // reset the token picker so a re-join starts clean (no stale token reuse)
    setScreen('join')
  }

  const cfg = gameTypeConfig('monopoly')
  const myState = states.find((s) => s.player_id === myPlayerId)
  const me = myPlayerId ? players.find((p) => p.id === myPlayerId) : null
  const myPlayerName = me?.name ?? null
  const meSpectating = !!(game && me && playerIsViewer(me, game))

  // Change name · Leave game for players/spectators live behind the main chrome's ⚙
  // gear (top header). Registered while the game is active; the shared settings sheet
  // renders it. Purely additive — the in-page PlayerSessionControls stays as-is.
  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId || game?.status !== 'active') return null
    return (
      <div className="space-y-3">
        <EditNameInline
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={me?.name ?? ''}
          onRenamed={() => void load()}
          spectating={meSpectating}
        />
        <LeaveGameButton
          gameCode={gameCode}
          playerId={myPlayerId}
          onLeft={() => {
            clearPlayerSession(gameCode)
            router.push('/')
          }}
          confirmMessage="You can rejoin with your player code if the host opens the lobby again."
        />
      </div>
    )
  }, [myPlayerId, game?.status, gameCode, me?.name, meSpectating, load, router])
  useRegisterGameSettings(playerSettingsNode)

  useMonopolyNotifications({
    game,
    board,
    myPlayerId,
    myState,
    players,
    enabled: screen === 'active',
  })

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={openLobbyJoin} />
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'not_found') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-xl font-bold">Game not found</p>
        <button type="button" onClick={() => router.push('/')} className="btn-secondary">
          Go home
        </button>
      </div>
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

    const joiningAsViewer = game?.status === 'active'
    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        wide
        header={<GameJoinHeader emoji={cfg.headerEmoji} title={game?.title} gameType="monopoly" />}
      >
        <MonopolyJoinForm
          name={joinName}
          onNameChange={setJoinName}
          tokenId={joinToken}
          onTokenChange={setJoinToken}
          players={players}
          joining={joining}
          joiningAsViewer={joiningAsViewer}
          submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join Monopoly'}
          onSubmit={() => {
            // Non-viewer joins require a board token before we hit the hook's join.
            if (!joiningAsViewer && !joinToken) return
            void join()
          }}
        />
        {lobbyFull && !joiningAsViewer && (
          <div className="space-y-2 text-center">
            <p className="text-faint text-xs leading-relaxed">This game is full — you can watch.</p>
            <button
              type="button"
              onClick={() => void join({ joinAsViewer: true })}
              disabled={joining}
              className="btn-secondary w-full"
            >
              Watch instead
            </button>
          </div>
        )}
        <LeaderboardJoinNote gameType="monopoly" />
        <p className="text-faint text-xs leading-relaxed text-center">
          {joiningAsViewer
            ? 'This game is in progress — you will join as a viewer and watch live (read-only).'
            : `${MONOPOLY_MIN_PLAYERS}–6 players · ${formatThemedMoney(MONOPOLY_STARTING_CASH, game?.theme)} starting cash.`}
        </p>
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'waiting') {
    const displayName = myPlayerName ?? players.find((p) => p.id === myPlayerId)?.name ?? 'Player'
    const isSpectator = me?.spectator === true
    // "Play again · same settings" reopened the lobby with the ready-up ring.
    if (game?.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode}>
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={MONOPOLY_MIN_PLAYERS}
            capacityGame={game}
            onToggleReady={(ready) => void toggleReplayReady(ready)}
            onStart={() => {}}
            pending={replayReadyPending}
            gameCode={gameCode}
            onLeft={handlePlayerLeft}
          />
        </GameJoinLobbyShell>
      )
    }
    return (
      <GameJoinLobbyShell gameCode={gameCode}>
        <div className="space-y-4">
          <div className="rounded-xl border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] px-4 py-4 text-center space-y-1">
            {isSpectator ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">New round</p>
                <h2 className="text-xl sm:text-2xl font-black">Ready for another game?</h2>
                <p className="text-muted text-sm">Tap below to join the next round</p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!myResumeToken) return
                      await markPlayerReady(gameCode, myResumeToken)
                      await load()
                    }}
                    className="btn-primary w-full py-3 text-base font-bold"
                  >
                    I&apos;m in — ready to play
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">
                  You&apos;re in
                </p>
                <h2 className="text-xl sm:text-2xl font-black">You&apos;re in, {displayName}!</h2>
                <p className="text-muted text-sm leading-relaxed">
                  Waiting for the host to start. You&apos;ll begin with{' '}
                  {formatThemedMoney(MONOPOLY_STARTING_CASH, game?.theme)} when the game begins.
                </p>
              </>
            )}
            <p className="flex items-center justify-center gap-1.5 pt-1 text-sm font-bold text-[var(--foreground)]">
              <span className="leading-none">{cfg.headerEmoji}</span>
              <span>{cfg.label}</span>
            </p>
          </div>
          <GameRulesLink gameType="monopoly" variant="subtle" />
          <div className="glass-card-strong p-4 text-center">
            <p className="text-3xl font-black text-[var(--primary)]">{players.length}</p>
            <p className="text-sm text-muted">player{players.length === 1 ? '' : 's'} joined</p>
          </div>
          {players.length > 0 && (
            <div className="space-y-2">
              {players.map((p, index) => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[var(--surface-inset-bg)]">
                  <span
                    className={[
                      'flex h-8 w-8 items-center justify-center rounded-full text-lg ring-2',
                      tokenColorForOrder(index).bg,
                      tokenColorForOrder(index).ring,
                    ].join(' ')}
                  >
                    {monopolyTokenEmoji(p.monopoly_token, index)}
                  </span>
                  <span className="font-semibold text-sm">{p.name}</span>
                  {p.id === myPlayerId && (
                    <span className="ml-auto text-[10px] font-bold uppercase text-[var(--primary)]">You</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'finished') {
    const winner = players.find((p) => p.id === board?.winner_player_id)
    const finishedWinnerName =
      winner?.name ??
      (board && states.length
        ? buildMonopolyStandings(
            states,
            players,
            board.property_owners,
            board.property_buildings,
            board.mortgaged_properties
          )[0]?.name
        : null)

    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {game ? (
            <MonopolyFinalResultsShareBlock
              game={game}
              players={players}
              states={states}
              board={board}
              winnerName={finishedWinnerName}
              highlightPlayerId={myPlayerId}
              themeId={game?.theme}
            />
          ) : (
            <div className="glass-card p-8 text-center space-y-3">
              <p className="text-4xl">🏆</p>
              <h2 className="text-xl font-black gradient-title">
                {finishedWinnerName ? `${finishedWinnerName} wins!` : 'Game over'}
              </h2>
            </div>
          )}
          {myPlayerId && board?.winner_player_id === myPlayerId && (
            <div className="mt-4">
              <PostWinToCommunity
                gameType="monopoly"
                gameCode={gameCode}
                winnerName={players.find((p) => p.id === myPlayerId)?.name ?? ''}
                roundKey={board?.id}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  const sessionName = myPlayerName ?? players.find((p) => p.id === myPlayerId)?.name ?? ''
  const myPlayer = players.find((p) => p.id === myPlayerId)
  const isViewer = !!(game && myPlayer && playerIsViewer(myPlayer, game))

  if (!board) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading board…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24 overflow-x-hidden px-2 sm:px-4 py-3 sm:py-6">
      <div className="max-w-6xl mx-auto space-y-3 sm:space-y-4">
        <MonopolyPageHeader title={game?.title}></MonopolyPageHeader>

        {isViewer && myPlayer && (
          <ViewerModeBanner gameCode={gameCode} playerId={myPlayerId} game={game} player={myPlayer} />
        )}

        <MonopolyActiveLayout
          gameCode={gameCode}
          game={game}
          board={board}
          states={states}
          players={players}
          myPlayerId={myPlayerId}
          myState={isViewer ? undefined : myState}
          myName={sessionName}
          acting={acting}
          postAction={postAction}
          colorBarClass={colorBarClass}
          spectator={isViewer}
          themeId={game?.theme}
        />
      </div>
    </div>
  )
}
