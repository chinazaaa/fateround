import { useCallback, useRef, useState } from 'react'
import { traceSowFromPit, type AyoBoardConfig } from '@/lib/ayo-sow'

/**
 * Drives the seed-by-seed sowing animation. Mirrors the web
 * `useAyoSowAnimation` hook — same timing constants and per-step frames — so
 * the counting animation looks identical to the browser version. The move is
 * fired optimistically and this runs in parallel; afterwards the caller
 * reconciles with the authoritative server state.
 */

const DROP_MS = 380 // each seed drop
const RELAY_MS = 280 // pickup + traditional relay pickups
const HOUSE_MS = 520 // house win / capture
const END_MS = 420 // final landing pause

export type AyoSowAnimationState = {
  pits: number[]
  highlightPit: number | null
  pulsePit: number | null
  landingPit: number | null
  seedsInHand: number | null
  animating: boolean
}

const INITIAL_ANIMATION: AyoSowAnimationState = {
  pits: [],
  highlightPit: null,
  pulsePit: null,
  landingPit: null,
  seedsInHand: null,
  animating: false,
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

type UseAyoSowAnimationOptions = {
  /** Called once per dropped seed — wire the seed-drop sound/haptic here. */
  onSeedDrop?: () => void
}

export function useAyoSowAnimation({ onSeedDrop }: UseAyoSowAnimationOptions = {}) {
  const [animation, setAnimation] = useState<AyoSowAnimationState>(INITIAL_ANIMATION)
  const runIdRef = useRef(0)
  const onSeedDropRef = useRef(onSeedDrop)
  onSeedDropRef.current = onSeedDrop

  const playSowAnimation = useCallback(async (pits: number[], pitIndex: number, config: AyoBoardConfig) => {
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    const cancelled = () => runIdRef.current !== runId

    const trace = traceSowFromPit(pits, pitIndex, config)

    setAnimation({
      pits: [...pits],
      highlightPit: pitIndex,
      pulsePit: null,
      landingPit: null,
      seedsInHand: pits[pitIndex] ?? 0,
      animating: true,
    })

    for (const step of trace.steps) {
      if (cancelled()) return
      switch (step.type) {
        case 'pickup':
          setAnimation({
            pits: step.pitsAfter,
            highlightPit: step.pitIndex,
            pulsePit: null,
            landingPit: null,
            seedsInHand: step.seedsTaken,
            animating: true,
          })
          await sleep(RELAY_MS)
          break
        case 'drop':
          setAnimation({
            pits: step.pitsAfter,
            highlightPit: step.pitIndex,
            pulsePit: step.pitIndex,
            landingPit: null,
            seedsInHand: step.seedsInHand,
            animating: true,
          })
          onSeedDropRef.current?.()
          await sleep(DROP_MS)
          break
        case 'relay':
          setAnimation((prev) => ({
            ...prev,
            pits: step.pitsAfter,
            highlightPit: step.pitIndex,
            pulsePit: null,
            landingPit: null,
            seedsInHand: step.seedsPickedUp,
            animating: true,
          }))
          await sleep(RELAY_MS)
          break
        case 'house_win':
          setAnimation((prev) => ({
            ...prev,
            pits: step.pitsAfter,
            highlightPit: step.pitIndex,
            pulsePit: step.pitIndex,
            landingPit: null,
            seedsInHand: null,
            animating: true,
          }))
          await sleep(HOUSE_MS)
          break
        case 'end':
          setAnimation((prev) => ({
            ...prev,
            pits: step.pitsAfter,
            highlightPit: step.pitIndex,
            pulsePit: null,
            landingPit: step.pitIndex,
            seedsInHand: null,
            animating: true,
          }))
          await sleep(END_MS)
          break
      }
    }

    if (cancelled()) return
    setAnimation(INITIAL_ANIMATION)
  }, [])

  const clearAnimation = useCallback(() => {
    runIdRef.current += 1
    setAnimation(INITIAL_ANIMATION)
  }, [])

  return { animation, playSowAnimation, clearAnimation, isAnimating: animation.animating }
}
