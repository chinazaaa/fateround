'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { useGameScores, useGameStats } from '@/components/roster/RosterDrawerContext'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { PLAYER_SELECT, WORD_GROUPING_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import { formatMinutesSeconds } from '@/lib/timer-format'
import { useGameRosterPoll } from '@/hooks/useGameRosterPoll'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { allowLatePlayers, playerIsViewer, preJoinScreen } from '@/lib/viewers'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { useToast } from '@/components/ui/Toast'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { gameTypeConfig } from '@/lib/game-types'
import {
  WORD_GROUPING_MAX_MISTAKES,
  WORD_GROUPING_MISTAKE_PENALTY,
  WORD_GROUPING_TOTAL_GROUPS,
  tallyWordGroupingScores,
  wordGroupingFinishSeconds,
} from '@/lib/word-grouping'
import type { Game, Player } from '@/types'

/** How long the solved board stays up before the standings take over. */
const ANSWER_REVEAL_MS = 2800

const GROUP_COLORS: Record<number, string> = {
  1: '#f9df6d',
  2: '#a0c35a',
  3: '#b0c4ef',
  4: '#ba81c5',
}

interface Submission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  group_index: number
  difficulty: number
  guess_words: string[]
  is_correct: boolean
  mistakes_at_time: number
  submitted_at: string
}

interface RevealedGroup {
  category: string
  words: string[]
  difficulty: number
  groupIndex: number
}

interface SolutionGroup {
  category: string
  words: string[]
  difficulty: 1 | 2 | 3 | 4
}

type View = 'loading' | 'join' | 'late_join_choice' | 'waiting' | 'playing' | 'finished'
type WordGroupingGameState = { hasValidRound: boolean }

export function WordGroupingPlayerView({ gameCode }: { gameCode: string }) {
  const cfg = gameTypeConfig('word_grouping')
  const router = useRouter()
  const { error: toastError } = useToast()
  const [roundId, setRoundId] = useState<string | null>(null)
  const [words, setWords] = useState<string[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [shaking, setShaking] = useState(false)
  const [oneAway, setOneAway] = useState(false)
  const [revealedGroups, setRevealedGroups] = useState<RevealedGroup[]>([])
  const [solution, setSolution] = useState<SolutionGroup[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [nowMs, setNowMs] = useState<number>(Date.now())
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)

  const addSubmission = useCallback((row: Submission) => {
    setSubmissions((prev) => (prev.some((s) => s.id === row.id) ? prev : [...prev, row]))
  }, [])

  const loadGameState = useCallback(async (): Promise<{ state: WordGroupingGameState; ok: boolean }> => {
    return { state: { hasValidRound: false }, ok: true }
  }, [])

  const afterResolve = useCallback(
    async (gameData: Game, playerId: string | null): Promise<WordGroupingGameState> => {
      if (gameData.status === 'finished') {
        const { data: roundData } = await supabase
          .from('rounds')
          .select('id, word_grouping_metadata')
          .eq('game_id', gameCode)
          .eq('round_number', 1)
          .maybeSingle()
        if (roundData) {
          setRoundId(roundData.id)
          const meta = roundData.word_grouping_metadata as { words: string[] } | null
          if (meta?.words) setWords(meta.words)

          const { data: subs } = await supabase
            .from('word_grouping_submissions')
            .select(WORD_GROUPING_SUBMISSION_SELECT)
            .eq('round_id', roundData.id)
          if (subs) setSubmissions(subs as Submission[])

          const res = await fetch(`/api/word-grouping/solution?gameId=${gameCode}`)
          if (res.ok) {
            const { solution: sol } = await res.json()
            if (sol?.groups) {
              setSolution(sol.groups)
              setRevealedGroups(
                sol.groups.map((g: SolutionGroup, i: number) => ({
                  category: g.category,
                  words: g.words,
                  difficulty: g.difficulty,
                  groupIndex: i,
                }))
              )
            }
          }
        }
        return { hasValidRound: !!roundData }
      }

      if (gameData.status === 'active') {
        const { data: roundData } = await supabase
          .from('rounds')
          .select('id, word_grouping_metadata')
          .eq('game_id', gameCode)
          .eq('round_number', 1)
          .maybeSingle()
        if (roundData) {
          setRoundId(roundData.id)
          const meta = roundData.word_grouping_metadata as { words: string[] } | null
          if (meta?.words) setWords(meta.words)

          if (playerId) {
            const { data: subs } = await supabase
              .from('word_grouping_submissions')
              .select(WORD_GROUPING_SUBMISSION_SELECT)
              .eq('round_id', roundData.id)
            if (subs) {
              setSubmissions(subs as Submission[])
              const mySubs = (subs as Submission[]).filter((s) => s.player_id === playerId)
              const myCorrect = mySubs.filter((s) => s.is_correct)
              if (myCorrect.length > 0) {
                setRevealedGroups(
                  myCorrect.map((s) => ({
                    category: '',
                    words: s.guess_words as unknown as string[],
                    difficulty: s.difficulty,
                    groupIndex: s.group_index,
                  }))
                )
              }
            }
          }
        }
        return { hasValidRound: !!roundData }
      }

      return { hasValidRound: false }
    },
    [gameCode]
  )

  const computeScreen = useCallback((gameData: Game, playerId: string | null, _state: WordGroupingGameState): View => {
    if (gameData.status === 'finished') return 'finished'
    if (gameData.status === 'active') {
      if (!playerId) {
        const pre = preJoinScreen(gameData, false)
        if (pre === 'late_join_choice') return 'late_join_choice'
        return 'join'
      }
      return 'playing'
    }
    if (!playerId) return 'join'
    return 'waiting'
  }, [])

  const {
    screen,
    game,
    setGame,
    players,
    setPlayers,
    myPlayerId,
    myResumeToken,
    joinName,
    setJoinName,
    joining,
    join,
    load,
    lobbyFull,
  } = useGameViewBootstrap<View, WordGroupingGameState>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'loading',
    loadGameState,
    computeScreen,
    afterResolve,
    joinExtras,
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
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

  useGameRosterPoll(gameCode, game?.status, { setGame, setPlayers, reload: load })

  // Ready-up: without this the waiting lobby has nothing to click and everyone stays "not ready",
  // so the host can never start a fresh room OR a play-again reopen. Same shape the other puzzle
  // views use (crossword / word_search / word_scramble / sudoku).
  async function handleReady() {
    if (!myResumeToken) return
    await fetch('/api/players/ready', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
    })
    await load()
  }

  const rosterScores = useMemo(() => {
    const playersArr = players.map((p) => ({ id: p.id, name: p.name }))
    const tally = tallyWordGroupingScores(playersArr, submissions)
    const out: Record<string, number> = {}
    for (const t of tally) out[t.id] = t.points
    return out
  }, [players, submissions])

  const rosterDetails = useMemo(() => {
    const out: Record<string, string> = {}
    for (const p of players) {
      const mySubs = submissions.filter((s) => s.player_id === p.id)
      const groups = mySubs.filter((s) => s.is_correct).length
      const mistakes = mySubs.filter((s) => !s.is_correct).length
      const done = groups >= WORD_GROUPING_TOTAL_GROUPS || mistakes >= WORD_GROUPING_MAX_MISTAKES
      out[p.id] = done ? `${groups}/4 ✓` : `${groups}/4`
    }
    return out
  }, [players, submissions])

  useGameScores(rosterScores, { suffix: ' pts' })
  useGameStats(rosterDetails)

  useRegisterGameSettings(null)

  // Realtime: game status changes
  useEffect(() => {
    if (!game) return
    const channel = supabase
      .channel(`wg-game-${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        () => {
          load()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [game, gameCode, load])

  // Realtime: submissions
  useEffect(() => {
    if (!roundId || screen !== 'playing') return
    const channel = supabase
      .channel(`wg-subs-${roundId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'word_grouping_submissions',
          filter: `round_id=eq.${roundId}`,
        },
        (payload) => {
          addSubmission(payload.new as Submission)
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [roundId, screen, addSubmission])

  // Timer tick
  useEffect(() => {
    if (screen !== 'playing') return
    const interval = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [screen])

  // Derived state
  const mySubmissions = useMemo(
    () => (myPlayerId ? submissions.filter((s) => s.player_id === myPlayerId) : []),
    [myPlayerId, submissions]
  )
  const myMistakes = useMemo(() => mySubmissions.filter((s) => !s.is_correct).length, [mySubmissions])
  const myCorrectCount = useMemo(() => mySubmissions.filter((s) => s.is_correct).length, [mySubmissions])
  const isMyPuzzleDone = myCorrectCount >= WORD_GROUPING_TOTAL_GROUPS || myMistakes >= WORD_GROUPING_MAX_MISTAKES
  const revealedWords = useMemo(() => new Set(revealedGroups.flatMap((g) => g.words)), [revealedGroups])
  const remainingWords = useMemo(() => words.filter((w) => !revealedWords.has(w)), [words, revealedWords])
  const mistakesRemaining = WORD_GROUPING_MAX_MISTAKES - myMistakes

  const me = players.find((p) => p.id === myPlayerId)
  const isViewer = !!(me && game && playerIsViewer(me, game))

  const sessionElapsedSeconds = useMemo(() => {
    if (!game?.session_started_at) return 0
    return Math.floor((nowMs - new Date(game.session_started_at).getTime()) / 1000)
  }, [game?.session_started_at, nowMs])

  const timerSeconds = game?.game_duration_seconds ?? 0
  const timeRemaining = timerSeconds > 0 ? Math.max(0, timerSeconds - sessionElapsedSeconds) : null

  const expiredRef = useRef(false)
  useEffect(() => {
    if (timeRemaining !== null && timeRemaining <= 0 && screen === 'playing' && !expiredRef.current) {
      expiredRef.current = true
      fetch(`/api/games/${gameCode}/expire-word-grouping`, { method: 'POST' }).then(() => load())
    }
  }, [timeRemaining, screen, gameCode, load])

  // Hold the board for a beat when the game ends mid-play. Without this the standings
  // replace the grid the instant the last player finishes, so you never see the fourth
  // group land. Only applies to the play -> finished transition: opening an already-finished
  // game (or refreshing) goes straight to the results.
  const [revealingAnswers, setRevealingAnswers] = useState(false)
  const prevScreenRef = useRef<View | null>(null)
  useEffect(() => {
    const prev = prevScreenRef.current
    prevScreenRef.current = screen
    if (screen !== 'finished' || prev !== 'playing') return
    setRevealingAnswers(true)
    const t = setTimeout(() => setRevealingAnswers(false), ANSWER_REVEAL_MS)
    return () => clearTimeout(t)
  }, [screen])

  // Selection
  const toggleWord = (word: string) => {
    if (submitting || isMyPuzzleDone || isViewer) return
    setSelected((prev) => {
      if (prev.includes(word)) return prev.filter((w) => w !== word)
      if (prev.length >= 4) return prev
      return [...prev, word]
    })
  }

  // Submit guess
  const handleGuessSubmit = async () => {
    if (selected.length !== 4 || submitting || isMyPuzzleDone || !myResumeToken) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/word-grouping/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, words: selected }),
      })
      const data = await res.json().catch(() => ({}))
      // A failed write must not look like a wrong guess: without this, a rejected insert
      // shook the grid and recorded no mistake, so the puzzle became unloseable.
      if (!res.ok) {
        toastError(data.error || 'Could not submit that guess')
        return
      }
      if (data.isCorrect && data.group) {
        setRevealedGroups((prev) => [
          ...prev,
          {
            category: data.group.category,
            words: data.group.words,
            difficulty: data.group.difficulty,
            groupIndex: prev.length,
          },
        ])
        setSelected([])
      } else if (!data.isCorrect) {
        if (data.oneAway) {
          setOneAway(true)
          setTimeout(() => setOneAway(false), 1500)
        }
        setShaking(true)
        setTimeout(() => {
          setShaking(false)
          setSelected([])
        }, 500)
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Leaderboard for finished screen
  const leaderboardRows = useMemo(() => {
    const playersArr = players.map((p) => ({ id: p.id, name: p.name }))
    return tallyWordGroupingScores(playersArr, submissions)
  }, [players, submissions])

  const myRow = useMemo(
    () => (myPlayerId ? leaderboardRows.find((r) => r.id === myPlayerId) : undefined),
    [myPlayerId, leaderboardRows]
  )

  // ---------- render ----------

  if (screen === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="animate-pulse text-muted">Loading…</div>
      </div>
    )
  }

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    router.push('/create')
  }

  if (screen === 'join') {
    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        header={
          <GameJoinHeader
            emoji={cfg.headerEmoji}
            title={game?.title ?? 'Word Grouping'}
            gameType="word_grouping"
            subtitle="Find 4 groups of 4 words."
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
          gameType="word_grouping"
          submitLabel="Join game"
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="word_grouping" variant="subtle" />
            </p>
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'late_join_choice' && game) {
    return (
      <LateJoinChoice
        gameCode={gameCode}
        game={game}
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

  if (screen === 'waiting') {
    return (
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          capacityGame={game}
          onReady={handleReady}
          game={game}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={me?.name ?? ''}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title={game?.title ?? 'Word Grouping'}
          description="Waiting for the host to start the puzzle…"
          rulesLink={<GameRulesLink gameType="word_grouping" variant="subtle" />}
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'finished' && game && !revealingAnswers) {
    const leader = leaderboardRows[0]
    // Single winner only: I must be the top row outright, in a room with someone to beat,
    // and have actually scored — a 0-point finish is not a community leaderboard result.
    const iWon = !!myRow && leaderboardRows.length > 1 && leader != null && myRow === leader && leader.points > 0
    // Order matches the host finished screen and the other puzzle games (crossword,
    // word-search, word-scramble): standings first, answers below. Previously the answer
    // tiles rendered above Final Standings, so player and host disagreed on layout.
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <ShareResultsCaptureHeader game={game} />
        <h2 className="text-center text-xl font-bold mb-4">Game Over</h2>

        {myRow && (
          <div className="text-center">
            <p className="text-lg font-bold">{myRow.points} points</p>
            <p className="text-muted text-sm">
              {myRow.groups}/4 groups · {myRow.mistakes} mistake{myRow.mistakes !== 1 ? 's' : ''}
            </p>
          </div>
        )}

        <PaginatedLeaderboard
          title="Final Standings"
          rows={leaderboardRows.map((r, i) => {
            const secs = wordGroupingFinishSeconds(game?.session_started_at, r.lastAt)
            return {
              id: r.id,
              name: secs === null ? r.name : `${r.name} (⏱️ ${formatMinutesSeconds(secs)})`,
              score: r.points,
              rank: i + 1,
            }
          })}
          highlightId={myPlayerId ?? undefined}
          scoreLabel={(n) => `${n} pts`}
          emphasizeLeader
        />

        {iWon && (
          <PostWinToCommunity
            gameType="word_grouping"
            gameCode={gameCode}
            winnerName={leader?.name ?? ''}
            roundKey={game?.session_started_at ?? undefined}
          />
        )}

        {revealedGroups.length > 0 && (
          <div className="space-y-2">
            {revealedGroups
              .sort((a, b) => a.difficulty - b.difficulty)
              .map((group) => (
                <div
                  key={group.category || group.groupIndex}
                  className="rounded-xl px-4 py-3 text-center"
                  style={{ background: GROUP_COLORS[group.difficulty] ?? GROUP_COLORS[1], color: '#1a1a1a' }}
                >
                  <div className="font-bold uppercase tracking-wider text-sm">{group.category}</div>
                  <div className="mt-1 font-medium text-sm">{group.words.join(', ')}</div>
                </div>
              ))}
          </div>
        )}

        <div className="flex gap-2">
          {myPlayerId && <LeaveGameButton gameCode={gameCode} playerId={myPlayerId} onLeft={handlePlayerLeft} />}
        </div>
      </div>
    )
  }

  // ---------- playing ----------
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
      <style>{`
        @keyframes wg-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes wg-one-away {
          0% { opacity: 0; transform: translateY(-8px); }
          15% { opacity: 1; transform: translateY(0); }
          85% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-8px); }
        }
        .wg-shake { animation: wg-shake 0.4s ease-in-out; }
        .wg-one-away { animation: wg-one-away 1.5s ease-in-out forwards; }
      `}</style>

      {/* Mistakes · score · timer bar. Three-column grid so the score sits between the
          mistake dots and the countdown, mirroring the way the finished screen presents
          them and giving players a live view of what their guesses are worth. */}
      <div className="sticky top-[3.75rem] z-30 grid grid-cols-3 items-center rounded-xl border border-[var(--border-strong)] bg-[var(--card-strong)] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline font-bold text-xs uppercase tracking-wider text-muted">Mistakes</span>
          <div className="flex gap-1">
            {Array.from({ length: WORD_GROUPING_MAX_MISTAKES }).map((_, i) => (
              <span
                key={i}
                className={[
                  'inline-block h-2.5 w-2.5 rounded-full border',
                  i < mistakesRemaining
                    ? 'border-[var(--muted)] bg-[var(--muted)]'
                    : 'border-[var(--border-strong)] bg-transparent',
                ].join(' ')}
              />
            ))}
          </div>
        </div>
        <div className="text-center font-bold tabular-nums text-sm">{myRow?.points ?? 0} pts</div>
        <div
          className={`text-right font-bold tabular-nums text-sm ${timeRemaining !== null && timeRemaining <= 10 ? 'text-[var(--marry)]' : ''}`}
        >
          {timeRemaining !== null ? formatMinutesSeconds(timeRemaining) : '—'}
        </div>
      </div>

      {revealingAnswers ? (
        <p className="text-center text-sm font-bold">That&rsquo;s the puzzle — here are all four groups.</p>
      ) : (
        <p className="text-center text-xs text-faint">
          Find four groups of four. Wrong guess costs {Math.abs(WORD_GROUPING_MISTAKE_PENALTY)} pts.
        </p>
      )}

      {/* One away toast */}
      {oneAway && (
        <div className="wg-one-away rounded-lg border border-[var(--border-strong)] bg-[var(--card-strong)] px-4 py-2 text-center font-bold text-sm">
          One away!
        </div>
      )}

      {/* Solved groups */}
      {revealedGroups
        .sort((a, b) => a.difficulty - b.difficulty)
        .map((group) => (
          <div
            key={group.category || group.groupIndex}
            className="rounded-xl px-4 py-3 text-center"
            style={{ background: GROUP_COLORS[group.difficulty] ?? GROUP_COLORS[1], color: '#1a1a1a' }}
          >
            <div className="font-bold uppercase tracking-wider text-sm">{group.category}</div>
            <div className="mt-1 font-medium text-sm">{group.words.join(', ')}</div>
          </div>
        ))}

      {/* Word grid */}
      {!isMyPuzzleDone && remainingWords.length > 0 && (
        <div className={`grid grid-cols-4 gap-2 ${shaking ? 'wg-shake' : ''}`}>
          {remainingWords.map((word, i) => {
            const isSelected = selected.includes(word)
            return (
              <button
                // Index-suffixed: a bank puzzle should never repeat a word, but a bad
                // custom pack must not collapse two tiles into one React key.
                key={`${word}-${i}`}
                type="button"
                onClick={() => toggleWord(word)}
                disabled={isMyPuzzleDone || isViewer}
                className={[
                  'flex min-h-[3.5rem] items-center justify-center break-words rounded-lg border-2 px-1 py-3 text-sm font-bold uppercase transition-colors disabled:cursor-default',
                  isSelected
                    ? 'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_14%,var(--card-strong))]'
                    : 'border-[var(--border-strong)] bg-[var(--card-strong)] hover:border-[var(--muted)]',
                ].join(' ')}
              >
                {word}
              </button>
            )
          })}
        </div>
      )}

      {/* Action buttons */}
      {!isMyPuzzleDone && remainingWords.length > 0 && !isViewer && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSelected([])}
            disabled={selected.length === 0}
            className="btn-secondary flex-1 py-3 text-sm font-bold disabled:opacity-60"
          >
            Deselect all
          </button>
          <button
            type="button"
            onClick={handleGuessSubmit}
            disabled={selected.length !== 4 || submitting}
            className="btn-primary flex-1 py-3 text-sm font-bold disabled:opacity-60"
          >
            {submitting ? 'Checking…' : 'Submit'}
          </button>
        </div>
      )}

      {/* Done states */}
      {isMyPuzzleDone && screen === 'playing' && (
        <div className="py-8 text-center">
          <p className="font-bold text-lg">
            {myCorrectCount >= WORD_GROUPING_TOTAL_GROUPS ? 'Puzzle solved!' : 'Out of guesses'}
          </p>
          <p className="mt-1 text-muted text-sm">Waiting for other players…</p>
          <p className="mt-2 text-sm">
            {myCorrectCount}/4 groups · {myMistakes} mistake{myMistakes !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {me && myPlayerId && (
        <EditNameInline
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={me.name ?? ''}
          onRenamed={() => void load()}
          spectating={isViewer}
        />
      )}
    </div>
  )
}
