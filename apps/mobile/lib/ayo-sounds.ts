import { playSound } from '@/lib/sounds'

/**
 * Ayo sound effects — a soft wooden tap per seed drop and a short chime when it
 * becomes your turn, mirroring the web's synthesized tones. Thin wrappers over
 * the shared sound registry (@/lib/sounds).
 */

export function playAyoSeedDrop() {
  playSound('ayo-drop')
}

export function playAyoTurnChime() {
  playSound('ayo-turn')
}
