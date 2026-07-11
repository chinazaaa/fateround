import type { GameType } from '@fateround/shared'
import { MOBILE_SUPPORTED_GAMES } from '@/lib/mobile-registry'

/**
 * Games creatable natively. Custom Game (slot builder) and participant-import
 * games (Who Said This, Hot Seat, Most Likely To) are handled in the create
 * wizard's People step — see `apps/mobile/lib/create-settings/people.ts`.
 */
export const NATIVE_CREATABLE_GAMES: GameType[] = MOBILE_SUPPORTED_GAMES
