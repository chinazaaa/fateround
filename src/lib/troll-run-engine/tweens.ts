/**
 * Lightweight Tween & Easing System for Troll Run trap animations.
 */

import type { ActiveTween } from './types'

export const Easings = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeOutBounce: (t: number) => {
    const n1 = 7.5625
    const d1 = 2.75
    if (t < 1 / d1) {
      return n1 * t * t
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375
    }
  },
  easeOutElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
  },
  snap: (t: number) => (t >= 0.95 ? 1 : 0),
} as const

export class TweenManager {
  private tweens: ActiveTween[] = []
  private nextId = 1

  public add(
    target: any,
    property: string,
    to: number,
    durationSec: number,
    easingName: keyof typeof Easings = 'easeOutQuad',
    onComplete?: () => void
  ): string {
    const id = `tween_${this.nextId++}`
    const from = typeof target[property] === 'number' ? target[property] : 0
    const easing = Easings[easingName] || Easings.easeOutQuad

    this.tweens.push({
      id,
      target,
      property,
      from,
      to,
      duration: Math.max(0.001, durationSec),
      elapsed: 0,
      easing,
      onComplete,
    })

    return id
  }

  public update(dt: number): void {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tween = this.tweens[i]
      tween.elapsed += dt
      const progress = Math.min(1, tween.elapsed / tween.duration)
      const eased = tween.easing(progress)
      tween.target[tween.property] = tween.from + (tween.to - tween.from) * eased

      if (progress >= 1) {
        this.tweens.splice(i, 1)
        if (tween.onComplete) {
          tween.onComplete()
        }
      }
    }
  }

  public clear(): void {
    this.tweens = []
  }
}
