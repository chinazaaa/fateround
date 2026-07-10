'use client'

import { useCallback, useRef, useState } from 'react'
import type { AyoBoardConfig, AyoSowStep } from '@/lib/ayo'
import { traceSowFromPit } from '@/lib/ayo'
import { playAyoSeedDropSound } from '@/lib/sounds'

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

const DROP_MS = 380
const RELAY_MS = 280
const HOUSE_MS = 520
const END_MS = 420

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function playSteps(
  steps: AyoSowStep[],
  onFrame: (frame: Omit<AyoSowAnimationState, 'animating'>) => void,
  cancelled: () => boolean
): Promise<void> {
  for (const step of steps) {
    if (cancelled()) return

    if (step.type === 'pickup') {
      onFrame({
        pits: step.pitsAfter,
        highlightPit: step.pitIndex,
        pulsePit: null,
        landingPit: null,
        seedsInHand: step.seedsTaken,
      })
      await sleep(RELAY_MS)
      continue
    }

    if (step.type === 'drop') {
      void playAyoSeedDropSound()
      onFrame({
        pits: step.pitsAfter,
        highlightPit: step.pitIndex,
        pulsePit: step.pitIndex,
        landingPit: null,
        seedsInHand: step.seedsInHand,
      })
      await sleep(DROP_MS)
      continue
    }

    if (step.type === 'relay') {
      onFrame({
        pits: step.pitsAfter,
        highlightPit: step.pitIndex,
        pulsePit: null,
        landingPit: null,
        seedsInHand: step.seedsPickedUp,
      })
      await sleep(RELAY_MS)
      continue
    }

    if (step.type === 'house_win') {
      onFrame({
        pits: step.pitsAfter,
        highlightPit: step.pitIndex,
        pulsePit: step.pitIndex,
        landingPit: null,
        seedsInHand: null,
      })
      await sleep(HOUSE_MS)
      continue
    }

    if (step.type === 'end') {
      onFrame({
        pits: step.pitsAfter,
        highlightPit: step.pitIndex,
        pulsePit: null,
        landingPit: step.pitIndex,
        seedsInHand: null,
      })
      await sleep(END_MS)
    }
  }
}

export function useAyoSowAnimation() {
  const [animation, setAnimation] = useState<AyoSowAnimationState>(INITIAL_ANIMATION)
  const runIdRef = useRef(0)

  const clearAnimation = useCallback(() => {
    runIdRef.current += 1
    setAnimation(INITIAL_ANIMATION)
  }, [])

  const playSowAnimation = useCallback(
    async (pits: number[], pitIndex: number, config: AyoBoardConfig): Promise<void> => {
      const runId = runIdRef.current + 1
      runIdRef.current = runId
      const trace = traceSowFromPit(pits, pitIndex, config)

      setAnimation({
        pits: [...pits],
        highlightPit: pitIndex,
        pulsePit: null,
        landingPit: null,
        seedsInHand: pits[pitIndex],
        animating: true,
      })

      await playSteps(
        trace.steps,
        (frame) => {
          if (runIdRef.current !== runId) return
          setAnimation({ ...frame, animating: true })
        },
        () => runIdRef.current !== runId
      )

      if (runIdRef.current === runId) {
        setAnimation(INITIAL_ANIMATION)
      }
    },
    []
  )

  return { animation, playSowAnimation, clearAnimation, isAnimating: animation.animating }
}
