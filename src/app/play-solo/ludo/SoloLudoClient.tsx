'use client'

/**
 * Solo Ludo vs Bot — client shell.
 *
 * Same state model as the solo Ayo/Whot clients:
 *  - the pure engine in `ludo-solo.ts` owns everything
 *  - `state` is null until mount to keep SSR/hydration aligned
 *  - after every human action that hands the turn to the bot, an effect
 *    fires the bot's roll (and any follow-up moves) on short timeouts so
 *    plays feel deliberate
 *  - sessionStorage keeps the game across a page reload
 *
 * Nothing here touches Supabase, realtime, or the games table.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LudoGamePanel } from '@/components/ludo/LudoBoard'
import {
  LUDO_SOLO_BOT_ID,
  LUDO_SOLO_HUMAN_ID,
  applyLudoSoloMove,
  initLudoSolo,
  legalMovesForCurrentPlayer,
  rollLudoSolo,
  type LudoSoloState,
} from '@/lib/ludo-solo'
import { pickLudoBotMove } from '@/lib/ludo-bot'
import { logSoloPlayStarted } from '@/lib/solo-play'
import { readSoloScoreboard, recordSoloOutcome, resetSoloScoreboard, type SoloScoreboard } from '@/lib/solo-scoreboard'
import { SoloScoreboardRow } from '@/components/solo/SoloScoreboardRow'
import type { Player } from '@/types'

const STORAGE_KEY = 'solo-ludo-state-v1'
const BOT_THINK_MS = 700

function loadPersistedState(): LudoSoloState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LudoSoloState
    if (!parsed?.session?.turn_order || !Array.isArray(parsed.session.turn_order)) return null
    return parsed
  } catch {
    return null
  }
}

function persistState(state: LudoSoloState): void {
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

export function SoloLudoClient() {
  const [state, setState] = useState<LudoSoloState | null>(null)
  const [scoreboard, setScoreboard] = useState<SoloScoreboard>({ human: 0, bot: 0, draws: 0 })
  const stateRef = useRef<LudoSoloState | null>(null)
  stateRef.current = state
  const scoredRef = useRef(false)

  useEffect(() => {
    const persisted = loadPersistedState()
    setState(persisted ?? initLudoSolo())
    setScoreboard(readSoloScoreboard('ludo'))
    if (persisted && persisted.outcome != null) scoredRef.current = true
    if (!persisted) logSoloPlayStarted('ludo')
  }, [])

  useEffect(() => {
    if (!state || state.outcome == null || scoredRef.current) return
    setScoreboard(recordSoloOutcome('ludo', state.outcome))
    scoredRef.current = true
  }, [state])

  useEffect(() => {
    if (state) persistState(state)
  }, [state])

  // Bot loop: whenever the turn is the bot's, either roll (if in roll phase)
  // or move (if in move phase). Small delay per action so the animation is
  // visible and the bot's chain of moves reads clearly.
  useEffect(() => {
    if (!state || state.outcome != null) return
    const turnId = state.session.turn_order[state.session.current_turn_index]
    if (turnId !== LUDO_SOLO_BOT_ID) return

    const t = setTimeout(() => {
      const now = stateRef.current
      if (!now) return
      if (now.session.phase === 'roll') {
        const rolled = rollLudoSolo(now, LUDO_SOLO_BOT_ID)
        if (!rolled.error) setState(rolled.state)
      } else if (now.session.phase === 'move') {
        const botState = now.states.find((s) => s.player_id === LUDO_SOLO_BOT_ID)
        if (!botState) return
        const moves = legalMovesForCurrentPlayer(now)
        const chosen = pickLudoBotMove(moves, botState)
        if (chosen) {
          const played = applyLudoSoloMove(now, LUDO_SOLO_BOT_ID, chosen)
          if (!played.error) setState(played.state)
        }
      }
    }, BOT_THINK_MS)
    return () => clearTimeout(t)
  }, [state])

  const humanRoll = useCallback(() => {
    const now = stateRef.current
    if (!now) return
    const r = rollLudoSolo(now, LUDO_SOLO_HUMAN_ID)
    if (!r.error) setState(r.state)
  }, [])

  const humanMove = useCallback((pieceId: number, diceIndex?: number) => {
    const now = stateRef.current
    if (!now) return
    const moves = legalMovesForCurrentPlayer(now)
    const chosen =
      diceIndex != null
        ? moves.find((m) => m.pieceId === pieceId && m.diceIndex === diceIndex)
        : moves.find((m) => m.pieceId === pieceId)
    if (!chosen) return
    const r = applyLudoSoloMove(now, LUDO_SOLO_HUMAN_ID, chosen)
    if (!r.error) setState(r.state)
  }, [])

  const restart = useCallback(() => {
    clearPersistedState()
    setState(initLudoSolo())
    scoredRef.current = false
    logSoloPlayStarted('ludo')
  }, [])

  const resetScore = useCallback(() => {
    setScoreboard(resetSoloScoreboard('ludo'))
  }, [])

  const players = useMemo<Player[]>(
    () =>
      [
        { id: LUDO_SOLO_HUMAN_ID, name: 'You' },
        { id: LUDO_SOLO_BOT_ID, name: 'Bot' },
      ] as Player[],
    []
  )

  if (!state) {
    return (
      <div className="fr-room fr-room-phone">
        <div className="p-6 text-center text-muted text-sm">Setting up the board…</div>
      </div>
    )
  }

  const turnId = state.session.turn_order[state.session.current_turn_index]
  const isMyTurn = turnId === LUDO_SOLO_HUMAN_ID && state.outcome == null
  const finished = state.outcome != null
  const humanWon = state.outcome === 'human'

  return (
    <div className="fr-room fr-room-phone">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-body">Ludo — solo vs bot</h1>
          <p className="text-faint text-xs">Practice mode · no room, no account</p>
        </div>
        <button type="button" onClick={restart} className="btn-secondary text-xs">
          New game
        </button>
      </div>

      <div className="px-3 py-4">
        <LudoGamePanel
          session={state.session}
          states={state.states}
          players={players}
          myPlayerId={LUDO_SOLO_HUMAN_ID}
          isMyTurn={isMyTurn}
          secondsLeft={0}
          hasTimer={false}
          urgent={false}
          variant={state.variant}
          onRoll={isMyTurn && state.session.phase === 'roll' ? humanRoll : undefined}
          onMovePiece={isMyTurn && state.session.phase === 'move' ? humanMove : undefined}
        />
      </div>

      {finished && (
        <div className="mx-3 my-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-inset-bg)] p-5 text-center">
          <p className="text-lg font-black text-body">
            {humanWon ? 'You won ' : 'Bot wins'}
            {humanWon && <span aria-hidden> 🎉</span>}
          </p>
          <p className="text-muted mt-1 text-sm">Practice mode — no ranking, just for fun.</p>
          <SoloScoreboardRow scoreboard={scoreboard} onReset={resetScore} />
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button type="button" onClick={restart} className="btn-primary">
              Play again
            </button>
            <Link href="/create?type=ludo" className="btn-secondary text-center">
              Start a real room
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
