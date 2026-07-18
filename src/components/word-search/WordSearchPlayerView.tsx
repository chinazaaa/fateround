'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  WordSearchBoard,
  wordSearchPlayerColor,
  WORD_SEARCH_MY_CELL_COLOR,
} from '@/components/word-search/WordSearchBoard'
import { WordList } from '@/components/word-search/WordList'
import { WordSearchGameTimerBar } from '@/components/word-search/WordSearchGameTimerBar'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { useGameScores } from '@/components/roster/RosterDrawerContext'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { FinalResultsShareBlock } from '@/components/FinalResultsShareBlock'
import {
  parseWordSearchMetadata,
  buildFoundOwnerGrid,
  buildPlayerFoundCells,
  playerFoundWords,
  tallyWordSearchScores,
  wordSearchCompletionPercent,
  selectionCells,
  placementCells,
  WORD_SEARCH_MIN_PLAYERS,
  WORD_SEARCH_HINT_PENALTY,
  type WordSearchMetadata,
  type WordSearchFound,
  type WordSearchPlacement,
} from '@/lib/word-search'
import { getPlayerTimeSpent } from '@/lib/sudoku'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { PLAYER_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import { formatMinutesSeconds } from '@/lib/timer-format'
import { useGameRosterPoll } from '@/hooks/useGameRosterPoll'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { allowLatePlayers, playerIsViewer, preJoinScreen } from '@/lib/viewers'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { gameTypeConfig } from '@/lib/game-types'
import type { Game, Player } from '@/types'

const WORD_SEARCH_FOUND_SELECT =
  'id,game_id,round_id,player_id,word,start_row,start_col,end_row,end_col,via_hint,found_at'

const cellKey = (row: number, col: number) => `${row}-${col}`

/** Adapt found rows to the shape getPlayerTimeSpent expects (last find = finish time). */
function foundAsTimeRows(found: WordSearchFound[]) {
  return found.map((f) => ({
    player_id: f.player_id,
    is_correct: true,
    cell_row: 0,
    cell_col: 0,
    submitted_at: f.found_at,
  }))
}

type View = 'loading' | 'join' | 'late_join_choice' | 'waiting' | 'playing' | 'finished'
type WordSearchGameState = { hasValidRound: boolean }

export function WordSearchPlayerView({ gameCode }: { gameCode: string }) {
  const cfg = gameTypeConfig('word_search')
  const router = useRouter()
  const { confirm } = useConfirm()
  const [roundId, setRoundId] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<WordSearchMetadata | null>(null)
  const [found, setFound] = useState<WordSearchFound[]>([])
  const [placements, setPlacements] = useState<WordSearchPlacement[] | null>(null)
  const [nowMs, setNowMs] = useState<number>(Date.now())
  const [invalidCells, setInvalidCells] = useState<Set<string>>(new Set())
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set())
  const [previewWord, setPreviewWord] = useState<string | null>(null)
  const [flashedWord, setFlashedWord] = useState<string | null>(null)
  const [hinting, setHinting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  // Finds submit per-selection so rapid finds don't serialize behind one global lock.
  const inFlight = useRef<Set<string>>(new Set())
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2500)
  }

  /** Merge a found row, deduped by (player, word) — a player scores each word once. */
  const addFound = useCallback((row: WordSearchFound) => {
    setFound((prev) => (prev.some((f) => f.player_id === row.player_id && f.word === row.word) ? prev : [...prev, row]))
  }, [])

  const loadGameState = useCallback(async (): Promise<{ state: WordSearchGameState; ok: boolean }> => {
    return { state: { hasValidRound: false }, ok: true }
  }, [])

  const afterResolve = useCallback(
    async (gameData: Game, playerId: string | null): Promise<WordSearchGameState> => {
      // Finished games show the final leaderboard to everyone — even a session-less visitor.
      // Load the round metadata too: without it, `metadata` is null on a refresh of the
      // finished screen and the leaderboard (and answer key) blank out because the tally
      // can't run.
      if (gameData.status === 'finished') {
        const { data: roundData } = await supabase
          .from('rounds')
          .select('id, word_search_metadata')
          .eq('game_id', gameCode)
          .eq('round_number', 1)
          .maybeSingle()
        if (roundData) {
          const meta = parseWordSearchMetadata((roundData as Record<string, unknown>).word_search_metadata)
          if (meta) setMetadata(meta)
          setRoundId(roundData.id as string)
        }
        const { data: rows } = await supabase
          .from('word_search_found')
          .select(WORD_SEARCH_FOUND_SELECT)
          .eq('game_id', gameCode)
        setFound((rows ?? []) as WordSearchFound[])
        return { hasValidRound: false }
      }

      if (!playerId) return { hasValidRound: false }
      if (gameData.status === 'waiting') return { hasValidRound: false }

      const { data: roundData } = await supabase
        .from('rounds')
        .select('id, word_search_metadata')
        .eq('game_id', gameCode)
        .eq('round_number', 1)
        .maybeSingle()
      if (!roundData) return { hasValidRound: false }

      const meta = parseWordSearchMetadata((roundData as Record<string, unknown>).word_search_metadata)
      if (!meta) return { hasValidRound: false }

      setMetadata(meta)
      setRoundId(roundData.id as string)

      const { data: rows } = await supabase
        .from('word_search_found')
        .select(WORD_SEARCH_FOUND_SELECT)
        .eq('round_id', roundData.id)
      setFound((rows ?? []) as WordSearchFound[])
      return { hasValidRound: true }
    },
    [gameCode]
  )

  const computeScreen = useCallback((gameData: Game, playerId: string | null, state: WordSearchGameState): View => {
    if (gameData.status === 'finished') return 'finished'
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      return pre === 'late_join_choice' ? 'late_join_choice' : 'join'
    }
    if (gameData.status === 'waiting') return 'waiting'
    return state.hasValidRound ? 'playing' : 'waiting'
  }, [])

  const {
    screen: view,
    game,
    setGame,
    players,
    setPlayers,
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
  } = useGameViewBootstrap<View, WordSearchGameState>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'loading',
    loadGameState,
    computeScreen,
    afterResolve,
    joinExtras,
    onJoinError: (message) => showToast(message, false),
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  useTurnNotifications({ status: game?.status })

  useEffect(() => {
    if (view === 'playing') {
      const interval = setInterval(() => setNowMs(Date.now()), 1000)
      return () => clearInterval(interval)
    }
  }, [view])

  // A replay reuses this component with a fresh round — drop the previous game's word
  // placements so the finish screen refetches the new puzzle's answer key instead of
  // highlighting stale positions over the new grid.
  useEffect(() => {
    setPlacements(null)
  }, [roundId])

  useEffect(() => {
    if (view !== 'finished' || placements) return
    let cancelled = false
    fetch(`/api/word-search/solution?gameId=${gameCode.toUpperCase()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && Array.isArray(j?.placements)) setPlacements(j.placements as WordSearchPlacement[])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [view, placements, gameCode])

  useGameRosterPoll(gameCode, game?.status, { setGame, setPlayers, reload: load })

  // Latest committed status, read by the games channel without resubscribing.
  const gameStatusRef = useRef(game?.status)
  gameStatusRef.current = game?.status
  useEffect(() => {
    const ch = supabase
      .channel(`word_search_game_${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          const next = payload.new as Game
          setGame(next)
          // Full reload only on a status transition; other games-row writes just refresh the
          // object above. Reloading on every UPDATE was a primary driver of the finish flicker.
          if (next.status !== gameStatusRef.current) load()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode, load, setGame])

  useEffect(() => {
    if (!roundId) return
    // With many players, found-word INSERTs arrive for EVERYONE — applying each as its own setState
    // re-renders the whole board (+ leaderboard tally) per event and starves your own input.
    // Buffer incoming rows and flush them in a single update a few times a second instead.
    const pending: WordSearchFound[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    const flush = () => {
      flushTimer = null
      if (pending.length === 0) return
      const batch = pending.splice(0, pending.length)
      setFound((prev) => {
        const seen = new Set(prev.map((f) => `${f.player_id}|${f.word}`))
        const add = batch.filter((r) => {
          const key = `${r.player_id}|${r.word}`
          return seen.has(key) ? false : (seen.add(key), true)
        })
        return add.length ? [...prev, ...add] : prev
      })
    }
    const ch = supabase
      .channel(`word_search_found_${roundId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'word_search_found', filter: `round_id=eq.${roundId}` },
        (payload) => {
          pending.push(payload.new as WordSearchFound)
          if (!flushTimer) flushTimer = setTimeout(flush, 200)
        }
      )
      .subscribe()
    return () => {
      if (flushTimer) clearTimeout(flushTimer)
      void supabase.removeChannel(ch)
    }
  }, [roundId])

  useEffect(() => {
    const ch = supabase
      .channel(`word_search_players_${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        () => {
          supabase
            .from('players')
            .select(PLAYER_SELECT)
            .eq('game_id', gameCode)
            .order('joined_at')
            .then(({ data }) => {
              if (data) setPlayers(data as Player[])
            })
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode, setPlayers])

  useRoomMemberAutoJoin({
    gameCode,
    displayName: roomDisplayName,
    resolving: resolvingRoomMember,
    screen: view,
    gameStatus: game?.status,
    hasPlayerSession: !!myPlayerId,
    joining,
    onJoin: (name) => join({ name }),
  })

  async function handleReady() {
    if (!myResumeToken) return
    await fetch('/api/players/ready', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
    })
    await load()
  }

  const [replayReadyPending, setReplayReadyPending] = useState(false)
  async function toggleReplayReady(ready: boolean) {
    if (!myResumeToken) {
      showToast('Your player session expired — rejoin to continue', false)
      return
    }
    setReplayReadyPending(true)
    try {
      await fetch('/api/players/ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, ready }),
      })
      await load()
    } finally {
      setReplayReadyPending(false)
    }
  }

  function handlePlayerLeft() {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyResumeToken(null)
    setJoinName('')
    void load()
  }

  const activePlayers = useMemo(() => players.filter((p) => p.spectator !== true), [players])
  const playerColors = useMemo(() => {
    const map: Record<string, string> = {}
    activePlayers.forEach((p, i) => {
      map[p.id] = wordSearchPlayerColor(i)
    })
    return map
  }, [activePlayers])

  const cellOwners = useMemo(() => (metadata ? buildFoundOwnerGrid(metadata, found) : []), [metadata, found])
  const myFoundCells = useMemo(
    () => (metadata && myPlayerId ? buildPlayerFoundCells(metadata, found, myPlayerId) : undefined),
    [metadata, found, myPlayerId]
  )
  const myFoundWords = useMemo(
    () => (myPlayerId ? playerFoundWords(found, myPlayerId) : new Set<string>()),
    [found, myPlayerId]
  )
  // Word search is an individual-board race — the grid only ever shows MY finds, so the word
  // list must match. Building this from every player's finds would strike words off my list
  // the moment anyone else found them, making it impossible to track my own progress.
  const wordOwners = useMemo(() => {
    const m = new Map<string, string>()
    if (myPlayerId) for (const w of myFoundWords) m.set(w, myPlayerId)
    return m
  }, [myFoundWords, myPlayerId])

  // Memoized: re-ran on every render (1s tick, each keystroke-free drag, others' found words)
  // and loops words × players over every player's accumulated finds — the input-thread cost.
  const leaderboard = useMemo(
    () => (metadata ? tallyWordSearchScores(metadata, found, players) : []),
    [metadata, found, players]
  )

  // Live scores feed the shared roster drawer (opened from the header).
  const rosterScores = useMemo(
    () => Object.fromEntries(leaderboard.map((row) => [row.player_id, row.points])),
    [leaderboard]
  )
  useGameScores(rosterScores, { suffix: ' pts' })
  const me = players.find((p) => p.id === myPlayerId)
  const isSpectator = me?.spectator === true
  const isViewer = !!(game && me && playerIsViewer(me, game))

  // Change name · Leave game for players/spectators live behind the main chrome's ⚙
  // gear (top header). Registered while the game is active; the shared settings sheet
  // renders it.
  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId || game?.status !== 'active') return null
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

  const myRank = leaderboard.findIndex((r) => r.player_id === myPlayerId) + 1
  const myCompletion = metadata && myPlayerId ? wordSearchCompletionPercent(metadata, found, myPlayerId) : 0
  const allFound = !!metadata && myFoundWords.size >= metadata.words.length

  const { context: lateJoinContext, loading: lateJoinContextLoading } = useLateJoinContext(
    gameCode,
    game,
    view === 'late_join_choice',
    found.length
  )
  const { context: viewerPromoteContext } = useLateJoinContext(
    gameCode,
    game,
    isViewer && view === 'playing',
    found.length
  )

  function flashInvalid(start: [number, number], end: [number, number]) {
    const cells = selectionCells(start, end)
    if (!cells) return
    setInvalidCells(new Set(cells.map(([r, c]) => cellKey(r, c))))
    setTimeout(() => setInvalidCells(new Set()), 500)
  }

  async function submitFound(start: [number, number], end: [number, number], hint: boolean) {
    if (!myPlayerId || !roundId) return
    if (!myResumeToken) {
      showToast('Your session has expired — please rejoin', false)
      return
    }
    const key = hint ? 'hint' : `${start[0]}-${start[1]}-${end[0]}-${end[1]}`
    if (inFlight.current.has(key)) return
    inFlight.current.add(key)
    try {
      const res = await fetch('/api/word-search/found', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          resumeToken: myResumeToken,
          startRow: start[0],
          startCol: start[1],
          endRow: end[0],
          endCol: end[1],
          hint,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        // Timer expiry (or a finish race) flips the game — refetch to land on results.
        if (typeof json.error === 'string' && json.error.toLowerCase().includes('time')) {
          await load()
        } else {
          showToast(json.error ?? 'Submission failed', false)
        }
        return
      }
      if (json.found) {
        const s: [number, number] = json.start ?? start
        const e: [number, number] = json.end ?? end
        addFound({
          id: `local-${json.word}-${myPlayerId}`,
          game_id: gameCode,
          round_id: roundId,
          player_id: myPlayerId,
          word: json.word,
          start_row: s[0],
          start_col: s[1],
          end_row: e[0],
          end_col: e[1],
          via_hint: !!hint,
          found_at: new Date().toISOString(),
        })
        if (hint) showToast(`Revealed ${json.word} · ${WORD_SEARCH_HINT_PENALTY} pts`, true)
        else if (!json.alreadyFound) showToast(`Found ${json.word}!`, true)
      } else if (!hint) {
        flashInvalid(start, end)
        showToast('Not a word', false)
      } else if (json.complete) {
        showToast('You have found every word', true)
      }
    } finally {
      inFlight.current.delete(key)
      if (!hint) setPendingCells(new Set())
    }
  }

  // Stable identity (reads the latest submitFound via a ref) so the memoized board skips
  // ambient re-renders instead of rebuilding every cell on the 1s tick / roster refresh.
  const submitFoundRef = useRef(submitFound)
  submitFoundRef.current = submitFound
  const handleSelect = useCallback((start: [number, number], end: [number, number]) => {
    // Keep the selection highlighted until its found/wrong result lands (cleared in the
    // submit's finally) so it never blinks off before the feedback appears.
    const cells = selectionCells(start, end)
    if (cells) setPendingCells(new Set(cells.map(([r, c]) => cellKey(r, c))))
    void submitFoundRef.current(start, end, false)
  }, [])

  async function handleHint() {
    if (hinting || allFound) return
    const ok = await confirm({
      title: 'Reveal a word?',
      message: `Reveals and locks in one still-hidden word for a ${WORD_SEARCH_HINT_PENALTY}-point penalty.`,
      confirmLabel: 'Reveal a word',
    })
    if (!ok) return
    setHinting(true)
    try {
      await submitFound([0, 0], [0, 0], true)
    } finally {
      setHinting(false)
    }
  }

  function handleWordFlash(word: string) {
    setFlashedWord(word)
    setTimeout(() => setFlashedWord((w) => (w === word ? null : w)), 700)
  }

  if (view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  if (view === 'join') {
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
            title={game?.title ?? 'Word Search'}
            gameType="word_search"
            subtitle="Race to spot every hidden word first."
            meta={<GameInfoChips game={game} />}
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
          gameType="word_search"
          submitLabel="Join game"
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="word_search" variant="subtle" />
            </p>
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (view === 'late_join_choice' && game) {
    return (
      <LateJoinChoice
        gameCode={gameCode}
        game={game}
        context={lateJoinContext}
        contextLoading={lateJoinContextLoading}
        playersAllowed={allowLatePlayers(game)}
        showNameField
        nameInput={joinName}
        onNameChange={setJoinName}
        joining={joining}
        onJoinAsViewer={() => void join({ joinAsViewer: true })}
        onJoinAsPlayer={() => void join({ joinAsViewer: false })}
      />
    )
  }

  if (view === 'waiting') {
    if (game?.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={WORD_SEARCH_MIN_PLAYERS}
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
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          game={game}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={me?.name ?? ''}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title={game?.title ?? 'Word Search'}
          description="Waiting for the host to start the hunt…"
          rulesLink={<GameRulesLink gameType="word_search" variant="subtle" />}
          isSpectator={isSpectator}
          onReady={handleReady}
        />
      </GameJoinLobbyShell>
    )
  }

  if (view === 'finished' && game) {
    const myRow = leaderboard.find((row) => row.player_id === myPlayerId)
    const iWon =
      !!myRow &&
      leaderboard.length > 1 &&
      leaderboard[0] != null &&
      myRow === leaderboard[0] &&
      leaderboard[0].points > 0
    return (
      <div className="min-h-screen flex flex-col">
        <main className="pt-16 flex-1 px-4 py-8 max-w-lg mx-auto w-full space-y-6">
          <FinalResultsShareBlock game={game} participants={[]} votes={[]} rounds={[]} players={players}>
            <div className="glass-card-strong p-8 text-center space-y-2">
              <p className="text-4xl">🏆</p>
              <p className="text-2xl font-black">Hunt complete!</p>
              {leaderboard[0] && (
                <p className="text-muted text-base">
                  {leaderboard[0].name} wins with {leaderboard[0].points} pts
                </p>
              )}
            </div>
            <PaginatedLeaderboard
              title="Final leaderboard"
              rows={leaderboard.map((row, i) => {
                const pct = metadata ? wordSearchCompletionPercent(metadata, found, row.player_id) : 0
                const timeSecs = getPlayerTimeSpent(
                  game,
                  foundAsTimeRows(found),
                  row.player_id,
                  pct,
                  nowMs,
                  players.find((p) => p.id === row.player_id)?.joined_at
                )
                return {
                  id: row.player_id,
                  name: `${row.name} (⏱️ ${formatMinutesSeconds(timeSecs)})`,
                  score: row.points,
                  rank: i + 1,
                }
              })}
              highlightId={myPlayerId ?? undefined}
              scoreLabel={(n) => `${n} pts`}
            />
          </FinalResultsShareBlock>
          {iWon && (
            <PostWinToCommunity
              gameType="word_search"
              gameCode={gameCode}
              winnerName={myRow?.name ?? ''}
              roundKey={game?.session_started_at ?? undefined}
            />
          )}
          {placements && metadata && (
            <div className="glass-card p-4 space-y-3">
              <p className="label-caps text-xs">Answer key</p>
              <WordSearchBoard
                metadata={metadata}
                readOnly
                myFoundCells={(() => {
                  const g = metadata.grid.map((row) => row.map(() => false))
                  for (const p of placements) {
                    for (const [r, c] of placementCells(p)) {
                      if (g[r]) g[r][c] = true
                    }
                  }
                  return g
                })()}
                myColor="#8b5cf6"
              />
              <div className="flex flex-wrap gap-1.5">
                {placements.map((p) => (
                  <span
                    key={p.word}
                    className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-muted"
                  >
                    {p.word}
                  </span>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/80 dark:bg-slate-950/50">
      {toast && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-semibold shadow-lg ${toast.ok ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}
        >
          {toast.msg}
        </div>
      )}
      <main className="pt-16 flex-1 px-3 py-4 max-w-lg mx-auto w-full space-y-4">
        <WordSearchGameTimerBar gameCode={gameCode} game={game} onExpired={load} />

        {isViewer ? (
          <ViewerModeBanner
            gameCode={gameCode}
            playerId={myPlayerId}
            game={game}
            player={me}
            playerDetail={viewerPromoteContext?.playerDetail}
            onPromoted={load}
          />
        ) : (
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-sm shrink-0" style={{ backgroundColor: WORD_SEARCH_MY_CELL_COLOR }} />
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-100 leading-tight">{me?.name ?? 'Me'}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {myRank > 0 ? ordinal(myRank) : '—'} | {myCompletion}%
                </p>
              </div>
            </div>
            {game?.session_started_at && (
              <div className="text-sm font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-md">
                ⏱️{' '}
                {formatMinutesSeconds(
                  getPlayerTimeSpent(game, foundAsTimeRows(found), myPlayerId || '', myCompletion, nowMs, me?.joined_at)
                )}
              </div>
            )}
          </div>
        )}

        {metadata && (
          <>
            <WordList
              words={metadata.words}
              wordOwners={wordOwners}
              myPlayerId={myPlayerId}
              myColor={WORD_SEARCH_MY_CELL_COLOR}
              playerColors={playerColors}
              onWordFlash={handleWordFlash}
              flashedWord={flashedWord}
              onReveal={isViewer ? undefined : () => void handleHint()}
              revealDisabled={hinting || allFound}
              revealTitle={`Reveal a hidden word (${WORD_SEARCH_HINT_PENALTY} pts)`}
            />

            {!isViewer &&
              (allFound ? (
                <div className="mx-auto px-4 py-3 flex flex-col items-center justify-center glass-card text-center gap-0.5">
                  <span className="text-base font-extrabold text-[var(--foreground)]">🎉 All words found!</span>
                  <span className="text-sm text-muted">
                    Nicely done — waiting for the other players{game?.game_duration_seconds ? ' or the timer' : ''} to
                    finish.
                  </span>
                </div>
              ) : (
                <div className="mx-auto min-h-[3rem] min-w-[10rem] px-4 flex items-center justify-center glass-card">
                  <span className="text-2xl font-extrabold tracking-[0.25em] text-[var(--foreground)]">
                    {previewWord || (
                      <span className="text-sm font-normal tracking-normal text-muted">Drag to spell a word</span>
                    )}
                  </span>
                </div>
              ))}

            <WordSearchBoard
              metadata={metadata}
              cellOwners={cellOwners}
              myFoundCells={myFoundCells}
              playerColors={playerColors}
              myPlayerId={myPlayerId}
              invalidCells={invalidCells}
              pendingCells={pendingCells}
              onSelect={handleSelect}
              onPreviewChange={setPreviewWord}
              readOnly={isViewer}
            />
          </>
        )}

        {/* Live standings */}
        <div className="space-y-2">
          {leaderboard.map((row, i) => {
            const pct = metadata ? wordSearchCompletionPercent(metadata, found, row.player_id) : 0
            const color = playerColors[row.player_id] ?? '#94a3b8'
            const timeSecs = getPlayerTimeSpent(
              game,
              foundAsTimeRows(found),
              row.player_id,
              pct,
              nowMs,
              players.find((p) => p.id === row.player_id)?.joined_at
            )
            return (
              <div
                key={row.player_id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  row.player_id === myPlayerId
                    ? 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
                    : 'border-transparent bg-slate-100/60 dark:bg-slate-900/40'
                }`}
              >
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{row.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {ordinal(i + 1)} of {leaderboard.length} · {row.wordsFound} words · {pct}%
                    {game?.session_started_at ? ` · ⏱️ ${formatMinutesSeconds(timeSecs)}` : ''}
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                  {row.points} pts
                </span>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}

function ordinal(n: number): string {
  const j = n % 10
  const k = n % 100
  if (j === 1 && k !== 11) return `${n}st`
  if (j === 2 && k !== 12) return `${n}nd`
  if (j === 3 && k !== 13) return `${n}rd`
  return `${n}th`
}
