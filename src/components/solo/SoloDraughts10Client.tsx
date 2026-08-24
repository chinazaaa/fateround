'use client'

/**
 * Solo International / Nigerian Draughts vs Bot — shared client shell.
 *
 * Same pattern as SoloCheckersClient, but backed by the 10×10 flying-king
 * engine in `draughts10.ts`. One component serves both variants; the
 * `variant` prop only picks which board style Draughts10GamePanel renders
 * and which sessionStorage key is used.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Draughts10GamePanel } from '@/components/draughts10/Draughts10Board'
import {
  DRAUGHTS10_SOLO_BOT_ID,
  DRAUGHTS10_SOLO_HUMAN_ID,
  botColor,
  draughts10SoloMove,
  humanColor,
  initDraughts10Solo,
  isBotTurn,
  isHumanTurn,
  type Draughts10SoloState,
} from '@/lib/draughts10-solo'
import { pickDraughts10BotMove, type Draughts10BotDifficulty } from '@/lib/draughts10-bot'
import { logSoloPlayFinished, logSoloPlayStarted, resetSoloSessionId, soloSessionId } from '@/lib/solo-play'
import {
  readSoloScoreboard,
  recordSoloOutcome,
  resetSoloScoreboard,
  type SoloScoreboard,
  type SoloScoreboardKey,
} from '@/lib/solo-scoreboard'
import { SoloScoreboardRow } from '@/components/solo/SoloScoreboardRow'
import type { Draughts10Variant, GameType, Player } from '@/types'

type SoloDraughts10ClientProps = {
  variant: Draughts10Variant
  gameType: Extract<GameType, 'checkers_international' | 'checkers_nigeria'>
  scoreboardKey: Extract<SoloScoreboardKey, 'checkers_international' | 'checkers_nigeria'>
  storageKey: string
  difficultyKey: string
  title: string
  createHref: string
}

const BOT_THINK_MS = 700

function loadPersisted(storageKey: string): Draughts10SoloState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Draughts10SoloState
    if (!parsed?.session?.board || typeof parsed.session.board !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

function persist(storageKey: string, state: Draughts10SoloState): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(state))
  } catch {
    /* noop */
  }
}

function clearPersisted(storageKey: string): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(storageKey)
  } catch {
    /* noop */
  }
}

function loadDifficulty(difficultyKey: string): Draughts10BotDifficulty {
  if (typeof window === 'undefined') return 'normal'
  try {
    const raw = window.localStorage.getItem(difficultyKey)
    return raw === 'easy' || raw === 'hard' ? raw : 'normal'
  } catch {
    return 'normal'
  }
}

export function SoloDraughts10Client(props: SoloDraughts10ClientProps) {
  const { variant, gameType, scoreboardKey, storageKey, difficultyKey, title, createHref } = props
  const [state, setState] = useState<Draughts10SoloState | null>(null)
  const [difficulty, setDifficulty] = useState<Draughts10BotDifficulty>('normal')
  const [scoreboard, setScoreboard] = useState<SoloScoreboard>({ human: 0, bot: 0, draws: 0 })
  const stateRef = useRef<Draughts10SoloState | null>(null)
  stateRef.current = state
  const scoredRef = useRef(false)
  const finishRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const persisted = loadPersisted(storageKey)
    const d = loadDifficulty(difficultyKey)
    setDifficulty(d)
    setState(persisted ?? initDraughts10Solo({ variant }))
    setScoreboard(readSoloScoreboard(scoreboardKey))
    if (persisted && persisted.outcome != null) scoredRef.current = true
    if (!persisted) logSoloPlayStarted(gameType, d)
  }, [variant, storageKey, difficultyKey, scoreboardKey, gameType])

  useEffect(() => {
    if (!state || state.outcome == null || scoredRef.current) return
    const outcome = state.outcome === 'human' ? 'human' : state.outcome === 'draw' ? 'draw' : 'bot'
    setScoreboard(recordSoloOutcome(scoreboardKey, outcome))
    logSoloPlayFinished({
      gameType,
      outcome,
      sessionId: soloSessionId(gameType),
      difficulty,
    })
    scoredRef.current = true
  }, [state, difficulty, gameType, scoreboardKey])

  useEffect(() => {
    if (state) persist(storageKey, state)
  }, [state, storageKey])

  useEffect(() => {
    if (!state || state.outcome == null) return
    finishRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [state?.outcome])

  const setDifficultyStored = useCallback(
    (d: Draughts10BotDifficulty) => {
      setDifficulty(d)
      try {
        window.localStorage.setItem(difficultyKey, d)
      } catch {
        /* noop */
      }
    },
    [difficultyKey]
  )

  useEffect(() => {
    if (!state || state.outcome != null) return
    if (!isBotTurn(state)) return
    const t = setTimeout(() => {
      const now = stateRef.current
      if (!now || !isBotTurn(now)) return
      const step = pickDraughts10BotMove(now, difficulty)
      if (!step) return
      const r = draughts10SoloMove(now, botColor(now), step.from, step.to)
      if (!r.error) setState(r.state)
    }, BOT_THINK_MS)
    return () => clearTimeout(t)
  }, [state, difficulty])

  const onMove = useCallback((from: string, to: string) => {
    const now = stateRef.current
    if (!now) return
    if (!isHumanTurn(now)) return
    const r = draughts10SoloMove(now, humanColor(now), from, to)
    if (!r.error) setState(r.state)
  }, [])

  const onResign = useCallback(() => {
    const now = stateRef.current
    if (!now || now.outcome != null) return
    setState({
      ...now,
      outcome: 'bot',
      session: {
        ...now.session,
        status: 'finished',
        result_reason: 'resignation',
        winner_player_id: DRAUGHTS10_SOLO_BOT_ID,
        is_draw: false,
        status_message: 'You resigned — Bot wins!',
        turn_deadline_at: null,
      },
    })
  }, [])

  const restart = useCallback(() => {
    clearPersisted(storageKey)
    setState(initDraughts10Solo({ variant }))
    scoredRef.current = false
    resetSoloSessionId(gameType)
    logSoloPlayStarted(gameType, difficulty)
  }, [variant, storageKey, gameType, difficulty])

  const resetScore = useCallback(() => {
    setScoreboard(resetSoloScoreboard(scoreboardKey))
  }, [scoreboardKey])

  const players = useMemo<Player[]>(
    () =>
      [
        { id: DRAUGHTS10_SOLO_HUMAN_ID, name: 'You' },
        { id: DRAUGHTS10_SOLO_BOT_ID, name: `Bot (${difficulty})` },
      ] as unknown as Player[],
    [difficulty]
  )

  if (!state) {
    return (
      <div className="fr-room fr-room-phone">
        <div className="p-6 text-center text-muted text-sm">Setting up the board…</div>
      </div>
    )
  }

  const finished = state.outcome != null
  const humanWon = state.outcome === 'human'
  const draw = state.outcome === 'draw'
  const myTurn = isHumanTurn(state)

  return (
    <div className="fr-room fr-room-phone">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-body">{title}</h1>
          <p className="text-faint text-xs">Practice mode · no room, no account</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="text-muted">
            Difficulty
            <select
              className="input-field ml-2 py-1 text-xs"
              value={difficulty}
              onChange={(e) => setDifficultyStored(e.target.value as Draughts10BotDifficulty)}
            >
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <button type="button" onClick={restart} className="btn-secondary text-xs">
            New game
          </button>
        </div>
      </div>

      <div className="px-3 py-4">
        <Draughts10GamePanel
          session={state.session}
          players={players}
          myPlayerId={DRAUGHTS10_SOLO_HUMAN_ID}
          isMyTurn={myTurn}
          onMove={myTurn ? onMove : undefined}
          onResign={!finished ? onResign : undefined}
        />
      </div>

      {finished && (
        <div
          ref={finishRef}
          className="mx-3 my-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-inset-bg)] p-5 text-center"
        >
          <p className="text-lg font-black text-body">
            {humanWon ? 'You won ' : draw ? "It's a draw" : 'Bot wins'}
            {humanWon && <span aria-hidden> 🎉</span>}
          </p>
          <p className="text-muted mt-1 text-sm">Practice mode — no ranking, just for fun.</p>
          <SoloScoreboardRow scoreboard={scoreboard} onReset={resetScore} />
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button type="button" onClick={restart} className="btn-primary">
              Play again
            </button>
            <Link href={createHref} className="btn-secondary text-center">
              Start a real room
            </Link>
            <Link href="/play-solo" className="btn-secondary text-center">
              Play other solo games
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
