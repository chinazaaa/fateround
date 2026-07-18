'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { useRouter } from 'next/navigation'
import { ChessCard, ChessLoadingScreen, ChessSecondaryButton, ChessShell } from '@/components/chess/ChessChrome'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { ChessFinalResultsShareBlock } from '@/components/chess/ChessFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { ChessGamePanel } from '@/components/chess/ChessBoard'
import { gameTypeConfig } from '@/lib/game-types'
import { currentTurnPlayerId, isChessResultsPhase, CHESS_MIN_PLAYERS } from '@/lib/chess'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { supabase } from '@/lib/supabase'
import { CHESS_SESSION_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, ChessSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useChessClockExpiry } from '@/hooks/useChessClocks'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

export function ChessPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const { confirm } = useConfirm()
  const [session, setSession] = useState<ChessSession | null>(null)
  // Mirror of the accepted session, kept in lock-step by the helpers below so every
  // writer compares against the truly-latest value (not a render-stale snapshot).
  const sessionRef = useRef<ChessSession | null>(null)

  // Single funnel for accepting an incoming row (fetch, realtime push, rollback):
  // keep the freshest by updated_at and update the ref *synchronously*, so an older
  // async result can never briefly clobber newer state. Returns the row accepted.
  const acceptSession = useCallback((next: ChessSession): ChessSession => {
    const cur = sessionRef.current
    const accepted = cur && Date.parse(next.updated_at) < Date.parse(cur.updated_at) ? cur : next
    sessionRef.current = accepted
    setSession(accepted)
    return accepted
  }, [])

  // Force a local row onto the board (the optimistic move preview), keeping the ref in
  // lock-step. Unguarded on purpose — the preview intentionally overrides the board.
  const commitSession = useCallback((next: ChessSession) => {
    sessionRef.current = next
    setSession(next)
  }, [])

  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  const [acting, setActing] = useState(false)

  // Game-specific load: fetch the chess session (the shared game/players fetch +
  // session resolution lives in useGameViewBootstrap).
  const loadGameState = useCallback(async (): Promise<{ state: ChessSession | null; ok: boolean }> => {
    const sessionRes = await supabase
      .from('chess_sessions')
      .select(CHESS_SESSION_SELECT)
      .eq('game_id', gameCode)
      .maybeSingle()
    const sessionData = supabasePollOk(sessionRes) ? (sessionRes.data as ChessSession | null) : null
    // Accept through the shared funnel: a fetch that started before the latest realtime
    // push can resolve after it, so don't roll the board back to the older row it
    // carries — and return the row we actually accept so the screen the bootstrap
    // computes matches what's shown.
    return { state: sessionData ? acceptSession(sessionData) : sessionData, ok: supabasePollOk(sessionRes) }
  }, [gameCode, acceptSession])

  const computeScreen = useCallback(
    (gameData: Game, playerId: string | null, sessionData: ChessSession | null): Screen => {
      // A finished game always shows its result — checked first, before anything
      // that depends on the player session. Otherwise, when `resolvePlayerSession`
      // hadn't resolved yet (or a spectator has no player row), a finished game
      // fell through to preJoinScreen → 'game_ended' ("this link is no longer
      // active"), which intermittently hid the result behind a dead-link screen.
      // The results screen renders fine with a null viewer id, so gate this on the
      // game state, not on having a player row.
      if (isChessResultsPhase(gameData.status, sessionData)) return 'finished'
      if (!playerId) {
        const pre = preJoinScreen(gameData, false)
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'game_ended') return 'game_ended'
        return 'join'
      }
      if (gameData.status === 'waiting') return 'waiting'
      if (gameData.status === 'active' && sessionData?.status !== 'finished') return 'active'
      if (isChessResultsPhase(gameData.status, sessionData)) return 'finished'
      return 'waiting'
    },
    []
  )

  const {
    screen,
    game,
    players,
    myPlayerId,
    setMyPlayerId,
    myResumeToken,
    joinName,
    setJoinName,
    joining,
    load,
    join,
  } = useGameViewBootstrap<Screen, ChessSession | null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    joinExtras,
    onJoinError: toastError,
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  useApplyGameTheme(screen === 'game_ended' ? 'default' : game?.theme)

  // Put a pushed session row on screen immediately — the debounced reload that follows
  // reconciles everything else. Skip rows older than what we're already showing (a late
  // event must not roll the board back); an optimistic local move keeps the previous
  // updated_at, so the authoritative row for that same move still lands.
  const applySessionRow = useCallback(
    (row: Record<string, unknown>): boolean => {
      const prev = sessionRef.current
      const accepted = acceptSession(row as unknown as ChessSession)
      // Skip the reconciliation reload for an ordinary in-progress move (the board is fully
      // patched above and the tighter duel poll reconciles); the first row and any status
      // transition (→ finished) still reload so the result screen resolves.
      return prev != null && prev.status === 'active' && accepted.status === 'active'
    },
    [acceptSession]
  )

  // Realtime push: reload on any change to this game's row + its tables.
  const connected = useGameTableSync(
    gameCode,
    ['players', { table: 'games', column: 'id' }, { table: 'chess_sessions', apply: applySessionRow }],
    load
  )

  // Fallback poll: tighter while the match is live, so a dropped realtime channel
  // costs seconds of move lag instead of most of a minute. Only runs while the
  // channel is down — no redundant reloads alongside healthy realtime.
  usePolling(() => load(), [gameCode, load], {
    intervalMs:
      screen === 'active' && session?.status === 'active'
        ? POLL_INTERVALS.duelFallback
        : POLL_INTERVALS.realtimeFallback,
    enabled: !connected,
    runImmediately: false,
  })

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting') void load()
  })

  useRoomMemberAutoJoin({
    gameCode,
    displayName: roomDisplayName,
    resolving: resolvingRoomMember,
    screen,
    gameStatus: game?.status,
    hasPlayerSession: !!myPlayerId,
    joining,
    onJoin: (name) => join({ name }),
  })

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    void load()
  }

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

  const movePiece = async (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => {
    if (!myPlayerId || !session) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    const prevSession = session

    // Optimistic: apply the move locally so the board responds instantly instead of
    // sitting on the old position for the server round-trip + reload (~1-2s of "lag").
    // The server stays authoritative — load() reconciles clocks/PGN below, and we
    // revert if it rejects the move.
    try {
      const preview = new Chess()
      preview.load(session.fen)
      if (preview.move({ from, to, promotion })) {
        commitSession({
          ...session,
          fen: preview.fen(),
          current_turn: session.current_turn === 'w' ? 'b' : 'w',
          last_move_from: from,
          last_move_to: to,
          in_check: preview.inCheck(),
        })
      }
    } catch {
      // Illegal locally (the board only offers legal targets, so this shouldn't happen) —
      // skip the preview and let the server be the judge.
    }

    setActing(true)
    try {
      const res = await fetch('/api/chess/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, from, to, promotion }),
      })
      const data = await res.json()
      if (!res.ok) {
        // Roll back the optimistic move — acceptSession keeps a newer row if a realtime
        // push beat the rejection, so the guard is unified with every other write.
        acceptSession(prevSession)
        toastError(data.error ?? 'Move failed')
      } else {
        await load()
      }
    } catch {
      acceptSession(prevSession)
      toastError('Move failed')
    } finally {
      setActing(false)
    }
  }

  const resign = async () => {
    if (!myPlayerId) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    const ok = await confirm({
      title: 'Resign this game?',
      message: 'Your opponent will be awarded the win.',
      confirmLabel: 'Resign',
      destructive: true,
    })
    if (!ok) return
    setActing(true)
    try {
      const res = await fetch('/api/chess/resign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Failed to resign')
      } else {
        await load()
      }
    } finally {
      setActing(false)
    }
  }

  const cfg = gameTypeConfig('chess')
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const turnPlayerId = session ? currentTurnPlayerId(session) : null
  const isMyTurn = myPlayerId != null && turnPlayerId === myPlayerId
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  const myName = activePlayer?.name ?? ''

  useChessClockExpiry(gameCode, session, game?.status === 'active' && !isViewer)

  // Change name · Leave game for players/spectators live behind the main chrome's ⚙
  // gear (top header). Registered while the game is active; GameChromeSettings renders it.
  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId || game?.status !== 'active') return null
    return (
      <div className="space-y-3">
        <EditNameInline
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={myName}
          onRenamed={() => void load()}
          spectating={isViewer}
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
  }, [myPlayerId, game?.status, gameCode, myName, isViewer, load, router])
  useRegisterGameSettings(playerSettingsNode)

  if (screen === 'loading') return <ChessLoadingScreen />

  if (screen === 'not_found') {
    return (
      <ChessShell title="Game not found">
        <ChessCard className="p-6 text-center space-y-3">
          <p className="text-muted">This game code doesn&apos;t exist.</p>
          <ChessSecondaryButton onClick={() => router.push('/')}>Go home</ChessSecondaryButton>
        </ChessCard>
      </ChessShell>
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
        header={
          <GameJoinHeader
            emoji={cfg.headerEmoji}
            title={game?.title ?? cfg.label}
            gameType="chess"
            subtitle={joiningAsViewer ? 'Game in progress — join as a viewer (read-only).' : cfg.tagline}
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          joining={joining}
          gameType="chess"
          submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="chess" variant="subtle" />
            </p>
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => void load()} />
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'waiting') {
    const me = players.find((p) => p.id === myPlayerId)
    // "Play again · same settings" reopened the lobby with the ready-up ring.
    if (game?.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode}>
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={CHESS_MIN_PLAYERS}
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
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={myName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Waiting for host to start"
          rulesLink={<GameRulesLink gameType="chess" variant="subtle" />}
          isSpectator={me?.spectator === true}
          onReady={async () => {
            if (!myResumeToken) return
            await fetch('/api/players/ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
            })
            await load()
          }}
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'finished') {
    const finishedName = players.find((p) => p.id === myPlayerId)?.name
    const iWon = myPlayerId != null && session?.winner_player_id === myPlayerId
    const shareWinnerName = iWon ? finishedName : winner?.name

    return (
      <ChessShell compact>
        {game ? (
          <ChessFinalResultsShareBlock
            game={game}
            players={players}
            session={session}
            winnerName={shareWinnerName}
            highlightPlayerId={myPlayerId}
          />
        ) : (
          <ChessCard className="p-6 text-center space-y-3">
            <p className="text-4xl">{session?.is_draw ? '🤝' : winner ? '🏆' : '🏁'}</p>
            <p className="text-2xl font-black">
              {session?.is_draw
                ? "It's a draw!"
                : winner
                  ? iWon
                    ? 'You win!'
                    : `${winner.name} wins!`
                  : 'Game ended early'}
            </p>
          </ChessCard>
        )}
        {iWon && game && (
          <PostWinToCommunity
            gameType="chess"
            gameCode={gameCode}
            winnerName={finishedName ?? ''}
            roundKey={session?.id}
          />
        )}
      </ChessShell>
    )
  }

  return (
    <ChessShell title={game?.title ?? cfg.label} compact>
      {isViewer && <ViewerModeBanner />}
      {session && (
        <ChessGamePanel
          session={session}
          players={players}
          myPlayerId={myPlayerId}
          isMyTurn={isMyTurn && !isViewer}
          timeControlSeconds={game?.timer_seconds ?? 0}
          appearanceDefaults={{ boardTheme: game?.chess_board_theme, pieceSet: game?.chess_piece_set }}
          onMove={!isViewer ? movePiece : undefined}
          onResign={!isViewer ? resign : undefined}
          acting={acting}
        />
      )}
    </ChessShell>
  )
}
