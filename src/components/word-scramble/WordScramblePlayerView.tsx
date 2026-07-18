'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { WordScrambleGameTimerBar } from '@/components/word-scramble/WordScrambleGameTimerBar'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { useGameScores } from '@/components/roster/RosterDrawerContext'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { ShareResults } from '@/components/ShareResults'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import {
  parseWordScrambleMetadata,
  tallyWordScrambleScores,
  wordScrambleCompletionPercent,
  playerCurrentIndex,
  playerSolvedIndices,
  WORD_SCRAMBLE_MIN_PLAYERS,
  WORD_SCRAMBLE_HINT_PENALTY,
  WORD_SCRAMBLE_CLUE_PENALTY,
  type WordScrambleMetadata,
  type WordScrambleSolve,
  type WordScrambleHint,
} from '@/lib/word-scramble'
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
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { gameTypeConfig } from '@/lib/game-types'
import type { Game, Player } from '@/types'

const SOLVE_SELECT = 'id,game_id,round_id,player_id,scramble_index,word,via_hint,solved_at'
const HINT_SELECT = 'player_id,scramble_index,letters'

/** Adapt solve rows to the shape getPlayerTimeSpent expects (last solve = finish time). */
function solvesAsTimeRows(solves: WordScrambleSolve[]) {
  return solves.map((s) => ({
    player_id: s.player_id,
    is_correct: true,
    cell_row: 0,
    cell_col: 0,
    submitted_at: s.solved_at,
  }))
}

type View = 'loading' | 'join' | 'late_join_choice' | 'waiting' | 'playing' | 'finished'
type WordScrambleGameState = { hasValidRound: boolean }

export function WordScramblePlayerView({ gameCode }: { gameCode: string }) {
  const cfg = gameTypeConfig('word_scramble')
  const router = useRouter()
  const { confirm } = useConfirm()
  const [roundId, setRoundId] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<WordScrambleMetadata | null>(null)
  const [solves, setSolves] = useState<WordScrambleSolve[]>([])
  const [hints, setHints] = useState<WordScrambleHint[]>([])
  const [revealedPrefix, setRevealedPrefix] = useState<Record<number, string>>({})
  const [watchedPlayerId, setWatchedPlayerId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<string[] | null>(null)
  const [nowMs, setNowMs] = useState<number>(Date.now())
  const [guess, setGuess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [wrongFlash, setWrongFlash] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const inFlight = useRef<Set<number>>(new Set())
  const finishedCaptureRef = useRef<HTMLDivElement>(null)
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2000)
  }

  /** Merge a solve row, deduped by (player, index). */
  const addSolve = useCallback((row: WordScrambleSolve) => {
    setSolves((prev) =>
      prev.some((s) => s.player_id === row.player_id && s.scramble_index === row.scramble_index) ? prev : [...prev, row]
    )
  }, [])

  /** Merge a hint row, keeping the highest letter count per (player, index). */
  const addHint = useCallback((row: WordScrambleHint) => {
    setHints((prev) => {
      const i = prev.findIndex((h) => h.player_id === row.player_id && h.scramble_index === row.scramble_index)
      if (i === -1) return [...prev, row]
      if (prev[i].letters >= row.letters) return prev
      const next = [...prev]
      next[i] = row
      return next
    })
  }, [])

  const loadGameState = useCallback(async (): Promise<{ state: WordScrambleGameState; ok: boolean }> => {
    return { state: { hasValidRound: false }, ok: true }
  }, [])

  const afterResolve = useCallback(
    async (gameData: Game, playerId: string | null): Promise<WordScrambleGameState> => {
      if (gameData.status === 'finished') {
        const { data: roundData } = await supabase
          .from('rounds')
          .select('id, word_scramble_metadata')
          .eq('game_id', gameCode)
          .eq('round_number', 1)
          .maybeSingle()
        if (roundData) {
          const meta = parseWordScrambleMetadata((roundData as Record<string, unknown>).word_scramble_metadata)
          if (meta) setMetadata(meta)
          setRoundId(roundData.id as string)
        }
        const { data: rows } = await supabase.from('word_scramble_solves').select(SOLVE_SELECT).eq('game_id', gameCode)
        setSolves((rows ?? []) as WordScrambleSolve[])
        const { data: hintRows } = await supabase
          .from('word_scramble_hints')
          .select(HINT_SELECT)
          .eq('game_id', gameCode)
        setHints((hintRows ?? []) as WordScrambleHint[])
        return { hasValidRound: false }
      }

      if (!playerId) return { hasValidRound: false }
      if (gameData.status === 'waiting') return { hasValidRound: false }

      const { data: roundData } = await supabase
        .from('rounds')
        .select('id, word_scramble_metadata')
        .eq('game_id', gameCode)
        .eq('round_number', 1)
        .maybeSingle()
      if (!roundData) return { hasValidRound: false }
      const meta = parseWordScrambleMetadata((roundData as Record<string, unknown>).word_scramble_metadata)
      if (!meta) return { hasValidRound: false }
      setMetadata(meta)
      setRoundId(roundData.id as string)

      const { data: rows } = await supabase
        .from('word_scramble_solves')
        .select(SOLVE_SELECT)
        .eq('round_id', roundData.id)
      setSolves((rows ?? []) as WordScrambleSolve[])
      const { data: hintRows } = await supabase
        .from('word_scramble_hints')
        .select(HINT_SELECT)
        .eq('round_id', roundData.id)
      setHints((hintRows ?? []) as WordScrambleHint[])
      return { hasValidRound: true }
    },
    [gameCode]
  )

  const computeScreen = useCallback((gameData: Game, playerId: string | null, state: WordScrambleGameState): View => {
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
  } = useGameViewBootstrap<View, WordScrambleGameState>({
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

  useEffect(() => {
    if (view !== 'finished' || answers) return
    let cancelled = false
    fetch(`/api/word-scramble/solution?gameId=${gameCode.toUpperCase()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && Array.isArray(j?.answers)) setAnswers(j.answers as string[])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [view, answers, gameCode])

  useGameRosterPoll(gameCode, game?.status, { setGame, setPlayers, reload: load })

  // Latest committed status, read by the games channel without resubscribing.
  const gameStatusRef = useRef(game?.status)
  gameStatusRef.current = game?.status
  useEffect(() => {
    const ch = supabase
      .channel(`word_scramble_game_${gameCode}`)
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
    // Many players ⇒ a solve INSERT per player per word, delivered to EVERYONE. Applying each as its
    // own setState re-renders the board (+ leaderboard tally) per event and starves your own input.
    // Buffer incoming rows and flush them in a single update a few times a second instead.
    const pending: WordScrambleSolve[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    const flush = () => {
      flushTimer = null
      if (pending.length === 0) return
      const batch = pending.splice(0, pending.length)
      setSolves((prev) => {
        const seen = new Set(prev.map((s) => `${s.player_id}|${s.scramble_index}`))
        const add = batch.filter((r) => {
          const key = `${r.player_id}|${r.scramble_index}`
          return seen.has(key) ? false : (seen.add(key), true)
        })
        return add.length ? [...prev, ...add] : prev
      })
    }
    const ch = supabase
      .channel(`word_scramble_solves_${roundId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'word_scramble_solves', filter: `round_id=eq.${roundId}` },
        (payload) => {
          pending.push(payload.new as WordScrambleSolve)
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
    if (!roundId) return
    const ch = supabase
      .channel(`word_scramble_hints_${roundId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'word_scramble_hints', filter: `round_id=eq.${roundId}` },
        (payload) => addHint(payload.new as WordScrambleHint)
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [roundId, addHint])

  useEffect(() => {
    const ch = supabase
      .channel(`word_scramble_players_${gameCode}`)
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
    if (!myResumeToken) return
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
    void load()
  }

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

  // Memoized: without it, tallyWordScrambleScores re-ran on every `setGuess` keystroke (and
  // every 1s tick), which is the whole cause of the guess field lagging behind typing.
  const leaderboard = useMemo(
    () => (metadata ? tallyWordScrambleScores(metadata, solves, players, { hints }) : []),
    [metadata, solves, players, hints]
  )

  // Live scores feed the shared roster drawer (opened from the header).
  const rosterScores = useMemo(
    () => Object.fromEntries(leaderboard.map((row) => [row.player_id, row.points])),
    [leaderboard]
  )
  useGameScores(rosterScores, { suffix: ' pts' })
  const myRank = leaderboard.findIndex((r) => r.player_id === myPlayerId) + 1
  const myCompletion = metadata && myPlayerId ? wordScrambleCompletionPercent(metadata, solves, myPlayerId) : 0
  const mySolvedCount = myPlayerId ? playerSolvedIndices(solves, myPlayerId).size : 0
  const myCurrent = metadata && myPlayerId ? playerCurrentIndex(metadata, solves, myPlayerId) : 0
  const allSolved = !!metadata && mySolvedCount >= metadata.count
  const currentScramble = metadata && myCurrent < metadata.count ? metadata.scrambles[myCurrent] : null

  // ── Spectator: pick a player and watch their scrambles fill in live ──
  const activePlayers = players.filter((p) => p.spectator !== true)
  const effectiveWatchedId =
    (watchedPlayerId && activePlayers.some((p) => p.id === watchedPlayerId) ? watchedPlayerId : null) ??
    leaderboard[0]?.player_id ??
    activePlayers[0]?.id ??
    null
  const watchedPlayer = players.find((p) => p.id === effectiveWatchedId)
  const watchedSolvedCount = effectiveWatchedId ? playerSolvedIndices(solves, effectiveWatchedId).size : 0
  const watchedCurrent = metadata && effectiveWatchedId ? playerCurrentIndex(metadata, solves, effectiveWatchedId) : 0
  const watchedPct =
    metadata && effectiveWatchedId ? wordScrambleCompletionPercent(metadata, solves, effectiveWatchedId) : 0
  const watchedWords = useMemo(() => {
    const m = new Map<number, string>()
    if (effectiveWatchedId)
      for (const s of solves) if (s.player_id === effectiveWatchedId) m.set(s.scramble_index, s.word)
    return m
  }, [solves, effectiveWatchedId])

  const { context: lateJoinContext, loading: lateJoinContextLoading } = useLateJoinContext(
    gameCode,
    game,
    view === 'late_join_choice',
    solves.length
  )

  async function revealWithConfirm() {
    const ok = await confirm({
      title: 'Reveal the answer?',
      message: `This shows the word but costs you ${Math.abs(WORD_SCRAMBLE_HINT_PENALTY)} points.`,
      confirmLabel: 'Reveal',
      cancelLabel: 'Keep trying',
    })
    if (ok) void submit(true)
  }

  const myClue = revealedPrefix[myCurrent] ?? ''
  const hintAvailable = !!(metadata?.hints && myCurrent < metadata.count && (metadata.hints[myCurrent] ?? '').trim())

  async function revealClue() {
    if (!myPlayerId || !myResumeToken || !metadata || submitting) return
    if (myCurrent >= metadata.count) return
    const index = myCurrent
    const ok = await confirm({
      title: 'Reveal the clue?',
      message: `Shows a clue for this word — costs ${Math.abs(WORD_SCRAMBLE_CLUE_PENALTY)} point.`,
      confirmLabel: 'Reveal clue',
      cancelLabel: 'Keep trying',
    })
    if (!ok) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/word-scramble/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, scrambleIndex: index }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (typeof json.error === 'string' && json.error.toLowerCase().includes('time')) await load()
        else showToast(json.error ?? 'Could not get a hint', false)
        return
      }
      if (!json.available) {
        showToast('No clue for this word', false)
        return
      }
      const clue = typeof json.clue === 'string' ? json.clue : (metadata.hints?.[index] ?? '')
      setRevealedPrefix((prev) => ({ ...prev, [index]: clue }))
      addHint({ player_id: myPlayerId, scramble_index: index, letters: 1 })
    } finally {
      setSubmitting(false)
    }
  }

  async function submit(hint: boolean) {
    if (!myPlayerId || !roundId || !myResumeToken || !metadata) return
    if (myCurrent >= metadata.count) return
    const index = myCurrent
    if (inFlight.current.has(index)) return
    inFlight.current.add(index)
    const submittedGuess = guess
    // Clear the field right away (the input stays editable) so it feels instant and the player
    // can start typing the next word without waiting for the round trip.
    if (!hint) setGuess('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/word-scramble/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          resumeToken: myResumeToken,
          scrambleIndex: index,
          guess: submittedGuess,
          hint,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (typeof json.error === 'string' && json.error.toLowerCase().includes('time')) await load()
        else showToast(json.error ?? 'Submission failed', false)
        return
      }
      if (json.correct) {
        // Optimistically record my solve so my progress advances instantly.
        addSolve({
          id: `local-${index}-${myPlayerId}`,
          game_id: gameCode,
          round_id: roundId,
          player_id: myPlayerId,
          scramble_index: index,
          word: json.word,
          via_hint: !!hint,
          solved_at: new Date().toISOString(),
        })
        if (hint) showToast(`Revealed ${json.word} · ${WORD_SCRAMBLE_HINT_PENALTY} pts`, true)
        else showToast('Correct!', true)
        // The server ends the race on the last solve — refetch so we jump straight to the finished
        // screen instead of briefly showing "waiting for others".
        if (json.finished) void load()
      } else {
        setWrongFlash(true)
        setTimeout(() => setWrongFlash(false), 400)
      }
    } finally {
      inFlight.current.delete(index)
      setSubmitting(false)
    }
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
            title={game?.title ?? 'Word Scramble'}
            gameType="word_scramble"
            subtitle="Race to unscramble the jumbled words first."
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
          gameType="word_scramble"
          submitLabel="Join game"
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="word_scramble" variant="subtle" />
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
            minPlayers={WORD_SCRAMBLE_MIN_PLAYERS}
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
          capacityGame={game}
          game={game}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={me?.name ?? ''}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title={game?.title ?? 'Word Scramble'}
          description="Waiting for the host to start the race…"
          rulesLink={<GameRulesLink gameType="word_scramble" variant="subtle" />}
          isSpectator={isSpectator}
          onReady={handleReady}
        />
      </GameJoinLobbyShell>
    )
  }

  if (view === 'finished') {
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
          <div ref={finishedCaptureRef} className="space-y-6">
            {game ? <ShareResultsCaptureHeader game={game} /> : null}
            <div className="glass-card-strong p-8 text-center space-y-2">
              <p className="text-4xl">🏆</p>
              <p className="text-2xl font-black">Race complete!</p>
              {leaderboard[0] && (
                <p className="text-muted text-base">
                  {leaderboard[0].name} wins with {leaderboard[0].points} pts
                </p>
              )}
            </div>
            <PaginatedLeaderboard
              title="Final leaderboard"
              rows={leaderboard.map((row, i) => {
                const pct = metadata ? wordScrambleCompletionPercent(metadata, solves, row.player_id) : 0
                const timeSecs = getPlayerTimeSpent(
                  game,
                  solvesAsTimeRows(solves),
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
          </div>
          {game && (
            <ShareResults
              captureRef={finishedCaptureRef}
              game={game}
              participants={[]}
              votes={[]}
              rounds={[]}
              players={players}
              primary
            />
          )}
          {iWon && (
            <PostWinToCommunity
              gameType="word_scramble"
              gameCode={gameCode}
              winnerName={myRow?.name ?? ''}
              roundKey={game?.session_started_at ?? undefined}
            />
          )}
          {answers && (
            <div className="glass-card p-4 space-y-2">
              <p className="label-caps text-xs">Answers</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {answers.map((a, i) => (
                  <p key={i} className="text-sm">
                    <span className="text-muted tabular-nums">{i + 1}.</span>{' '}
                    <span className="font-bold text-[var(--foreground)]">{a}</span>
                  </p>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    )
  }

  // ── Playing ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-slate-50/80 dark:bg-slate-950/50">
      {toast && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-semibold shadow-lg ${toast.ok ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}
        >
          {toast.msg}
        </div>
      )}
      <main className="pt-16 flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-4">
        <WordScrambleGameTimerBar gameCode={gameCode} game={game} onExpired={load} />
        {isViewer && <ViewerModeBanner />}

        {metadata && (
          <>
            <div className="flex items-center justify-between px-1">
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-100 leading-tight">
                  {isViewer ? (watchedPlayer?.name ?? 'Player') : (me?.name ?? 'Me')}
                </p>
                <p className="text-sm text-muted">
                  {!isViewer && myRank > 0 ? `${myRank}${['th', 'st', 'nd', 'rd'][myRank % 10] ?? 'th'} · ` : ''}
                  {isViewer ? watchedSolvedCount : mySolvedCount}/{metadata.count} solved ·{' '}
                  {isViewer ? watchedPct : myCompletion}%
                </p>
              </div>
            </div>

            {isViewer ? (
              activePlayers.length === 0 ? (
                <p className="text-sm text-muted text-center py-8">
                  No players yet — pick one to watch once they join.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="glass-card p-3 space-y-2">
                    <p className="label-caps text-xs">Watching a player</p>
                    <div className="flex flex-wrap gap-1.5">
                      {activePlayers.map((p) => {
                        const active = p.id === effectiveWatchedId
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setWatchedPlayerId(p.id)}
                            className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${active ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-inset-bg)] text-muted hover:text-[var(--foreground)]'}`}
                          >
                            {p.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {metadata.scrambles.map((scr, i) => {
                      const solvedWord = watchedWords.get(i)
                      const isCurrent = i === watchedCurrent && !solvedWord
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                            solvedWord
                              ? 'border-emerald-500/40 bg-emerald-500/5'
                              : isCurrent
                                ? 'border-[var(--primary)]'
                                : 'border-[var(--border-strong)]'
                          }`}
                        >
                          <span className="text-xs text-muted tabular-nums w-5">{i + 1}.</span>
                          <span
                            className={`flex-1 text-lg font-black tracking-widest uppercase ${solvedWord ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--foreground)]'}`}
                          >
                            {solvedWord ?? scr}
                          </span>
                          <span className="w-5 text-center">{solvedWord ? '✓' : isCurrent ? '✍️' : ''}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            ) : allSolved ? (
              <div className="glass-card p-6 text-center space-y-1">
                <p className="text-2xl">🎉</p>
                <p className="text-lg font-extrabold text-[var(--foreground)]">All solved!</p>
                <p className="text-sm text-muted">
                  Nicely done — waiting for the other players{game?.game_duration_seconds ? ' or the timer' : ''} to
                  finish.
                </p>
              </div>
            ) : (
              <>
                {/* Progress dots */}
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {Array.from({ length: metadata.count }, (_, i) => (
                    <span
                      key={i}
                      className={`h-2 w-2 rounded-full ${i < myCurrent ? 'bg-emerald-500' : i === myCurrent ? 'bg-[var(--primary)]' : 'bg-slate-300 dark:bg-slate-700'}`}
                    />
                  ))}
                </div>

                {/* Scramble tiles */}
                <div className="flex flex-wrap gap-2 justify-center py-4">
                  {(currentScramble ?? '').split('').map((ch, i) => (
                    <span
                      key={i}
                      className={`w-11 h-12 sm:w-12 sm:h-14 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border-2 text-2xl font-black text-[var(--foreground)] shadow-sm transition-colors ${wrongFlash ? 'border-red-500 bg-red-50 dark:bg-red-900/30' : 'border-[var(--border-strong)]'}`}
                    >
                      {ch}
                    </span>
                  ))}
                </div>
                {myClue ? (
                  <p className="text-center text-sm text-muted">
                    Clue: <span className="font-semibold text-[var(--foreground)]">{myClue}</span>
                  </p>
                ) : null}

                {/* Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (guess.trim() && !submitting) void submit(false)
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="characters"
                    placeholder="Type the word…"
                    className="input-field flex-1 text-center text-lg font-bold uppercase tracking-widest"
                  />
                  <button
                    type="submit"
                    disabled={!guess.trim() || submitting}
                    className="shrink-0 px-4 py-2.5 rounded-lg text-sm font-bold bg-[var(--primary)] text-white disabled:opacity-40 transition-colors"
                  >
                    Go
                  </button>
                </form>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void revealClue()}
                    disabled={submitting || !hintAvailable || !!myClue}
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-bold bg-sky-100/80 text-sky-800 dark:bg-sky-900/35 dark:text-sky-200 disabled:opacity-40 transition-colors hover:bg-sky-100"
                    title={`Reveal a clue for this word (${WORD_SCRAMBLE_CLUE_PENALTY} pt)`}
                  >
                    🔎 Clue ({WORD_SCRAMBLE_CLUE_PENALTY})
                  </button>
                  <button
                    type="button"
                    onClick={() => void revealWithConfirm()}
                    disabled={submitting}
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-bold bg-amber-100/80 text-amber-800 dark:bg-amber-900/35 dark:text-amber-200 disabled:opacity-40 transition-colors hover:bg-amber-100"
                    title={`Reveal the answer (${WORD_SCRAMBLE_HINT_PENALTY} pts)`}
                  >
                    💡 Reveal ({WORD_SCRAMBLE_HINT_PENALTY})
                  </button>
                </div>
              </>
            )}

            {/* Live standings */}
            <div className="space-y-2 pt-2">
              <p className="label-caps text-xs px-1">Live scores</p>
              {leaderboard.map((row, i) => (
                <div
                  key={row.player_id}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${row.player_id === myPlayerId ? 'bg-[var(--primary)]/10 font-semibold' : 'bg-white/60 dark:bg-slate-800/40'}`}
                >
                  <span className="truncate">
                    {i + 1}. {row.name}
                  </span>
                  <span className="tabular-nums text-muted">
                    {row.solved}/{metadata.count} · {row.points} pts
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
