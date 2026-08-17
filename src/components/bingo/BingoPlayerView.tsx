'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { BingoCardGrid, BingoCardLegend, CalledNumbersBoard } from '@/components/bingo/BingoCardGrid'
import { BingoFinalResultsShareBlock } from '@/components/bingo/BingoFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { gameTypeConfig } from '@/lib/game-types'
import { formatBingoNumber, hasBingoWin, BINGO_MIN_PLAYERS } from '@/lib/bingo'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { supabase } from '@/lib/supabase'
import { BINGO_CALLED_NUMBER_SELECT, BINGO_CLAIM_SELECT } from '@/lib/supabase-selects'
import { fetchBingoCard } from '@/lib/hands-client'
import { clearPlayerSession, getPlayerSession } from '@/lib/utils'
import type { BingoCalledNumber, BingoCard, BingoClaim, Game } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useBingoWinNotification, useBingoStartNotification } from '@/hooks/useBingoNotifications'
import { useBingoAutoCall } from '@/hooks/useBingoAutoCall'
import { isAdvanceDriver } from '@/lib/advance-driver'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { playerIsViewer, preJoinScreen, allowLatePlayers } from '@/lib/viewers'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'late_join_choice'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

export function BingoPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  const [card, setCard] = useState<BingoCard | null>(null)
  const [calledNumbers, setCalledNumbers] = useState<BingoCalledNumber[]>([])
  const [winner, setWinner] = useState<BingoClaim | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [marking, setMarking] = useState(false)
  // "The server refused to give me a card" — kept apart from "no card dealt yet" so the empty
  // state never lies about game state. One toast per mount; the poll would otherwise repeat it.
  const [cardBlocked, setCardBlocked] = useState(false)
  const sessionWarnedRef = useRef(false)

  // The card comes through /api/bingo/card so `cells`/`marked_indices` never reach this device
  // via the anon key — the route resolves this player from their secret resume token and returns
  // only their own card. `playerId` is unused now (the token identifies the caller); it stays in
  // the signature to match the bootstrap's afterResolve/poll callsites. Read the token from the
  // session store, not the bootstrap value, since loadCard is defined before useGameViewBootstrap.
  //
  // The boolean is the POLL health signal (usePolling backs off exponentially on false), so it
  // must mean "the fetch worked", NOT "there is a card". "No card dealt yet" is the normal state
  // this poll exists to wait out — reporting it as failure pushed the retry to 16s→32s→60s and
  // stranded late joiners on "Dealing your card…". Only a transport/server failure backs off.
  // An expired/absent session can never succeed, so it stops the poll and says so once.
  const loadCard = useCallback(
    async (_playerId: string): Promise<boolean> => {
      const result = await fetchBingoCard(gameCode, { resumeToken: getPlayerSession(gameCode)?.resumeToken })
      if (result.ok) {
        setCardBlocked(false)
        if (result.card) setCard(result.card)
        return true
      }
      if (result.unauthorized) {
        setCardBlocked(true)
        if (!sessionWarnedRef.current) {
          sessionWarnedRef.current = true
          toastError('Your player session expired — rejoin to continue')
        }
      }
      return false
    },
    [gameCode, toastError]
  )

  // Game-specific load: fetch this game's called numbers + the approved winning claim
  // (both playerId-independent). The shared game/players fetch + session resolution
  // lives in useGameViewBootstrap.
  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    const [calledRes, claimRes] = await Promise.all([
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
    const ok = supabasePollOk(calledRes, claimRes)
    if (ok) {
      setCalledNumbers(calledRes.data ?? [])
      setWinner(claimRes.data ?? null)
    }
    return { state: null, ok }
  }, [gameCode])

  // Post-resolve seam: this player's bingo card is only fetchable once the session
  // resolves to a playerId, and only when a card has been dealt (not while `waiting`).
  // Side effect only — it sets card state and doesn't drive the screen, so returns void.
  const afterResolve = useCallback(
    async (gameData: Game, playerId: string | null): Promise<void> => {
      if (playerId && gameData.status !== 'waiting') {
        await loadCard(playerId)
      } else {
        setCard(null)
      }
    },
    [loadCard]
  )

  const computeScreen = useCallback((gameData: Game, playerId: string | null): Screen => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'late_join_choice') return 'late_join_choice'
      if (pre === 'game_ended') return 'game_ended'
      return 'join'
    }
    if (gameData.status === 'waiting') return 'waiting'
    if (gameData.status === 'active') return 'active'
    return 'finished'
  }, [])

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
    afterResolve,
    joinExtras,
    onJoinError: toastError,
    onJoinSuccess: (data) => success(`Joined as ${data.playerName}`),
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)

  usePolling(() => (myPlayerId ? loadCard(myPlayerId) : Promise.resolve(true)), [myPlayerId, loadCard], {
    intervalMs: POLL_INTERVALS.lobby,
    enabled: screen === 'active' && !!myPlayerId && !card,
  })

  useEffect(() => {
    const channel = supabase
      .channel(`bingo-player-${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        () => {
          void load()
        }
      )
      .on(
        // Keep the roster live so the replay ready-up ring reflects taps as they happen.
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        () => {
          void load()
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
        { event: 'INSERT', schema: 'public', table: 'bingo_cards', filter: `game_id=eq.${gameCode}` },
        () => {
          void load()
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bingo_claims', filter: `game_id=eq.${gameCode}` },
        () => {
          void load()
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bingo_cards', filter: `game_id=eq.${gameCode}` },
        () => {
          void load()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  const openLobbyJoin = useCallback(() => {
    setScreen('join')
    void load()
  }, [setScreen, load])

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting' || screen === 'late_join_choice') void load()
  })

  const me = players.find((p) => p.id === myPlayerId)
  const myPlayerName = me?.name ?? ''
  const isViewer = !!(game && me && playerIsViewer(me, game))

  // Change name · Leave game for players/spectators live behind the main chrome's ⚙
  // gear (top header). Registered while the game is active; the shared settings sheet
  // renders it. Purely additive — the in-page PlayerSessionControls stays as-is.
  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId) return null
    return (
      <div className="space-y-3">
        <EditNameInline
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={me?.name ?? ''}
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
  }, [myPlayerId, game?.status, gameCode, me?.name, isViewer, load, router])
  useRegisterGameSettings(playerSettingsNode)

  const { context: lateJoinContext, loading: lateJoinContextLoading } = useLateJoinContext(
    gameCode,
    game,
    screen === 'late_join_choice',
    calledNumbers.length
  )
  const { context: viewerPromoteContext } = useLateJoinContext(
    gameCode,
    game,
    isViewer && screen === 'active',
    calledNumbers.length
  )

  // W5: only an elected quorum of clients drives auto-call (see isAdvanceDriver).
  useBingoAutoCall({
    gameCode,
    game,
    enabled: screen === 'active' && isAdvanceDriver(players, myPlayerId),
    onSynced: load,
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

  const markCell = async (index: number) => {
    if (!myPlayerId || marking) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setMarking(true)
    try {
      const res = await fetch('/api/bingo/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, cellIndex: index }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to mark')
      if (card) {
        setCard({ ...card, marked_indices: data.marked_indices })
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to mark')
    } finally {
      setMarking(false)
    }
  }

  const claimBingo = async () => {
    if (!myPlayerId || claiming) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setClaiming(true)
    try {
      const res = await fetch('/api/bingo/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Not a valid bingo')
      if (data.claim) setWinner(data.claim)
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Invalid bingo')
    } finally {
      setClaiming(false)
    }
  }

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyResumeToken(null)
    setJoinName('')
    setScreen('join')
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

  const cfg = gameTypeConfig('bingo')
  const called = calledNumbers.map((row) => row.number)
  const lastCalled = called.length > 0 ? called[called.length - 1] : null
  const canClaim =
    !isViewer && card != null && hasBingoWin(card.cells, card.marked_indices, 'line') && game?.status === 'active'
  const winnerPlayer = winner ? players.find((p) => p.id === winner.player_id) : null
  const iWon = winner != null && myPlayerId != null && winner.player_id === myPlayerId

  useBingoStartNotification({
    game,
    enabled: screen === 'waiting' || screen === 'active',
  })

  useBingoWinNotification({
    winner,
    winnerName: winnerPlayer?.name ?? null,
    myPlayerId,
    enabled: screen === 'active' || screen === 'finished',
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
        <button type="button" onClick={() => router.push('/')} className="btn-secondary">
          Go home
        </button>
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
        onJoinAsViewer={() => void join({ joinAsViewer: true })}
        onJoinAsPlayer={() => void join({ joinAsViewer: false })}
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
        header={
          <GameJoinHeader
            emoji={cfg.headerEmoji}
            title={game?.title}
            gameType="bingo"
            meta={game ? <GameInfoChips game={game} /> : null}
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          lobbyFull={lobbyFull}
          onJoinAsViewer={() => void join({ joinAsViewer: true })}
          joining={joining}
          gameType="bingo"
          submitLabel="Join Bingo"
          hint={
            <>
              You&apos;ll get a random card when the host starts. Called numbers turn{' '}
              <strong className="text-blue-400">blue</strong> on your card — tap them to mark{' '}
              <strong className="text-emerald-400">green</strong>.
            </>
          }
          footer={
            <>
              <BingoCardLegend />
              <p className="text-center pt-1">
                <GameRulesLink gameType="bingo" variant="subtle" />
              </p>
            </>
          }
        />
      </GameJoinLobbyShell>
    )
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
            minPlayers={BINGO_MIN_PLAYERS}
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
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          capacityGame={game}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={myPlayerName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title={`You're in, ${myPlayerName}!`}
          description={
            <>
              Waiting for the host to start. You&apos;ll get a random bingo card automatically — you don&apos;t pick the
              numbers on your card.
            </>
          }
          rulesLink={<GameRulesLink gameType="bingo" variant="subtle" />}
          activity={<BingoCardLegend />}
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
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-4">
          {winnerPlayer && game ? (
            <BingoFinalResultsShareBlock
              game={game}
              players={players}
              winnerName={iWon ? myPlayerName : winnerPlayer.name}
            />
          ) : (
            <>
              <div className="glass-card p-6 text-center space-y-3">
                <p className="text-4xl">🏁</p>
                <h2 className="text-xl font-black">Round over</h2>
                <p className="text-muted text-sm">Thanks for playing! The host can start a new round.</p>
              </div>
              <CreateNewGameButton />
            </>
          )}
          {iWon && game && (
            <PostWinToCommunity gameType="bingo" gameCode={gameCode} winnerName={myPlayerName} roundKey={winner?.id} />
          )}
          {card && (
            <div className="glass-card p-4">
              <BingoCardGrid
                cells={card.cells}
                markedIndices={card.marked_indices}
                calledNumbers={called}
                disabled
                showLegend={false}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {isViewer && (
          <ViewerModeBanner
            gameCode={gameCode}
            playerId={myPlayerId}
            game={game}
            player={me}
            playerDetail={viewerPromoteContext?.playerDetail}
            onPromoted={load}
          />
        )}
        <div className="text-center space-y-1">
          <div className="text-3xl">{cfg.headerEmoji}</div>
          <h1 className="text-xl font-black gradient-title">{game?.title}</h1>
        </div>

        {lastCalled != null && (
          <div className="glass-card p-4 text-center">
            <p className="text-faint text-xs uppercase tracking-wider">Latest call</p>
            <p className="text-2xl font-black text-blue-300">{formatBingoNumber(lastCalled)}</p>
          </div>
        )}

        {card ? (
          <div className="glass-card p-4 space-y-3">
            <p className="text-faint text-xs text-center leading-relaxed">
              {called.length === 0
                ? 'Your card is ready. Wait for the host to call — matching squares turn blue; tap blue to mark green.'
                : 'Tap blue squares to mark green. Complete a row, column, or diagonal, then tap BINGO!'}
            </p>
            <BingoCardGrid
              cells={card.cells}
              markedIndices={card.marked_indices}
              calledNumbers={called}
              onMark={markCell}
              disabled={marking}
            />
          </div>
        ) : isViewer ? (
          <div className="glass-card p-4">
            <CalledNumbersBoard calledNumbers={called} />
          </div>
        ) : cardBlocked ? (
          // NOT "no card yet" — the server would not hand this device a card. Say that, so an
          // expired session doesn't read as "the host hasn't dealt".
          <div className="glass-card p-6 text-center space-y-2">
            <p className="text-muted text-sm">Your player session expired</p>
            <p className="text-faint text-xs">Rejoin with your player code to see your card again.</p>
          </div>
        ) : (
          <div className="glass-card p-6 text-center space-y-2">
            <p className="text-muted text-sm">Dealing your card…</p>
            <p className="text-faint text-xs">If this stays empty, ask the host to start the game.</p>
          </div>
        )}

        {canClaim && (
          <button
            type="button"
            onClick={claimBingo}
            disabled={claiming}
            className="btn-primary w-full text-lg font-black"
          >
            {claiming ? 'Claiming…' : 'BINGO! 🎉'}
          </button>
        )}

        <details className="glass-card p-4">
          <summary className="cursor-pointer text-sm font-medium text-muted">Called numbers board</summary>
          <div className="mt-4">
            <CalledNumbersBoard calledNumbers={called} />
          </div>
        </details>
      </div>
    </div>
  )
}
