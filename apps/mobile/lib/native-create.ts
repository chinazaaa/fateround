import type { GameType } from '@fateround/shared'
import { MOBILE_SUPPORTED_GAMES } from '@/lib/mobile-registry'

/**
 * Games that can be created natively with title + type only.
 * Excludes types that need web-only setup (custom slot builder, participant import).
 */
export const NATIVE_CREATABLE_GAMES: GameType[] = MOBILE_SUPPORTED_GAMES.filter((t) => t !== 'custom')
