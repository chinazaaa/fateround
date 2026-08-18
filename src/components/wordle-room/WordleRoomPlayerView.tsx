'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { WordleRoomBoard, type WordleRoomGradedGuess } from '@/components/wordle-room/WordleRoomBoard'
import { WordleRoomResults } from '@/components/wordle-room/WordleRoomResults'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { gameTypeConfig } from '@/lib/game-types'
import {
  tallyWordleRoomScores,
  validateWordleRoomGuess,
  WORDLE_ROOM_MIN_PLAYERS,
  wordleRoomWordScore,
  type WordleRoomProgressRow,
  type WordleRoomStandingRow,
} from '@/lib/wordle-room'
import { useWordleRoomGameTimer } from '@/hooks/useWordleRoomGameTimer'
import { useGameRosterPoll } from '@/hooks/useGameRosterPoll'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameScores, useGameStats, useRosterBase } from '@/components/roster/RosterDrawerContext'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { PLAYER_SELECT } from '@/lib/supabase-selects'
import { allowLatePlayers, playerIsViewer, preJoinScreen } from '@/lib/viewers'
import { clearPlayerSession } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { Game } from '@/types'

interface WordleRoomStatus {
  currentWord?: string
  wordLength?: number
  maxAttempts?: number
  word_index?: number
  word_count?: number
  words_solved?: number
  total_guesses?: number
  categoryLabel?: string
  finished?: boolean
  sequenceComplete?: boolean
  status?: string
  guesses?: { guess: string; state: ('correct' | 'present' | 'absent')[] }[]
  hintAvailable?: boolean
  hintUsed?: boolean
  hint?: string | null
}

type Screen =
  | 'loading'
  | 'not_found'
  | 'join'
  | 'game_started_waiting'
  | 'late_join_choice'
  | 'game_ended'
  | 'waiting'
  | 'playing'
  | 'finished'

export function WordleRoomPlayerView({ gameCode }: { gameCode: string }) {
  const { error: toastError } = useToast()
  const { confirm } = useConfirm()
  const cfg = gameTypeConfig('wordle_room')
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)

  const [roundId, setRoundId] = useState<string | null>(null)
  const [currentWord, setCurrentWord] = useState<string | null>(null)
  const [wordLength, setWordLength] = useState(5)
  const [maxAttempts, setMaxAttempts] = useState(6)
  const [wordIndex, setWordIndex] = useState(0)
  const [wordCount, setWordCount] = useState(5)
  const [wordsSolved, setWordsSolved] = useState(0)
  const [totalGuesses, setTotalGuesses] = useState(0)
  const [categoryLabel, setCategoryLabel] = useState('General English')
  const [myFinished, setMyFinished] = useState(false)
  const [hintAvailable, setHintAvailable] = useState(false)
  const [hintUsed, setHintUsed] = useState(false)
  const [hintText, setHintText] = useState<string | null>(null)
  const [guesses, setGuesses] = useState<WordleRoomGradedGuess[]>([])
  const [current, setCurrent] = useState('')
  // Tile-level cursor — click a filled tile in the current row to jump the cursor there and
  // overwrite that letter, instead of backspacing letters just to change one in the middle.
  const [cursorAt, setCursorAt] = useState(0)
  const [revealWord, setRevealWord] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [progressRows, setProgressRows] = useState<WordleRoomProgressRow[]>([])
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const submitLockRef = useRef(false)
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Absolute deadline (ms since epoch) after which the scheduled advance should have
  // fired. Realtime subscriptions consult this to skip fetchStatus while the reveal
  // ("Correct!" / "the word was …") should still be visible.
  const advanceDeadlineRef = useRef<number>(0)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    return { state: null, ok: true }
  }, [])

  const computeScreen = useCallback((gameData: Game, playerId: string | null): Screen => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'game_ended') return 'game_ended'
      if (pre === 'late_join_choice') return 'late_join_choice'
      return 'join'
    }
    if (gameData.status === 'waiting') return 'waiting'
    if (gameData.status === 'finished') return 'finished'
    return 'playing'
  }, [])

  const {
    screen,
    game,
    setGame,
    players,
    setPlayers,
    myPlayerId,
    setMyPlayerId,
    myResumeToken,
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

  // Server truth for the current word + my progress on it. Also returns my graded guesses
  // for the current word, so a refresh or second device restores the tiles.
  const fetchStatus = useCallback(async () => {
    if (!myResumeToken) return
    const res = await fetch('/api/wordle-room/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
    })
    if (!res.ok) return
    const data = (await res.json()) as WordleRoomStatus
    // Only lock the board on an unambiguous per-player completion signal — `finished:true`
    // alone can also mean "game not active yet" or "solutions row missing", neither of
    // which is a real completion. sequenceComplete is only true when progress.finished is.
    if (data.sequenceComplete === true) setMyFinished(true)
    if (data.currentWord) {
      setCurrentWord(data.currentWord)
      setWordLength(data.wordLength ?? data.currentWord.length)
      setMaxAttempts(data.maxAttempts ?? data.currentWord.length + 1)
      setWordIndex(data.word_index ?? 0)
      setWordCount(data.word_count ?? 5)
      setWordsSolved(data.words_solved ?? 0)
      setTotalGuesses(data.total_guesses ?? 0)
      setCategoryLabel(data.categoryLabel ?? 'General English')
      setMyFinished(data.sequenceComplete === true)
      setHintAvailable(data.hintAvailable === true)
      setHintUsed(data.hintUsed === true)
      setHintText(data.hint ?? null)
      setGuesses((data.guesses ?? []).map((g) => ({ word: g.guess, states: g.state })))
      setCurrent('')
      setCursorAt(0)
      setRevealWord('')
      // Clear the previous word's transient banner ("Out of attempts — the word was X",
      // "Correct! +N pts") so it doesn't linger into the next word.
      setMessage(null)
    }
    // Deliberately DO NOT wipe currentWord/guesses when the server returns finished:true
    // without a currentWord: the server uses that shape in several non-completion cases
    // (game not yet active, solutions row missing, transient races) and blanking state
    // there hides the grid + hint button for a still-playing user. Real completion locks
    // input via myFinished → boardDisabled below.
    if (data.status === 'finished') void load()
  }, [gameCode, myResumeToken, load])

  const revealHint = useCallback(async () => {
    if (!myResumeToken || myFinished) return
    if (!hintAvailable || hintUsed) return
    const ok = await confirm({
      title: 'Reveal hint?',
      message: 'This costs 300 points off this word’s score. Are you sure?',
      confirmLabel: 'Reveal (−300)',
    })
    if (!ok) return
    try {
      const res = await fetch('/api/wordle-room/reveal-hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, wordIndex }),
      })
      const data = (await res.json().catch(() => ({}))) as { hint?: string; error?: string }
      if (!res.ok) {
        showToast(data.error ?? 'Could not reveal hint', false)
        return
      }
      setHintUsed(true)
      setHintText(data.hint ?? null)
    } catch {
      showToast('Network error', false)
    }
  }, [confirm, gameCode, myResumeToken, myFinished, hintAvailable, hintUsed, wordIndex])

  // Advance to the next word after the solve/loss reveal settles.
  const scheduleAdvance = useCallback(
    (delayMs: number) => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
      advanceDeadlineRef.current = Date.now() + delayMs
      advanceTimerRef.current = setTimeout(() => {
        advanceDeadlineRef.current = 0
        void fetchStatus()
      }, delayMs)
    },
    [fetchStatus]
  )

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    }
  }, [])

  // Resolve the round id so progress standings can be filtered by it.
  const loadRoundId = useCallback(async () => {
    const { data } = await supabase
      .from('rounds')
      .select('id')
      .eq('game_id', gameCode)
      .eq('round_number', 1)
      .maybeSingle()
    if (data) setRoundId(data.id as string)
  }, [gameCode])

  const loadProgress = useCallback(async () => {
    if (!roundId) return
    const { data } = await supabase
      .from('wordle_room_progress')
      .select('*')
      .eq('game_id', gameCode)
      .eq('round_id', roundId)
    if (data) setProgressRows(data as WordleRoomProgressRow[])
  }, [gameCode, roundId])

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)

  useTurnNotifications({ status: game?.status })

  const { label: timeLabel, timeUp, secondsLeft } = useWordleRoomGameTimer(gameCode, game, () => void load())

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting' || screen === 'late_join_choice') void load()
  })

  const me = players.find((p) => p.id === myPlayerId)
  const isViewer = !!(game && me && playerIsViewer(me, game))
  const router = useRouter()

  // Fetch the current word once the player is resolved and the room is live (or finished).
  useEffect(() => {
    if (!myResumeToken) return
    if (game?.status !== 'active' && game?.status !== 'finished') return
    void fetchStatus()
  }, [myResumeToken, game?.status, fetchStatus])

  useEffect(() => {
    if (game?.status !== 'active' && game?.status !== 'finished') return
    void loadRoundId()
  }, [game?.status, loadRoundId])

  useEffect(() => {
    if (!roundId) return
    void loadProgress()
  }, [roundId, loadProgress])

  // Realtime standings: progress rows + players both refresh live. My own row's update
  // re-syncs the current word (handles a second device or a missed transition).
  useEffect(() => {
    const ch = supabase
      .channel(`wordle_room_progress_${gameCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wordle_room_progress', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          void loadProgress()
          const row = payload.new as Partial<WordleRoomProgressRow>
          if (row && row.player_id === myPlayerId && game?.status === 'active') {
            // Defer the status refetch until any pending reveal delay has elapsed,
            // otherwise a completed guess's own progress row update would race the
            // scheduled advance and blow away the "the word was …" banner early.
            const now = Date.now()
            if (advanceDeadlineRef.current > now) {
              const wait = advanceDeadlineRef.current - now
              window.setTimeout(() => {
                if (advanceDeadlineRef.current <= Date.now()) void fetchStatus()
              }, wait + 10)
            } else {
              void fetchStatus()
            }
          }
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode, loadProgress, fetchStatus, myPlayerId, game?.status])

  useEffect(() => {
    const ch = supabase
      .channel(`wordle_room_game_${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          setGame(payload.new as Game)
          void load()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode, load, setGame])

  useEffect(() => {
    const ch = supabase
      .channel(`wordle_room_players_${gameCode}`)
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
              if (data) setPlayers(data)
            })
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [gameCode, setPlayers])

  useGameRosterPoll(gameCode, game?.status, { setGame, setPlayers, reload: () => void load() })

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
    secondsLeft
  )
  const { context: viewerPromoteContext } = useLateJoinContext(
    gameCode,
    game,
    isViewer && screen === 'playing',
    secondsLeft
  )

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    void load()
  }

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

  // Both handlers derive the next (current, cursorAt) pair from the live snapshot and apply
  // the two setters side-by-side, so nothing inside a setState updater has a side effect —
  // React can safely replay the updaters. Key events fire one at a time, so reading state
  // directly (not from an updater arg) can't miss a batched second keystroke.
  const addLetter = useCallback(
    (key: string) => {
      const ch = key.toLowerCase()
      if (!/^[a-z]$/.test(ch)) return
      setMessage(null)
      if (cursorAt < current.length) {
        setCurrent(current.slice(0, cursorAt) + ch + current.slice(cursorAt + 1))
        setCursorAt(Math.min(cursorAt + 1, wordLength))
      } else if (current.length < wordLength) {
        setCurrent(current + ch)
        setCursorAt(current.length + 1)
      }
    },
    [current, cursorAt, wordLength]
  )

  const backspace = useCallback(() => {
    setMessage(null)
    if (cursorAt > 0 && cursorAt <= current.length) {
      setCurrent(current.slice(0, cursorAt - 1) + current.slice(cursorAt))
      setCursorAt(cursorAt - 1)
    }
  }, [current, cursorAt])

  const focusTile = useCallback(
    (i: number) => {
      if (i < 0 || i > current.length || i >= wordLength) return
      setCursorAt(i)
    },
    [current.length, wordLength]
  )

  const submitGuess = useCallback(() => {
    if (!currentWord || !myResumeToken || timeUp || isViewer || myFinished) return
    if (submitLockRef.current) return
    if (current.length < wordLength) {
      setMessage('Not enough letters')
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }

    const validation = validateWordleRoomGuess(current, currentWord)
    if (!validation.ok) {
      setMessage(validation.error)
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }

    const guessWord = validation.normalized
    const localRow: WordleRoomGradedGuess = { word: guessWord, states: validation.states }
    const solved = localRow.states.every((s) => s === 'correct')
    const guessNumber = guesses.length + 1

    setGuesses((g) => [...g, localRow])
    setCurrent('')
    setCursorAt(0)
    setMessage(null)
    submitLockRef.current = true

    void fetch('/api/wordle-room/guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, word: guessWord }),
    })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) {
          setGuesses((g) => g.filter((row) => row !== localRow))
          showToast(json.error ?? 'Invalid guess', false)
          return
        }

        const wordDone = json.wordIndex !== wordIndex || json.finished === true
        if (wordDone) {
          if (solved) {
            setMessage(`Correct! +${json.pointsAwarded ?? wordleRoomWordScore(guessNumber, maxAttempts, true)} pts`)
          } else {
            setRevealWord(currentWord)
            setMessage(`Out of attempts — the word was ${currentWord.toUpperCase()}`)
          }
          // Reveal delay then pull the next word from the server. The out-of-attempts
          // reveal ("the word was …") gets a longer beat so players can actually read it.
          scheduleAdvance(solved ? 1500 : 5000)
        } else {
          setMessage('Nope — try again')
        }
      })
      .catch(() => {
        setGuesses((g) => g.filter((row) => row !== localRow))
        showToast('Could not submit guess — try again', false)
      })
      .finally(() => {
        submitLockRef.current = false
      })
  }, [
    currentWord,
    myResumeToken,
    timeUp,
    isViewer,
    myFinished,
    current,
    wordLength,
    guesses,
    wordIndex,
    maxAttempts,
    gameCode,
    scheduleAdvance,
  ])

  const standings: WordleRoomStandingRow[] = useMemo(
    () => tallyWordleRoomScores(progressRows, players),
    [progressRows, players]
  )

  const myStanding = standings.find((s) => s.player_id === myPlayerId)

  useRosterBase(game?.status === 'active' || game?.status === 'finished' ? players : undefined, game, myPlayerId)
  const rosterScores = useMemo(
    () => Object.fromEntries(standings.map((r) => [r.player_id, r.words_solved])),
    [standings]
  )
  useGameScores(rosterScores, { suffix: ' solved' })
  const rosterDetails = useMemo(
    () =>
      Object.fromEntries(
        standings.map((r) => [
          r.player_id,
          r.finished ? `🏁 ${r.words_solved}/${wordCount}` : `Word ${r.word_index + 1}/${wordCount}`,
        ])
      ),
    [standings, wordCount]
  )
  useGameStats(rosterDetails)

  const displayName = me?.name || 'Player'

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  if (screen === 'not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-muted text-center">Game not found.</p>
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

    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        header={
          <GameJoinHeader
            emoji={cfg.headerEmoji}
            title={game?.title ?? cfg.label}
            gameType="wordle_room"
            subtitle={cfg.tagline}
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
          gameType="wordle_room"
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="wordle_room" variant="subtle" />
            </p>
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => void load()} />
  }

  if (screen === 'late_join_choice' && game) {
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

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'waiting') {
    if (game?.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={WORDLE_ROOM_MIN_PLAYERS}
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
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          capacityGame={game}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={displayName}
          onRenamed={() => {
            void load()
          }}
          onLeft={handlePlayerLeft}
          title="Waiting for host to start"
          description="Race to solve the same words before time runs out."
          rulesLink={<GameRulesLink gameType="wordle_room" variant="subtle" />}
          isSpectator={isViewer}
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

  if (screen === 'finished' && game) {
    const iWon =
      !!myStanding &&
      standings.length > 1 &&
      standings[0] != null &&
      myStanding === standings[0] &&
      standings[0].words_solved > 0
    return (
      <div className="min-h-screen flex flex-col">
        <main className="pt-16 flex-1 px-4 py-8 max-w-lg mx-auto w-full space-y-4">
          <WordleRoomResults
            game={game}
            players={players}
            standings={standings}
            highlightPlayerId={myPlayerId}
            showCreateNewGame
          />
          {iWon && (
            <PostWinToCommunity
              gameType="wordle_room"
              gameCode={gameCode}
              winnerName={myStanding?.name ?? ''}
              roundKey={game?.session_started_at ?? undefined}
            />
          )}
        </main>
      </div>
    )
  }

  const boardDisabled = timeUp || isViewer || myFinished

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      {toast && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-semibold shadow-lg ${toast.ok ? 'bg-[var(--primary)] text-white' : 'bg-[var(--kill)] text-white'}`}
        >
          {toast.msg}
        </div>
      )}
      <main className="pt-16 flex-1 px-3 py-4 max-w-lg mx-auto w-full space-y-4 overscroll-none">
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

        <div className="flex items-center justify-between gap-3">
          <span className="wl-cat-badge inline-block" style={{ background: 'var(--wl-correct)', color: '#fff' }}>
            {categoryLabel}
          </span>
          <span className="text-sm font-semibold text-muted">
            Word {Math.min(wordIndex + 1, wordCount)}/{wordCount}
          </span>
          {timeUp ? (
            <span className="text-sm font-bold text-[var(--kill)]">Time's up</span>
          ) : game && (game.timer_seconds ?? 0) > 0 ? (
            <span className={`text-sm font-bold tabular-nums ${secondsLeft <= 10 ? 'text-[var(--marry)]' : ''}`}>
              {timeLabel}
            </span>
          ) : (
            <span className="text-sm font-semibold text-muted">Untimed</span>
          )}
        </div>

        {/* Colours are hardcoded (not `var(--wl-…)`) because the board's <style> block that
            defines those vars only mounts when currentWord is set — the legend needs to
            render even before the first fetchStatus lands. */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#6aaa64' }} />
            right letter, right spot
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#c9b458' }} />
            in the word, wrong spot
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#787c7e' }} />
            not in the word
          </span>
        </div>

        {currentWord && (
          <WordleRoomBoard
            word={currentWord}
            guesses={guesses}
            current={current}
            cursorAt={cursorAt}
            onFocusTile={focusTile}
            revealWord={revealWord}
            maxAttempts={maxAttempts}
            disabled={boardDisabled}
            message={message}
            shake={shake}
            onAddLetter={addLetter}
            onBackspace={backspace}
            onSubmit={submitGuess}
          />
        )}

        {/* Per-word hint purchase — only surfaces when the current word actually has a hint. */}
        {currentWord &&
          !myFinished &&
          hintAvailable &&
          (hintUsed && hintText ? (
            <p className="text-center text-sm text-muted">
              Hint: {hintText} <span className="text-faint">(−300 pts)</span>
            </p>
          ) : !hintUsed ? (
            <div className="text-center">
              <button
                type="button"
                onClick={() => void revealHint()}
                disabled={boardDisabled}
                className="fr-btn fr-btn--secondary fr-btn--sm"
              >
                Reveal hint (−300 pts)
              </button>
            </div>
          ) : null)}

        <div className="glass-card p-3 space-y-2">
          <p className="label-caps text-xs">Race standings</p>
          {standings.length === 0 ? (
            <p className="text-xs text-muted">Waiting for the room to get going…</p>
          ) : (
            standings.map((row, i) => {
              const isMe = row.player_id === myPlayerId
              return (
                <div key={row.player_id} className="flex items-center justify-between text-sm">
                  <span className={`font-medium truncate ${isMe ? 'text-[var(--primary)]' : ''}`}>
                    {i + 1}. {row.name}
                    {isMe ? ' (you)' : ''}
                  </span>
                  <span className="font-bold tabular-nums text-muted">
                    {row.total_points} pts · {row.words_solved} solved
                    {row.hints_used_count > 0
                      ? ` · ${row.hints_used_count} hint${row.hints_used_count > 1 ? 's' : ''}`
                      : ''}
                    {' · '}
                    {row.finished ? 'Done' : `word ${row.word_index + 1}`}
                  </span>
                </div>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-muted px-1">
          <span>
            Solved: <strong className="text-body">{wordsSolved}</strong>/{wordCount} · Guesses:{' '}
            <strong className="text-body">{totalGuesses}</strong>
          </span>
        </div>

        {myFinished && (
          <div className="glass-card p-3 text-center space-y-1">
            <p className="font-semibold text-[var(--primary)]">You finished — waiting on others!</p>
            <p className="text-xs text-muted">
              {(() => {
                const rank = standings.findIndex((s) => s.player_id === myPlayerId) + 1
                const suffix = rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'
                const ms = myStanding?.total_time_ms ?? null
                const timeText =
                  ms != null
                    ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`
                    : '—'
                return (
                  <>
                    {rank > 0 ? (
                      <>
                        <strong className="text-body">
                          {rank}
                          {suffix}
                        </strong>{' '}
                        so far ·{' '}
                      </>
                    ) : null}
                    <strong className="text-body">{myStanding?.total_points ?? 0}</strong> pts · time{' '}
                    <strong className="text-body">{timeText}</strong>
                  </>
                )
              })()}
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
