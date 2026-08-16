'use client'

/**
 * Solo UNO vs Bot — client shell.
 *
 * Same shape as the Whot / Crazy Eights solo clients:
 *  - state is null until mount so SSR/hydration match
 *  - stateRef mirrors state for the setTimeout closures
 *  - bot fires from an effect after ~900ms so plays feel deliberate
 *  - sessionStorage keeps the game across a page reload
 *
 * The UnoPlaySurface component takes many callbacks (Jump-In, WD4 challenge,
 * UNO-call, Swap) that solo does not implement. Those props are wired to
 * no-op stubs so the presentational component stays untouched — the
 * corresponding UI affordances never render in solo (jumpInEnabled=false, and
 * the phase never enters challenge/swap). Multi-Play IS supported: solo runs
 * `same_color_or_number` mode via `unoSoloPlayMulti`.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { UnoPlaySurface } from '@/components/uno/UnoPlaySurface'
import {
  UNO_SOLO_BOT_ID,
  UNO_SOLO_HUMAN_ID,
  UNO_SOLO_MULTI_PLAY_MODE,
  initUnoSolo,
  isPlayable,
  unoSoloChooseColor,
  unoSoloDraw,
  unoSoloPlay,
  unoSoloPlayMulti,
  type UnoSoloState,
} from '@/lib/uno-solo'
import { pickBotAction, type UnoBotDifficulty } from '@/lib/uno-bot'
import { isDrawPileDepleted } from '@/lib/uno'
import { logSoloPlayStarted } from '@/lib/solo-play'
import { readSoloScoreboard, recordSoloOutcome, resetSoloScoreboard, type SoloScoreboard } from '@/lib/solo-scoreboard'
import { SoloScoreboardRow } from '@/components/solo/SoloScoreboardRow'

const STORAGE_KEY = 'solo-uno-state-v1'
const DIFFICULTY_KEY = 'solo-uno-difficulty-v1'
const BOT_THINK_MS = 900

function loadPersistedState(): UnoSoloState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as UnoSoloState
    if (!parsed?.session?.turn_order || !Array.isArray(parsed.hands)) return null
    return parsed
  } catch {
    return null
  }
}

function persistState(state: UnoSoloState): void {
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

function loadDifficulty(): UnoBotDifficulty {
  if (typeof window === 'undefined') return 'normal'
  const raw = window.localStorage.getItem(DIFFICULTY_KEY)
  return raw === 'easy' || raw === 'hard' ? raw : 'normal'
}

const NOOP = () => {}

export function SoloUnoClient() {
  const [state, setState] = useState<UnoSoloState | null>(null)
  const [difficulty, setDifficulty] = useState<UnoBotDifficulty>('normal')
  const [scoreboard, setScoreboard] = useState<SoloScoreboard>({ human: 0, bot: 0, draws: 0 })
  const stateRef = useRef<UnoSoloState | null>(null)
  stateRef.current = state
  // Dedupe scoring: only bump the tally once per game. On rehydrate of an
  // already-finished game we assume it was scored last time.
  const scoredRef = useRef(false)
  const finishRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const persisted = loadPersistedState()
    const d = loadDifficulty()
    setDifficulty(d)
    setState(persisted ?? initUnoSolo())
    setScoreboard(readSoloScoreboard('uno'))
    if (persisted && persisted.outcome != null) scoredRef.current = true
    // Only log on fresh init (not mid-game reloads) so counts aren't inflated.
    if (!persisted) logSoloPlayStarted('uno', d)
  }, [])

  useEffect(() => {
    if (!state || state.outcome == null || scoredRef.current) return
    const outcome: 'human' | 'bot' | 'draw' = state.outcome === 0 ? 'human' : state.outcome === 'draw' ? 'draw' : 'bot'
    setScoreboard(recordSoloOutcome('uno', outcome))
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

  const setDifficultyStored = useCallback((d: UnoBotDifficulty) => {
    setDifficulty(d)
    try {
      window.localStorage.setItem(DIFFICULTY_KEY, d)
    } catch {
      /* noop */
    }
  }, [])

  useEffect(() => {
    if (!state || state.outcome != null) return
    const botIdx = state.session.turn_order.indexOf(UNO_SOLO_BOT_ID)
    if (botIdx < 0) return
    if (state.session.current_turn_index !== botIdx) return

    const t = setTimeout(() => {
      const now = stateRef.current
      if (!now) return
      const action = pickBotAction(now, difficulty)
      if (!action) return
      const idx = now.session.current_turn_index as 0 | 1
      let next: { state: UnoSoloState; error?: string }
      if (action.type === 'play') next = unoSoloPlay(now, idx, action.cardId, Math.random)
      else if (action.type === 'draw') next = unoSoloDraw(now, idx, Math.random)
      else next = unoSoloChooseColor(now, idx, action.color)
      if (!next.error) setState(next.state)
    }, BOT_THINK_MS)
    return () => clearTimeout(t)
  }, [state, difficulty])

  const humanPlay = useCallback((cardId: string) => {
    const now = stateRef.current
    if (!now) return
    const r = unoSoloPlay(now, 0, cardId, Math.random)
    if (!r.error) setState(r.state)
  }, [])

  const humanDraw = useCallback(() => {
    const now = stateRef.current
    if (!now) return
    const r = unoSoloDraw(now, 0, Math.random)
    if (!r.error) setState(r.state)
  }, [])

  const humanChooseColor = useCallback((color: Parameters<typeof unoSoloChooseColor>[2]) => {
    const now = stateRef.current
    if (!now) return
    const r = unoSoloChooseColor(now, 0, color)
    if (!r.error) setState(r.state)
  }, [])

  const humanPlayMulti = useCallback((cardIds: string[]) => {
    const now = stateRef.current
    if (!now) return
    const r = unoSoloPlayMulti(now, 0, cardIds, Math.random)
    if (!r.error) setState(r.state)
  }, [])

  const restart = useCallback(() => {
    clearPersistedState()
    setState(initUnoSolo())
    scoredRef.current = false
    logSoloPlayStarted('uno', difficulty)
  }, [difficulty])

  const resetScore = useCallback(() => {
    setScoreboard(resetSoloScoreboard('uno'))
  }, [])

  const players = useMemo(
    () => [
      { id: UNO_SOLO_HUMAN_ID, name: 'You', spectator: false },
      { id: UNO_SOLO_BOT_ID, name: `Bot (${difficulty})`, spectator: false },
    ],
    [difficulty]
  )
  const handCounts = useMemo(
    () =>
      state
        ? { [UNO_SOLO_HUMAN_ID]: state.hands[0].length, [UNO_SOLO_BOT_ID]: state.hands[1].length }
        : { [UNO_SOLO_HUMAN_ID]: 0, [UNO_SOLO_BOT_ID]: 0 },
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
  const isMyTurn = turnPlayerId === UNO_SOLO_HUMAN_ID && state.outcome == null
  const myHand = state.hands[0]
  const myCanPlay = myHand.some((card) => isPlayable(state, card))
  const drawCount = (state.session.draw_pile as unknown[]).length
  const drawDepleted = isDrawPileDepleted(state.session)
  const drawPenalty = state.session.draw_penalty ?? 0

  const finished = state.outcome != null
  const humanWon = state.outcome === 0
  const draw = state.outcome === 'draw'

  return (
    <div className="fr-room fr-room-phone">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-body">Match Up — solo vs bot</h1>
          <p className="text-faint text-xs">Practice mode · classic rules · no room, no account</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="text-muted">
            Difficulty
            <select
              className="input-field ml-2 py-1 text-xs"
              value={difficulty}
              onChange={(e) => setDifficultyStored(e.target.value as UnoBotDifficulty)}
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

      <UnoPlaySurface
        session={state.session}
        players={players}
        myPlayerId={UNO_SOLO_HUMAN_ID}
        myHand={myHand}
        handCounts={handCounts}
        turnPlayerId={turnPlayerId}
        isMyTurn={isMyTurn}
        acting={false}
        drawCount={drawCount}
        drawDepleted={drawDepleted}
        myCanPlay={myCanPlay}
        drawPenalty={drawPenalty}
        onPlay={humanPlay}
        onDraw={humanDraw}
        onChooseColor={humanChooseColor}
        // The remaining callbacks + flags belong to rules solo does not
        // implement (WD4 challenge, UNO-call penalty, 0-7 swap, Jump-In).
        // They stay wired as no-ops so the presentational component's prop
        // contract is satisfied; the corresponding UI never renders because
        // the phase never enters those branches and jumpInEnabled=false
        // suppresses the affordances.
        onChallenge={NOOP}
        onCallUno={NOOP}
        onSwap={NOOP}
        onPass={NOOP}
        multiPlayMode={UNO_SOLO_MULTI_PLAY_MODE}
        onPlayMulti={humanPlayMulti}
        jumpInEnabled={false}
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
            <Link href="/create?type=uno" className="btn-secondary text-center">
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
