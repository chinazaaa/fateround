'use client'

/**
 * Solo Crazy Eights vs Bot — client shell.
 *
 * Mirrors SoloWhotClient's state model exactly:
 *  - deferred init (null until mount) so SSR/hydration match
 *  - stateRef mirrors state for the setTimeout closures
 *  - bot's turn fires from a useEffect after a short delay so plays feel deliberate
 *  - sessionStorage keeps the game across a page reload
 *
 * Nothing here touches Supabase, realtime, or the games table.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CrazyEightsPlaySurface } from '@/components/crazy-eights/CrazyEightsPlaySurface'
import {
  CRAZY8_SOLO_BOT_ID,
  CRAZY8_SOLO_HUMAN_ID,
  crazy8SoloChooseSuit,
  crazy8SoloDraw,
  crazy8SoloPlay,
  initCrazy8Solo,
  type Crazy8SoloState,
} from '@/lib/crazy-eights-solo'
import { pickBotAction, type Crazy8BotDifficulty } from '@/lib/crazy-eights-bot'
import { getNormalizedPenalties, hasPlayableCard, isDrawPileDepleted, parseCrazyEightsRules } from '@/lib/crazy-eights'

const STORAGE_KEY = 'solo-crazy8-state-v1'
const DIFFICULTY_KEY = 'solo-crazy8-difficulty-v1'
const BOT_THINK_MS = 900

// Rules mirror the "classic" preset a lobby would create when the host toggles
// nothing: action cards on, jokers on (harder + more interesting bot), Pick 2
// stackable. Kept as a constant so a rehydrated state uses the same rules the
// fresh state started with.
const SOLO_RULES = parseCrazyEightsRules({
  crazy8_action_cards: true,
  crazy8_jokers: true,
  crazy8_pick2_stacking: true,
} as unknown as Parameters<typeof parseCrazyEightsRules>[0])

function loadPersistedState(): Crazy8SoloState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Crazy8SoloState
    if (!parsed?.session?.turn_order || !Array.isArray(parsed.hands)) return null
    return { ...parsed, rules: SOLO_RULES }
  } catch {
    return null
  }
}

function persistState(state: Crazy8SoloState): void {
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

function loadDifficulty(): Crazy8BotDifficulty {
  if (typeof window === 'undefined') return 'normal'
  const raw = window.localStorage.getItem(DIFFICULTY_KEY)
  return raw === 'easy' ? 'easy' : 'normal'
}

export function SoloCrazyEightsClient() {
  const [state, setState] = useState<Crazy8SoloState | null>(null)
  const [difficulty, setDifficulty] = useState<Crazy8BotDifficulty>('normal')
  const stateRef = useRef<Crazy8SoloState | null>(null)
  stateRef.current = state

  useEffect(() => {
    const persisted = loadPersistedState()
    const d = loadDifficulty()
    setDifficulty(d)
    setState(persisted ?? initCrazy8Solo({ rules: SOLO_RULES }))
  }, [])

  useEffect(() => {
    if (state) persistState(state)
  }, [state])

  const setDifficultyStored = useCallback((d: Crazy8BotDifficulty) => {
    setDifficulty(d)
    try {
      window.localStorage.setItem(DIFFICULTY_KEY, d)
    } catch {
      /* noop */
    }
  }, [])

  useEffect(() => {
    if (!state || state.outcome != null) return
    const botIdx = state.session.turn_order.indexOf(CRAZY8_SOLO_BOT_ID)
    if (botIdx < 0) return
    if (state.session.current_turn_index !== botIdx) return

    const t = setTimeout(() => {
      const now = stateRef.current
      if (!now) return
      const action = pickBotAction(now, difficulty)
      if (!action) return
      const idx = now.session.current_turn_index as 0 | 1
      let next: { state: Crazy8SoloState; error?: string }
      if (action.type === 'play') next = crazy8SoloPlay(now, idx, action.cardId, Math.random)
      else if (action.type === 'draw') next = crazy8SoloDraw(now, idx, Math.random)
      else next = crazy8SoloChooseSuit(now, idx, action.suit)
      if (!next.error) setState(next.state)
    }, BOT_THINK_MS)
    return () => clearTimeout(t)
  }, [state, difficulty])

  const humanPlay = useCallback((cardId: string) => {
    const now = stateRef.current
    if (!now) return
    const r = crazy8SoloPlay(now, 0, cardId, Math.random)
    if (!r.error) setState(r.state)
  }, [])

  const humanDraw = useCallback(() => {
    const now = stateRef.current
    if (!now) return
    const r = crazy8SoloDraw(now, 0, Math.random)
    if (!r.error) setState(r.state)
  }, [])

  const humanChooseSuit = useCallback((suit: Parameters<typeof crazy8SoloChooseSuit>[2]) => {
    const now = stateRef.current
    if (!now) return
    const r = crazy8SoloChooseSuit(now, 0, suit)
    if (!r.error) setState(r.state)
  }, [])

  const restart = useCallback(() => {
    clearPersistedState()
    setState(initCrazy8Solo({ rules: SOLO_RULES }))
  }, [])

  const players = useMemo(
    () => [
      { id: CRAZY8_SOLO_HUMAN_ID, name: 'You', spectator: false },
      { id: CRAZY8_SOLO_BOT_ID, name: `Bot (${difficulty})`, spectator: false },
    ],
    [difficulty]
  )
  const handCounts = useMemo(
    () =>
      state
        ? { [CRAZY8_SOLO_HUMAN_ID]: state.hands[0].length, [CRAZY8_SOLO_BOT_ID]: state.hands[1].length }
        : { [CRAZY8_SOLO_HUMAN_ID]: 0, [CRAZY8_SOLO_BOT_ID]: 0 },
    [state]
  )

  if (!state) {
    return (
      <div className="fr-room fr-room-phone">
        <div className="p-6 text-center text-muted text-sm">Dealing…</div>
      </div>
    )
  }

  const turnPlayerId = state.session.turn_order[state.session.current_turn_index] ?? null
  const isMyTurn = turnPlayerId === CRAZY8_SOLO_HUMAN_ID && state.outcome == null
  const myHand = state.hands[0]
  const myCanPlay = hasPlayableCard(myHand, state.session, state.rules)
  const suitCallActive = state.session.required_suit != null
  const penalties = getNormalizedPenalties(state.session)
  const drawCount = (state.session.draw_pile as unknown[]).length
  const drawDepleted = isDrawPileDepleted(state.session)

  const finished = state.outcome != null
  const humanWon = state.outcome === 0
  const draw = state.outcome === 'draw'

  return (
    <div className="fr-room fr-room-phone">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-body">Crazy Eights — solo vs bot</h1>
          <p className="text-faint text-xs">Practice mode · no room, no account</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="text-muted">
            Difficulty
            <select
              className="input-field ml-2 py-1 text-xs"
              value={difficulty}
              onChange={(e) => setDifficultyStored(e.target.value as Crazy8BotDifficulty)}
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

      <CrazyEightsPlaySurface
        session={state.session}
        players={players}
        myPlayerId={CRAZY8_SOLO_HUMAN_ID}
        myHand={myHand}
        handCounts={handCounts}
        rules={state.rules}
        turnPlayerId={turnPlayerId}
        isMyTurn={isMyTurn}
        acting={false}
        drawCount={drawCount}
        drawDepleted={drawDepleted}
        myCanPlay={myCanPlay}
        suitCallActive={suitCallActive}
        penalties={penalties}
        onPlay={humanPlay}
        onDraw={humanDraw}
        onChooseSuit={humanChooseSuit}
      />

      {finished && (
        <div className="mx-3 my-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-inset-bg)] p-5 text-center">
          <p className="text-lg font-black text-body">
            {humanWon ? 'You won ' : draw ? "It's a draw" : 'Bot wins'}
            {humanWon && <span aria-hidden> 🎉</span>}
          </p>
          <p className="text-muted mt-1 text-sm">Practice mode — no ranking, just for fun.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button type="button" onClick={restart} className="btn-primary">
              Play again
            </button>
            <Link href="/create?type=crazy_eights" className="btn-secondary text-center">
              Start a real room
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
