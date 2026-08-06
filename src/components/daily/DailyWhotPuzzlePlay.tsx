'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DAILY_SUBMIT_CONFIRM } from '@/components/daily/daily-submit-confirm'
import { getOrCreateStartedAt, loadDailyAnswers, saveDailyAnswers, clearDailyProgress } from '@/lib/daily-progress'

interface WhotCard {
  shape: string
  number: number
}

interface WhotPuzzle {
  hand: WhotCard[]
  topCard: WhotCard
  currentShape: string
  marketDeck: WhotCard[]
}

type WhotMove = { type: 'play'; card: WhotCard; chosenShape?: string } | { type: 'draw' }

interface SavedState {
  hand: WhotCard[]
  topCard: WhotCard
  currentShape: string
  marketIndex: number
  moves: WhotMove[]
  drawCount: number
}

interface DailyWhotPuzzlePlayProps {
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

const DRAW_CAP = 5

const SHAPE_COLORS: Record<string, string> = {
  circle: '#e74c3c',
  triangle: '#2ecc71',
  square: '#3498db',
  star: '#f1c40f',
  cross: '#9b59b6',
  whot: '#1a1a2e',
}

const SHAPE_ICONS: Record<string, string> = {
  circle: '●',
  triangle: '▲',
  square: '■',
  star: '★',
  cross: '✚',
  whot: 'W',
}

const ALL_SHAPES = ['circle', 'triangle', 'square', 'star', 'cross']

function canPlay(card: WhotCard, topCard: WhotCard, currentShape: string): boolean {
  if (card.number === 20) return true
  return card.shape === currentShape || card.number === topCard.number
}

function hasLegalPlay(hand: WhotCard[], topCard: WhotCard, currentShape: string): boolean {
  return hand.some((c) => canPlay(c, topCard, currentShape))
}

export function DailyWhotPuzzlePlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: DailyWhotPuzzlePlayProps) {
  const puzzleData = useMemo<WhotPuzzle>(
    () => ({
      hand: (puzzle.hand ?? []) as WhotCard[],
      topCard: puzzle.topCard as WhotCard,
      currentShape: puzzle.currentShape as string,
      marketDeck: (puzzle.marketDeck ?? []) as WhotCard[],
    }),
    [puzzle]
  )

  const [startAtMs] = useState(() => getOrCreateStartedAt(challengeId))
  const [state, setState] = useState<SavedState>(() => {
    const saved = loadDailyAnswers<SavedState>(challengeId)
    if (saved) return saved
    return {
      hand: [...puzzleData.hand],
      topCard: puzzleData.topCard,
      currentShape: puzzleData.currentShape,
      marketIndex: 0,
      moves: [],
      drawCount: 0,
    }
  })
  const [pickingShape, setPickingShape] = useState(false)
  const [pendingCard, setPendingCard] = useState<WhotCard | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)
  const { confirm } = useConfirm()

  useEffect(() => {
    if (!submitted) saveDailyAnswers(challengeId, state)
  }, [challengeId, state, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: !submitted,
    startAtMs,
  })

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    clearDailyProgress(challengeId)
    onSubmit({
      timeSeconds: Math.min(elapsed, maxSeconds),
      submission: { moves: state.moves },
    })
  }, [challengeId, elapsed, maxSeconds, onSubmit, state.moves])

  useEffect(() => {
    if (isTimeUp && !submitRef.current) handleSubmit()
  }, [isTimeUp, handleSubmit])

  useEffect(() => {
    if (state.hand.length === 0 && state.moves.length > 0 && !submitRef.current) {
      handleSubmit()
    }
  }, [state.hand.length, state.moves.length, handleSubmit])

  useEffect(() => {
    if (state.drawCount >= DRAW_CAP && !submitRef.current) {
      handleSubmit()
    }
  }, [state.drawCount, handleSubmit])

  const playCard = (card: WhotCard, chosenShape?: string) => {
    if (submitted) return
    setState((prev) => {
      const idx = prev.hand.findIndex((c) => c.shape === card.shape && c.number === card.number)
      if (idx === -1) return prev
      const newHand = [...prev.hand]
      newHand.splice(idx, 1)
      const newShape = chosenShape ?? card.shape
      const move: WhotMove =
        card.number === 20 ? { type: 'play', card, chosenShape: chosenShape ?? card.shape } : { type: 'play', card }
      return {
        ...prev,
        hand: newHand,
        topCard: card,
        currentShape: newShape,
        moves: [...prev.moves, move],
      }
    })
  }

  const handleCardTap = (card: WhotCard) => {
    if (submitted || pickingShape) return
    if (!canPlay(card, state.topCard, state.currentShape)) return
    if (card.number === 20) {
      setPendingCard(card)
      setPickingShape(true)
      return
    }
    playCard(card)
  }

  const handleShapePick = (shape: string) => {
    if (!pendingCard) return
    playCard(pendingCard, shape)
    setPendingCard(null)
    setPickingShape(false)
  }

  const handleDraw = () => {
    if (submitted || pickingShape) return
    if (state.drawCount >= DRAW_CAP) return
    setState((prev) => {
      const card = prev.marketIndex < puzzleData.marketDeck.length ? puzzleData.marketDeck[prev.marketIndex] : null
      if (!card) return prev
      return {
        ...prev,
        hand: [...prev.hand, card],
        marketIndex: prev.marketIndex + 1,
        moves: [...prev.moves, { type: 'draw' }],
        drawCount: prev.drawCount + 1,
      }
    })
  }

  const handleManualSubmit = async () => {
    if (submitRef.current) return
    const ok = await confirm(DAILY_SUBMIT_CONFIRM)
    if (ok) handleSubmit()
  }

  const legalPlayExists = hasLegalPlay(state.hand, state.topCard, state.currentShape)

  return (
    <div className="space-y-4">
      <div
        className="flex items-center justify-between rounded-xl px-4 py-2.5"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <div className="font-bold tabular-nums" style={{ fontSize: 'var(--text-sm)' }}>
          {state.moves.length} moves
        </div>
        <div
          className="font-bold tabular-nums"
          style={{ fontSize: 'var(--text-sm)', color: elapsed >= maxSeconds - 10 ? 'var(--error)' : undefined }}
        >
          {formatted}
        </div>
      </div>

      {/* Instructions */}
      <p className="text-center" style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>
        Clear your hand by matching the top card&apos;s shape or number. Whot (20) is wild — pick any shape. Fewer moves
        = higher score.
      </p>

      <div
        className="flex flex-col items-center gap-2 rounded-xl p-5"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <div className="font-medium uppercase tracking-wider" style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
          Discard Pile
        </div>
        <div
          className="flex h-24 w-16 flex-col items-center justify-center rounded-lg"
          style={{
            background: SHAPE_COLORS[state.topCard.shape] ?? 'var(--surface)',
            color: state.topCard.shape === 'star' ? '#000' : '#fff',
            border: '2px solid var(--border)',
          }}
        >
          <span style={{ fontSize: 'var(--text-xl)' }}>{SHAPE_ICONS[state.topCard.shape] ?? '?'}</span>
          <span className="font-bold" style={{ fontSize: 'var(--text-sm)' }}>
            {state.topCard.number}
          </span>
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Current shape:{' '}
          <strong style={{ color: SHAPE_COLORS[state.currentShape] }}>
            {SHAPE_ICONS[state.currentShape]} {state.currentShape}
          </strong>
        </div>
      </div>

      {pickingShape && (
        <div
          className="rounded-xl p-4 text-center"
          style={{ background: 'var(--card)', border: '2px solid var(--primary)' }}
        >
          <div className="mb-3 font-bold" style={{ fontSize: 'var(--text-sm)' }}>
            Choose next shape
          </div>
          <div className="flex justify-center gap-2">
            {ALL_SHAPES.map((shape) => (
              <button
                key={shape}
                type="button"
                onClick={() => handleShapePick(shape)}
                className="flex h-12 w-12 items-center justify-center rounded-lg transition-transform hover:scale-110"
                style={{ background: SHAPE_COLORS[shape], color: shape === 'star' ? '#000' : '#fff' }}
              >
                <span style={{ fontSize: 'var(--text-lg)' }}>{SHAPE_ICONS[shape]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {state.hand.length > 0 ? (
        <div>
          <div
            className="mb-2 font-medium uppercase tracking-wider"
            style={{ fontSize: '11px', color: 'var(--text-faint)' }}
          >
            Your Hand ({state.hand.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {state.hand.map((card, i) => {
              const legal = canPlay(card, state.topCard, state.currentShape)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleCardTap(card)}
                  disabled={!legal || submitted || pickingShape}
                  className="flex h-20 w-14 flex-col items-center justify-center rounded-lg transition-transform disabled:cursor-default"
                  style={{
                    background: SHAPE_COLORS[card.shape] ?? 'var(--surface)',
                    color: card.shape === 'star' ? '#000' : '#fff',
                    border: legal ? '2px solid var(--primary)' : '2px solid var(--border)',
                    opacity: legal ? 1 : 0.4,
                    transform: legal ? 'translateY(-4px)' : undefined,
                  }}
                >
                  <span style={{ fontSize: 'var(--text-lg)' }}>{SHAPE_ICONS[card.shape] ?? '?'}</span>
                  <span className="font-bold" style={{ fontSize: 'var(--text-sm)' }}>
                    {card.number}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        !submitted && (
          <div className="py-8 text-center">
            <p className="font-bold" style={{ fontSize: 'var(--text-lg)' }}>
              Hand cleared!
            </p>
            <p className="mt-1" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              Submitting...
            </p>
          </div>
        )
      )}

      {state.hand.length > 0 && !legalPlayExists && !pickingShape && !submitted && (
        <button
          type="button"
          onClick={handleDraw}
          disabled={state.drawCount >= DRAW_CAP}
          className="fr-btn fr-btn--secondary w-full"
        >
          Draw from market ({state.drawCount}/{DRAW_CAP})
        </button>
      )}

      {state.hand.length > 0 && state.moves.length > 0 && !submitted && (
        <button type="button" onClick={handleManualSubmit} className="fr-btn fr-btn--secondary fr-btn--sm w-full">
          Submit ({state.moves.length} moves)
        </button>
      )}
    </div>
  )
}
