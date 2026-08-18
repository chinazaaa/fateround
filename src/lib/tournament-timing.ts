import { TRIVIA_REVEAL_SECONDS, TRIVIA_DEFAULT_TIMER } from './trivia'
import { TTL_REVEAL_SECONDS, TTL_DEFAULT_TIMER } from './two-truths'
import {
  NPAT_LETTER_PICK_SECONDS,
  NPAT_REVEAL_SECONDS,
  NPAT_CALLER_REVIEW_SECONDS,
  NPAT_DEFAULT_TIMER,
  NPAT_DEFAULT_MARKING_TIMER,
} from './npat'
import type { TournamentQueueEntry } from '@/types/tournament'

/**
 * Player-count placeholder for the create-page estimator: at creation time no
 * one has joined yet, so estimates for player-count-driven games (Two Truths,
 * Who Said This) use this as a mid-range group size. The detail-page estimator
 * uses the actual roster instead.
 */
export const TIMING_PLAYER_FALLBACK = 8

/**
 * Estimate how long ONE tournament game runs, in seconds. Wall-clock — includes
 * per-round reveal/gap seconds each game engine already schedules, but NOT the
 * host-controlled break between one tournament game and the next (that's up to
 * whoever's running the event).
 *
 * Estimates are deliberately conservative: within-game phase timers land close,
 * but a room that types slowly, votes late, or takes an unexpected break will
 * always run over. Copy that surfaces these numbers should say "≈" / "about".
 */
export function estimateGameSeconds(entry: TournamentQueueEntry, playerCount: number): number {
  const players = Math.max(1, playerCount)

  if (entry.gameType === 'trivia') {
    const questions = entry.roundsCount ?? 10
    const perQuestion = entry.timerSeconds ?? TRIVIA_DEFAULT_TIMER
    // Each question: host-set timer + the built-in reveal window between questions.
    return questions * (perQuestion + TRIVIA_REVEAL_SECONDS)
  }

  if (entry.gameType === 'i_call_on') {
    const rounds = entry.roundsCount ?? 5
    const writeTimer = entry.timerSeconds ?? NPAT_DEFAULT_TIMER
    // Per letter cycle: letter pick + write phase + peer marking + caller review + reveal.
    const perCycle =
      NPAT_LETTER_PICK_SECONDS +
      writeTimer +
      NPAT_DEFAULT_MARKING_TIMER +
      NPAT_CALLER_REVIEW_SECONDS +
      NPAT_REVEAL_SECONDS
    return rounds * perCycle
  }

  if (entry.gameType === 'two_truths') {
    const perGuess = entry.timerSeconds ?? TTL_DEFAULT_TIMER
    // One round per player as the target: rough submit-and-reveal overhead + timer + reveal.
    const perPlayer = 10 + perGuess + TTL_REVEAL_SECONDS
    return players * perPlayer
  }

  if (entry.gameType === 'who_said_this') {
    const perGuess = entry.timerSeconds ?? 30
    // One round per submitted quote (each joiner submits one): timer + reveal.
    return players * (perGuess + 5)
  }

  return 0
}

/** Sum an entire playlist's estimated wall-clock, in seconds. */
export function estimatePlaylistSeconds(entries: TournamentQueueEntry[], playerCount: number): number {
  return entries.reduce((sum, e) => sum + estimateGameSeconds(e, playerCount), 0)
}

/** Human-friendly duration: "45s" / "3m" / "1h 5m". No sub-minute precision beyond 60s. */
export function formatEstimatedDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0m'
  if (totalSeconds < 60) return `${Math.round(totalSeconds)}s`
  const totalMinutes = Math.round(totalSeconds / 60)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes - hours * 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

/** True when this game's estimate depends on how many players join. */
export function isPlayerCountDependent(gameType: string): boolean {
  return gameType === 'two_truths' || gameType === 'who_said_this'
}
