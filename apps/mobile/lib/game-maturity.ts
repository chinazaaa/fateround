import * as SecureStore from 'expo-secure-store'
import type { GameType } from '@fateround/shared'

/**
 * Games whose content is aimed at an adult audience — either because the built-in prompt
 * bank includes sexual or drinking references, or because the format asks players to make
 * suggestive judgements about real people (each other, most of the time).
 *
 * FateRound also markets itself for classrooms and school championships, so these need to
 * be visibly separated from the family-friendly catalogue rather than sitting in the same
 * flat grid. Keep this list in sync with `src/lib/game-maturity.ts` on web — mobile keeps
 * its own copy (see the "web/shared parallel copies" convention).
 */
export const MATURE_GAME_TYPES = new Set<GameType>([
  'never_have_i_ever',
  'smash_or_pass',
  'smash_marry_kill',
  'red_flag_green_flag',
  'hot_seat',
])

export function isMatureGame(gameType: GameType): boolean {
  return MATURE_GAME_TYPES.has(gameType)
}

/** Short pill rendered on game cards and landing heroes. */
export const MATURE_BADGE_LABEL = '18+'

/** One-line reason shown under the badge, tailored to why each game is flagged. */
const MATURE_REASON: Partial<Record<GameType, string>> = {
  never_have_i_ever: 'The built-in question bank includes references to sex, drinking and other adult themes.',
  smash_or_pass: 'Players rate real people by attractiveness, which can get personal and suggestive.',
  smash_marry_kill: 'Players rate real people by attractiveness, which can get personal and suggestive.',
  red_flag_green_flag: 'Players judge each other on dating red flags, which often turns to relationships and sex.',
  hot_seat: 'The whole room answers unfiltered personal questions about one player at a time.',
}

export function matureGameReason(gameType: GameType): string {
  return MATURE_REASON[gameType] ?? 'This game is built around adult themes and personal questions.'
}

/** Headline used on the interstitial and the landing-page notice. */
export const MATURE_NOTICE_TITLE = 'This game is for adults'

/** Guidance shown alongside the reason, in both the notice and the interstitial. */
export const MATURE_NOTICE_BODY =
  'Play it with people you know, and skip it entirely if anyone in the room is under 18. Hosts can swap in their own questions to keep things tame.'

/**
 * Consent is a soft, room-level acknowledgement — not identity verification. We deliberately
 * do not ask for a date of birth: collecting one would add a category of personal data to the
 * privacy policy without meaningfully stopping anybody who wants to lie about their age.
 */
const CONSENT_STORAGE_KEY = 'fateround_mature_ack'

export async function hasAcknowledgedMature(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(CONSENT_STORAGE_KEY)) === '1'
  } catch {
    // Blocked-storage setups throw on access — fail open rather than trapping the
    // player behind a gate they can never clear.
    return true
  }
}

export async function acknowledgeMature(): Promise<void> {
  try {
    await SecureStore.setItemAsync(CONSENT_STORAGE_KEY, '1')
  } catch {
    // Non-fatal: the player just sees the notice again next time.
  }
}
