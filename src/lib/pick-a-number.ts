import type { Game, Player, Round } from '@/types'
import { parseStoredMltQuestions } from '@/lib/custom-questions'
import {
  buildHotSeatSequence,
  hotSeatJoinedParticipantIds,
  hotSeatJoinedPlayers,
  type HotSeatPlayerRow,
} from '@/lib/hot-seat'

export const PAN_MIN_PLAYERS = 2
export const PAN_MAX_ROUNDS = 100

/** Numbered question list stored on the game after start. */
export function parsePickANumberPool(raw: unknown): string[] {
  return parseStoredMltQuestions(raw)
}

export function pickANumberPoolSize(game: Pick<Game, 'custom_questions'>): number {
  return parsePickANumberPool(game.custom_questions).length
}

export function pickANumberQuestionAt(pool: string[], number: number): string | null {
  if (!Number.isInteger(number) || number < 1 || number > pool.length) return null
  const question = pool[number - 1]?.trim()
  return question ? question : null
}

export function panRoundRevealed(round: Pick<Round, 'mlt_question'> | null | undefined): boolean {
  return !!round?.mlt_question?.trim()
}

export function clampPanRounds(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n)) return 5
  return Math.min(PAN_MAX_ROUNDS, Math.max(1, Math.floor(n)))
}

export function panRoundPickerOptions(max: number = PAN_MAX_ROUNDS): number[] {
  const cap = Math.max(max, 1)
  const presets = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100]
  const opts = presets.filter((n) => n <= cap)
  return opts.includes(cap) ? opts : [...opts, cap]
}

export function panRoundsHint(roundsCount: number, playerCount: number): string {
  if (playerCount < PAN_MIN_PLAYERS) {
    return `Need at least ${PAN_MIN_PLAYERS} players to join`
  }
  return `${roundsCount} picking turn${roundsCount === 1 ? '' : 's'} — rotates through ${playerCount} player${playerCount === 1 ? '' : 's'}`
}

export function buildPickANumberRoundRows(opts: {
  gameId: string
  players: HotSeatPlayerRow[]
  participants: { id: string; name: string }[]
  participantMode?: string | null
  roundsCount: number
  now: string
}): { ok: true; roundRows: Array<Record<string, unknown>>; roundsCount: number } | { ok: false; error: string } {
  const joined = hotSeatJoinedPlayers(opts.players, opts.participants, opts.participantMode)
  if (joined.length < PAN_MIN_PLAYERS) {
    const joiners = (opts.participantMode ?? 'import') === 'joiners'
    return {
      ok: false,
      error: joiners
        ? `Need at least ${PAN_MIN_PLAYERS} players to join before starting`
        : `Need at least ${PAN_MIN_PLAYERS} players who claimed a name from the list`,
    }
  }

  const roundsCount = clampPanRounds(opts.roundsCount)
  const participantIds = hotSeatJoinedParticipantIds(opts.players, opts.participants, opts.participantMode)
  const sequence = buildHotSeatSequence(joined as Player[], roundsCount)

  const roundRows = sequence.map((picker, index) => ({
    game_id: opts.gameId,
    round_number: index + 1,
    participant_ids: participantIds,
    submitter_player_id: picker.id,
    status: index === 0 ? 'active' : ('pending' as const),
    started_at: index === 0 ? opts.now : null,
    ended_at: null,
  }))

  return { ok: true, roundRows, roundsCount }
}
