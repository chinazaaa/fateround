'use client'

/**
 * Solo Whot vs Bot — client shell.
 *
 * State model:
 *  - The pure engine in `whot-solo.ts` owns everything. This component holds one
 *    `SoloWhotState` in a ref (for identity across microtask boundaries) mirrored
 *    to `useState` (for renders).
 *  - After every human move that hands the turn to the bot, an effect fires the
 *    bot's action on a short timeout so the human sees the play unfold instead
 *    of a same-tick jump cut.
 *  - sessionStorage carries state across a page reload so a mid-game refresh
 *    doesn't lose the position. Cleared when a new game starts.
 *
 * Nothing here touches Supabase, realtime, or the games table.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WhotPlaySurface } from '@/components/whot/WhotPlaySurface'
import { SoloScoreboardRow } from '@/components/solo/SoloScoreboardRow'
import {
  SOLO_BOT_ID,
  SOLO_HUMAN_ID,
  initSoloWhot,
  soloChooseNumber,
  soloChooseShape,
  soloDraw,
  soloPlay,
  type SoloWhotState,
} from '@/lib/whot-solo'
import { pickBotAction, type WhotBotDifficulty } from '@/lib/whot-bot'
import { getActivePickPenalty, hasPlayableCard, isDrawPileDepleted, parseWhotRules } from '@/lib/whot'
import { logSoloPlayStarted } from '@/lib/solo-play'
import { readSoloScoreboard, recordSoloOutcome, resetSoloScoreboard, type SoloScoreboard } from '@/lib/solo-scoreboard'

const STORAGE_KEY = 'solo-whot-state-v1'
const DIFFICULTY_KEY = 'solo-whot-difficulty-v1'
const BOT_THINK_MS = 900

// The default rules bundle for solo — matches the "classic" preset a lobby
// creates when the host toggles nothing. Kept as a constant so a rehydrated
// state uses the same rules the fresh state started with.
const SOLO_RULES = parseWhotRules({
  whot_pick3_enabled: true,
  whot_cards_enabled: true,
  // Real rooms default this on (parseWhotRules treats missing as true). Solo
  // was forcing it false, so playing a 20 only ever offered the shape picker
  // — never the number picker.
  whot_number_calls_enabled: true,
  whot_pick2_stacking: true,
})

function loadPersistedState(): SoloWhotState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SoloWhotState
    // Sanity: session is roughly shaped right. A corrupt entry just resets.
    if (!parsed?.session?.turn_order || !Array.isArray(parsed.hands)) return null
    return { ...parsed, rules: SOLO_RULES }
  } catch {
    return null
  }
}

function persistState(state: SoloWhotState): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full / disabled — solo just loses reload survival, which is fine.
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

function loadDifficulty(): WhotBotDifficulty {
  if (typeof window === 'undefined') return 'normal'
  const raw = window.localStorage.getItem(DIFFICULTY_KEY)
  return raw === 'easy' ? 'easy' : 'normal'
}

export function SoloWhotClient() {
  // `null` while we haven't yet decided whether to rehydrate or deal a fresh
  // game. This defers ALL randomness (deck shuffle + first-player pick) until
  // after mount, so the SSR pass and the client hydration pass render the same
  // (loading) markup — no hydration mismatch. See React docs on suppressing
  // hydration for client-only state.
  const [state, setState] = useState<SoloWhotState | null>(null)
  const [difficulty, setDifficulty] = useState<WhotBotDifficulty>('normal')
  const [scoreboard, setScoreboard] = useState<SoloScoreboard>({ human: 0, bot: 0, draws: 0 })
  const stateRef = useRef<SoloWhotState | null>(null)
  stateRef.current = state
  // True once this game's outcome has been counted toward the scoreboard.
  // Reset to false on restart. On rehydrate of an already-finished game we
  // assume it was scored last time (better to miss one edge-case count than
  // double-count on every reload of a finished game).
  const scoredRef = useRef(false)
  const finishRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const persisted = loadPersistedState()
    const d = loadDifficulty()
    setDifficulty(d)
    setState(persisted ?? initSoloWhot({ rules: SOLO_RULES }))
    setScoreboard(readSoloScoreboard('whot'))
    if (persisted && persisted.outcome != null) scoredRef.current = true
    // Only log when we're starting a fresh game (not on a mid-game reload) so
    // adoption counts aren't inflated by rehydrates.
    if (!persisted) logSoloPlayStarted('whot', d)
  }, [])

  // Score the game when it transitions to finished. scoredRef dedupes so a
  // re-render or a bot follow-up move can't double-count the same outcome.
  useEffect(() => {
    if (!state || state.outcome == null || scoredRef.current) return
    const outcome: 'human' | 'bot' | 'draw' = state.outcome === 0 ? 'human' : state.outcome === 'draw' ? 'draw' : 'bot'
    setScoreboard(recordSoloOutcome('whot', outcome))
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

  const setDifficultyStored = useCallback((d: WhotBotDifficulty) => {
    setDifficulty(d)
    try {
      window.localStorage.setItem(DIFFICULTY_KEY, d)
    } catch {
      /* noop */
    }
  }, [])

  // Bot loop: whenever it's the bot's turn (or bot is mid-WHOT-choose) fire an
  // action after a short delay so the human sees it happen instead of instantly.
  useEffect(() => {
    if (!state || state.outcome != null) return
    const botIdx = state.session.turn_order.indexOf(SOLO_BOT_ID)
    if (botIdx < 0) return
    if (state.session.current_turn_index !== botIdx) return

    const t = setTimeout(() => {
      const now = stateRef.current
      if (!now) return
      const action = pickBotAction(now, difficulty)
      if (!action) return
      const idx = now.session.current_turn_index as 0 | 1
      let next: { state: SoloWhotState; error?: string }
      if (action.type === 'play') next = soloPlay(now, idx, action.cardId, Math.random)
      else if (action.type === 'draw') next = soloDraw(now, idx, Math.random)
      else if (action.type === 'choose_shape') next = soloChooseShape(now, idx, action.shape)
      else next = soloChooseNumber(now, idx, action.n)
      if (!next.error) setState(next.state)
    }, BOT_THINK_MS)
    return () => clearTimeout(t)
  }, [state, difficulty])

  const humanPlay = useCallback((cardId: string) => {
    const now = stateRef.current
    if (!now) return
    const r = soloPlay(now, 0, cardId, Math.random)
    if (!r.error) setState(r.state)
  }, [])

  const humanDraw = useCallback(() => {
    const now = stateRef.current
    if (!now) return
    const r = soloDraw(now, 0, Math.random)
    if (!r.error) setState(r.state)
  }, [])

  const humanChooseShape = useCallback((shape: Parameters<typeof soloChooseShape>[2]) => {
    const now = stateRef.current
    if (!now) return
    const r = soloChooseShape(now, 0, shape)
    if (!r.error) setState(r.state)
  }, [])

  const humanChooseNumber = useCallback((n: number) => {
    const now = stateRef.current
    if (!now) return
    const r = soloChooseNumber(now, 0, n)
    if (!r.error) setState(r.state)
  }, [])

  const restart = useCallback(() => {
    clearPersistedState()
    setState(initSoloWhot({ rules: SOLO_RULES }))
    scoredRef.current = false
    logSoloPlayStarted('whot', difficulty)
  }, [difficulty])

  const resetScore = useCallback(() => {
    setScoreboard(resetSoloScoreboard('whot'))
  }, [])

  // ── Adapters into WhotPlaySurface's expected shape ─────────────────────────
  const players = useMemo(
    () => [
      { id: SOLO_HUMAN_ID, name: 'You', spectator: false },
      { id: SOLO_BOT_ID, name: `Bot (${difficulty})`, spectator: false },
    ],
    [difficulty]
  )
  const handCounts = useMemo(
    () =>
      state
        ? { [SOLO_HUMAN_ID]: state.hands[0].length, [SOLO_BOT_ID]: state.hands[1].length }
        : { [SOLO_HUMAN_ID]: 0, [SOLO_BOT_ID]: 0 },
    [state]
  )

  // Render a stable placeholder until `state` is set on the client. This is the
  // markup React sees during SSR too, so hydration matches — deck randomness
  // never crosses the SSR / client boundary.
  if (!state) {
    return (
      <div className="fr-room fr-room-phone">
        <div className="p-6 text-center text-muted text-sm">Dealing…</div>
      </div>
    )
  }

  const turnPlayerId = state.session.turn_order[state.session.current_turn_index] ?? null
  const isMyTurn = turnPlayerId === SOLO_HUMAN_ID && state.outcome == null
  const myHand = state.hands[0]
  const myCanPlay = hasPlayableCard(myHand, state.session, state.rules)
  const whotCallActive = state.session.required_shape != null || state.session.required_number != null
  const pickPenalty = getActivePickPenalty(state.session)
  const drawCount = (state.session.draw_pile as unknown[]).length
  const drawDepleted = isDrawPileDepleted(state.session)

  const finished = state.outcome != null
  const humanWon = state.outcome === 0
  const draw = state.outcome === 'draw'

  return (
    <div className="fr-room fr-room-phone">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-body">Whot — solo vs bot</h1>
          <p className="text-faint text-xs">Practice mode · no room, no account</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="text-muted">
            Difficulty
            <select
              className="input-field ml-2 py-1 text-xs"
              value={difficulty}
              onChange={(e) => setDifficultyStored(e.target.value as WhotBotDifficulty)}
            >
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
            </select>
          </label>
          <button type="button" onClick={restart} className="btn-secondary text-xs">
            New game
          </button>
        </div>
      </div>

      <WhotPlaySurface
        session={state.session}
        players={players}
        myPlayerId={SOLO_HUMAN_ID}
        myHand={myHand}
        handCounts={handCounts}
        rules={state.rules}
        turnPlayerId={turnPlayerId}
        isMyTurn={isMyTurn}
        acting={false}
        drawCount={drawCount}
        drawDepleted={drawDepleted}
        myCanPlay={myCanPlay}
        whotCallActive={whotCallActive}
        pickPenalty={pickPenalty}
        onPlay={humanPlay}
        onDraw={humanDraw}
        onChooseShape={humanChooseShape}
        onChooseNumber={humanChooseNumber}
        hideHand={finished}
      />

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
            <Link href="/create?type=whot" className="btn-secondary text-center">
              Start a real room
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
