/**
 * Haptic feedback hook — stable API today, no-op until we install expo-haptics.
 *
 * Why a hook that does nothing? Two reasons the plan calls out
 * (docs/mobile-revamp-plan.md):
 *   1. `expo-haptics` requires a dev-client rebuild — that's a Premium-arc
 *      cost, not a Phase 0 one.
 *   2. Component authors can adopt `haptic('light')` today without waiting.
 *      When the dep lands, this file becomes the ONE place we wire the
 *      real API — no downstream churn.
 *
 * When the Premium arc activates it:
 *   import * as Haptics from 'expo-haptics'
 *   Then swap the no-op impl for a switch on `intensity`:
 *     - 'selection' → Haptics.selectionAsync()
 *     - 'light'     → Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
 *     - 'medium'    → Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
 *     - 'heavy'     → Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
 *     - 'success'   → Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
 *     - 'warning'   → Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
 *     - 'error'     → Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
 */

import { useCallback } from 'react'

export type HapticIntensity =
  | 'selection' // tiny tick — chip toggle, dropdown pick
  | 'light' // button tap
  | 'medium' // confirm dialog accept
  | 'heavy' // destructive action commit
  | 'success' // win / trophy unlocked
  | 'warning' // form validation
  | 'error' // request failed

export type HapticFn = (intensity: HapticIntensity) => void

const noopHaptic: HapticFn = () => {
  /* activated in Premium arc — see file header */
}

export function useHaptic(): HapticFn {
  return useCallback<HapticFn>(noopHaptic, [])
}
