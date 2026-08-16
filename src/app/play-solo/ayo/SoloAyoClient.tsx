'use client'

/**
 * Solo Ayo vs Bot — client shell.
 *
 * Same state model as the solo Whot client:
 *  - the pure engine in `ayo-solo.ts` owns everything
 *  - `state` is `null` until mount to keep SSR/hydration in sync
 *  - after every human move that hands the turn to the bot, an effect fires
 *    the bot's move on a short timeout so plays feel deliberate
 *  - sessionStorage keeps the game across a page reload
 *
 * Nothing here touches Supabase, realtime, or the games table.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AyoGamePanel } from '@/components/ayo/AyoBoard'
import { AYO_SOLO_BOT_ID, AYO_SOLO_HUMAN_ID, initAyoSolo, ayoSoloMove, type AyoSoloState } from '@/lib/ayo-solo'
import { pickAyoBotMove, type AyoBotDifficulty } from '@/lib/ayo-bot'
import { logSoloPlayStarted } from '@/lib/solo-play'
import { readSoloScoreboard, recordSoloOutcome, resetSoloScoreboard, type SoloScoreboard } from '@/lib/solo-scoreboard'
import { SoloScoreboardRow } from '@/components/solo/SoloScoreboardRow'
import type { Player } from '@/types'

const STORAGE_KEY = 'solo-ayo-state-v1'
const DIFFICULTY_KEY = 'solo-ayo-difficulty-v1'
const BOT_THINK_MS = 700

function loadPersistedState(): AyoSoloState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AyoSoloState
    if (!parsed?.session?.pits || !Array.isArray(parsed.session.pits)) return null
    return parsed
  } catch {
    return null
  }
}

function persistState(state: AyoSoloState): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* noop */
  }
}

function clearPersistedState(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* noop */
  }
}

function loadDifficulty(): AyoBotDifficulty {
  if (typeof window === 'undefined') return 'normal'
  const raw = window.localStorage.getItem(DIFFICULTY_KEY)
  return raw === 'easy' || raw === 'hard' ? raw : 'normal'
}

export function SoloAyoClient() {
  // Deferred init: state is null on the SSR + first-render passes so both
  // sides render the same "Setting up…" markup and hydration matches. The
  // real deck is dealt in useEffect after mount.
  const [state, setState] = useState<AyoSoloState | null>(null)
  const [difficulty, setDifficulty] = useState<AyoBotDifficulty>('normal')
  const [scoreboard, setScoreboard] = useState<SoloScoreboard>({ human: 0, bot: 0, draws: 0 })
  const stateRef = useRef<AyoSoloState | null>(null)
  stateRef.current = state
  const scoredRef = useRef(false)
  const finishRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const persisted = loadPersistedState()
    const d = loadDifficulty()
    setDifficulty(d)
    setState(persisted ?? initAyoSolo())
    setScoreboard(readSoloScoreboard('ayo'))
    if (persisted && persisted.outcome != null) scoredRef.current = true
    // Only log on fresh init (not mid-game reloads) so counts aren't inflated.
    if (!persisted) logSoloPlayStarted('ayo', d)
  }, [])

  useEffect(() => {
    if (!state || state.outcome == null || scoredRef.current) return
    const outcome: 'human' | 'bot' | 'draw' =
      state.outcome === 'a' ? 'human' : state.outcome === 'draw' ? 'draw' : 'bot'
    setScoreboard(recordSoloOutcome('ayo', outcome))
    scoredRef.current = true
  }, [state])

  useEffect(() => {
    if (state) persistState(state)
  }, [state])

  // Scroll the finish panel into view on game end so "You won 🎉" isn't
  // stranded below the fold and the game doesn't read as frozen.
  useEffect(() => {
    if (!state || state.outcome == null) return
    finishRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [state?.outcome])

  const setDifficultyStored = useCallback((d: AyoBotDifficulty) => {
    setDifficulty(d)
    try {
      window.localStorage.setItem(DIFFICULTY_KEY, d)
    } catch {
      /* noop */
    }
  }, [])

  // Bot loop: whenever it's the bot's turn, pick and apply a move after a
  // short delay so the play unfolds visibly instead of instantly.
  useEffect(() => {
    if (!state || state.outcome != null) return
    if (state.session.current_turn !== 'b') return

    const t = setTimeout(() => {
      const now = stateRef.current
      if (!now) return
      const pit = pickAyoBotMove(now, difficulty)
      if (pit == null) return
      const next = ayoSoloMove(now, 'b', pit)
      if (!next.error) setState(next.state)
    }, BOT_THINK_MS)
    return () => clearTimeout(t)
  }, [state, difficulty])

  const humanMove = useCallback((pit: number) => {
    const now = stateRef.current
    if (!now) return
    const r = ayoSoloMove(now, 'a', pit)
    if (!r.error) setState(r.state)
  }, [])

  const restart = useCallback(() => {
    clearPersistedState()
    setState(initAyoSolo())
    scoredRef.current = false
    logSoloPlayStarted('ayo', difficulty)
  }, [difficulty])

  const resetScore = useCallback(() => {
    setScoreboard(resetSoloScoreboard('ayo'))
  }, [])

  // Player objects shaped for AyoGamePanel.
  const players = useMemo<Player[]>(
    () =>
      [
        { id: AYO_SOLO_HUMAN_ID, name: 'You' },
        { id: AYO_SOLO_BOT_ID, name: `Bot (${difficulty})` },
      ] as Player[],
    [difficulty]
  )

  if (!state) {
    return (
      <div className="fr-room fr-room-phone">
        <div className="p-6 text-center text-muted text-sm">Setting up the board…</div>
      </div>
    )
  }

  const isMyTurn = state.session.current_turn === 'a' && state.outcome == null
  const finished = state.outcome != null
  const humanWon = state.outcome === 'a'
  const draw = state.outcome === 'draw'

  return (
    <div className="fr-room fr-room-phone">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-body">Ayo — solo vs bot</h1>
          <p className="text-faint text-xs">Practice mode · no room, no account</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="text-muted">
            Difficulty
            <select
              className="input-field ml-2 py-1 text-xs"
              value={difficulty}
              onChange={(e) => setDifficultyStored(e.target.value as AyoBotDifficulty)}
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
        <AyoGamePanel
          session={state.session}
          players={players}
          myPlayerId={AYO_SOLO_HUMAN_ID}
          isMyTurn={isMyTurn}
          variant={state.variant}
          onMove={isMyTurn ? humanMove : undefined}
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
            <Link href="/create?type=ayo" className="btn-secondary text-center">
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
