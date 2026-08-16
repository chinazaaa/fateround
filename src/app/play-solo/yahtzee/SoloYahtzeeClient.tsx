'use client'

/**
 * Solo Yahtzee vs Bot — client shell.
 *
 * Reuses `YahtzeeDiceRow` and `YahtzeeScorecard` from the multiplayer UI so
 * the board looks identical to a real room. Human plays first; on the bot's
 * turn an effect runs the bot's roll/hold/score cycle with short delays so
 * plays feel deliberate.
 *
 * State machine in `yahtzee-solo.ts` owns everything; sessionStorage keeps
 * the game across a page reload.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { YahtzeeDiceRow } from '@/components/yahtzee/YahtzeeDice'
import { YahtzeeScorecard } from '@/components/yahtzee/YahtzeeScorecard'
import {
  YAHTZEE_SOLO_BOT_ID,
  YAHTZEE_SOLO_HUMAN_ID,
  initYahtzeeSolo,
  rollYahtzeeSolo,
  scoreYahtzeeSolo,
  setYahtzeeSoloHold,
  yahtzeeSoloTotal,
  type YahtzeeSoloState,
} from '@/lib/yahtzee-solo'
import { pickYahtzeeBotCategory, pickYahtzeeBotHold } from '@/lib/yahtzee-bot'
import { logSoloPlayStarted } from '@/lib/solo-play'
import { readSoloScoreboard, recordSoloOutcome, resetSoloScoreboard, type SoloScoreboard } from '@/lib/solo-scoreboard'
import { SoloScoreboardRow } from '@/components/solo/SoloScoreboardRow'
import type { YahtzeeCategory, YahtzeePlayerScore } from '@/types'

const STORAGE_KEY = 'solo-yahtzee-state-v1'
const BOT_STEP_MS = 700

function loadPersistedState(): YahtzeeSoloState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as YahtzeeSoloState
    if (!parsed?.session?.turn_order || !Array.isArray(parsed.session.turn_order)) return null
    return parsed
  } catch {
    return null
  }
}

function persistState(state: YahtzeeSoloState): void {
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

/**
 * Map the solo record-of-cards into the array-of-YahtzeePlayerScore shape
 * YahtzeeScorecard expects. Bonus-Yahtzee count and joker flag are folded in
 * so the scorecard's totals reflect the same rules the state machine runs.
 */
function toYahtzeePlayerScores(state: YahtzeeSoloState, orderedIds: string[]): YahtzeePlayerScore[] {
  return orderedIds.map((id, i) => {
    const card = state.scores[id]!
    return {
      id: `solo-score-${i}`,
      game_id: 'solo',
      player_id: id,
      scores: {
        categories: card.categories,
        bonusYahtzees: card.bonusYahtzees,
        jokerUsed: card.jokerUsed,
      },
      player_order: i,
      created_at: state.session.created_at,
    }
  })
}

export function SoloYahtzeeClient() {
  const [state, setState] = useState<YahtzeeSoloState | null>(null)
  const [scoreboard, setScoreboard] = useState<SoloScoreboard>({ human: 0, bot: 0, draws: 0 })
  const stateRef = useRef<YahtzeeSoloState | null>(null)
  stateRef.current = state
  const scoredRef = useRef(false)
  const finishRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const persisted = loadPersistedState()
    setState(persisted ?? initYahtzeeSolo())
    setScoreboard(readSoloScoreboard('yahtzee'))
    if (persisted && persisted.outcome != null) scoredRef.current = true
    if (!persisted) logSoloPlayStarted('yahtzee')
  }, [])

  useEffect(() => {
    if (!state || state.outcome == null || scoredRef.current) return
    setScoreboard(recordSoloOutcome('yahtzee', state.outcome))
    scoredRef.current = true
  }, [state])

  useEffect(() => {
    if (state) persistState(state)
  }, [state])

  // Scroll the finish panel into view when the game ends — the scorecard is
  // tall enough that "You won 🎉" lands below the fold on both mobile and
  // desktop, and the game reads as frozen until the user scrolls.
  useEffect(() => {
    if (!state || state.outcome == null) return
    finishRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [state?.outcome])

  // Bot loop — walk through roll/hold/score one step at a time so each
  // decision is visible. Only runs when the bot holds the turn.
  useEffect(() => {
    if (!state || state.outcome != null) return
    const turnId = state.session.turn_order[state.session.current_turn_index]
    if (turnId !== YAHTZEE_SOLO_BOT_ID) return

    const t = setTimeout(() => {
      const now = stateRef.current
      if (!now) return
      const dice = now.session.dice
      const rolls_this_turn = now.session.rolls_this_turn
      const rolls_remaining = now.session.rolls_remaining
      const card = now.scores[YAHTZEE_SOLO_BOT_ID]!.categories

      // Start of turn — always roll first (no state to reason about yet).
      if (rolls_this_turn === 0) {
        const r = rollYahtzeeSolo(now, YAHTZEE_SOLO_BOT_ID)
        if (!r.error) setState(r.state)
        return
      }

      // No rolls left — must score.
      if (rolls_remaining === 0) {
        const cat = pickYahtzeeBotCategory(dice, card)
        const r = scoreYahtzeeSolo(now, YAHTZEE_SOLO_BOT_ID, cat)
        if (!r.error) setState(r.state)
        return
      }

      // Middle of turn — decide hold vs score.
      const action = pickYahtzeeBotHold(dice, rolls_remaining, card)
      if (action.kind === 'score') {
        const cat = pickYahtzeeBotCategory(dice, card)
        const r = scoreYahtzeeSolo(now, YAHTZEE_SOLO_BOT_ID, cat)
        if (!r.error) setState(r.state)
      } else {
        // Set the hold bits, then roll on the NEXT tick so the UI can render
        // the hold state before the dice re-roll.
        const held = setYahtzeeSoloHold(now, YAHTZEE_SOLO_BOT_ID, action.hold)
        if (held.error) return
        const rolled = rollYahtzeeSolo(held.state, YAHTZEE_SOLO_BOT_ID)
        if (!rolled.error) setState(rolled.state)
      }
    }, BOT_STEP_MS)
    return () => clearTimeout(t)
  }, [state])

  const humanRoll = useCallback(() => {
    const now = stateRef.current
    if (!now) return
    const r = rollYahtzeeSolo(now, YAHTZEE_SOLO_HUMAN_ID)
    if (!r.error) setState(r.state)
  }, [])

  const humanToggleHold = useCallback((index: number) => {
    const now = stateRef.current
    if (!now) return
    if (now.session.rolls_this_turn < 1) return
    const nextHeld = [...now.session.held]
    nextHeld[index] = !nextHeld[index]
    const r = setYahtzeeSoloHold(now, YAHTZEE_SOLO_HUMAN_ID, nextHeld)
    if (!r.error) setState(r.state)
  }, [])

  const humanScore = useCallback((category: YahtzeeCategory) => {
    const now = stateRef.current
    if (!now) return
    const r = scoreYahtzeeSolo(now, YAHTZEE_SOLO_HUMAN_ID, category)
    if (!r.error) setState(r.state)
  }, [])

  const restart = useCallback(() => {
    clearPersistedState()
    setState(initYahtzeeSolo())
    scoredRef.current = false
    logSoloPlayStarted('yahtzee')
  }, [])

  const resetScore = useCallback(() => {
    setScoreboard(resetSoloScoreboard('yahtzee'))
  }, [])

  const players = useMemo(
    () => [
      { id: YAHTZEE_SOLO_HUMAN_ID, name: 'You' },
      { id: YAHTZEE_SOLO_BOT_ID, name: 'Bot' },
    ],
    []
  )

  if (!state) {
    return (
      <div className="fr-room fr-room-phone">
        <div className="p-6 text-center text-muted text-sm">Setting up the game…</div>
      </div>
    )
  }

  const turnId = state.session.turn_order[state.session.current_turn_index]
  const isMyTurn = turnId === YAHTZEE_SOLO_HUMAN_ID && state.outcome == null
  const finished = state.outcome != null
  const humanWon = state.outcome === 'human'
  const draw = state.outcome === 'draw'
  const rolls_this_turn = state.session.rolls_this_turn
  const rolls_remaining = state.session.rolls_remaining
  const canRoll = isMyTurn && rolls_remaining > 0
  const canHold = isMyTurn && rolls_this_turn > 0 && rolls_remaining > 0

  const playerScores = toYahtzeePlayerScores(state, [YAHTZEE_SOLO_HUMAN_ID, YAHTZEE_SOLO_BOT_ID])

  return (
    <div className="fr-room fr-room-phone">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-body">Yahtzee — solo vs bot</h1>
          <p className="text-faint text-xs">Practice mode · no room, no account</p>
        </div>
        <button type="button" onClick={restart} className="btn-secondary text-xs">
          New game
        </button>
      </div>

      <div className="px-3 py-4 space-y-4">
        <div className="text-center text-sm text-muted">
          {state.session.status_message ?? (isMyTurn ? 'Your turn' : "Bot's turn")}
          {isMyTurn && rolls_remaining > 0 && (
            <span className="ml-2 text-xs text-faint">
              ({rolls_remaining} roll{rolls_remaining === 1 ? '' : 's'} left)
            </span>
          )}
        </div>

        <YahtzeeDiceRow
          dice={state.session.dice}
          held={state.session.held}
          onToggleHold={canHold ? humanToggleHold : undefined}
          interactive={canHold}
        />

        {isMyTurn && (
          <div className="flex justify-center">
            <button type="button" onClick={humanRoll} disabled={!canRoll} className="btn-primary disabled:opacity-50">
              {rolls_this_turn === 0 ? 'Roll dice' : `Roll again (${rolls_remaining} left)`}
            </button>
          </div>
        )}

        <YahtzeeScorecard
          players={players}
          scores={playerScores}
          myPlayerId={YAHTZEE_SOLO_HUMAN_ID}
          activePlayerId={turnId ?? null}
          dice={state.session.dice}
          scoringEnabled={isMyTurn && rolls_this_turn > 0}
          onScore={isMyTurn && rolls_this_turn > 0 ? humanScore : undefined}
        />

        <div className="flex justify-around text-xs text-muted">
          <div>
            You: <strong className="text-body">{yahtzeeSoloTotal(state, YAHTZEE_SOLO_HUMAN_ID)}</strong>
          </div>
          <div>
            Bot: <strong className="text-body">{yahtzeeSoloTotal(state, YAHTZEE_SOLO_BOT_ID)}</strong>
          </div>
        </div>
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
            <Link href="/create?type=yahtzee" className="btn-secondary text-center">
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
