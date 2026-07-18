import {
  clampLandmineElimSeconds,
  LANDMINE_DEFAULT_CATEGORY_TIMER,
  LANDMINE_DEFAULT_ELIM_SECONDS,
  LANDMINE_DEFAULT_MANUAL_CYCLES,
  LANDMINE_DEFAULT_MARKING_TIMER,
  LANDMINE_DEFAULT_MINE_COUNT,
  LANDMINE_DEFAULT_ROUND_COUNT,
  LANDMINE_DEFAULT_WRITING_TIMER,
} from '@fateround/shared/landmine'

/**
 * Landmine create-flow settings (mobile parallel of the web `create/page.tsx` Landmine block).
 * Distinct enough (mine source, mode, elimination timer, three phase timers) to own a dedicated
 * panel + CREATE_SETTINGS_REGISTRY entry rather than joining the generic party-room settings.
 */
export type LandmineMineSourceOpt = 'system' | 'manual'
export type LandmineModeOpt = 'zero_points' | 'elimination'

export type LandmineCreateState = {
  /** 'system' = the app draws the mine; 'manual' = a rotating player sets it and sits out. */
  mineSource: LandmineMineSourceOpt
  /** 'zero_points' = mine scores 0; 'elimination' = mine knocks you out (time-limited). */
  mode: LandmineModeOpt
  mineCount: number
  originalityBonus: boolean
  /** Review-before-reveal: reviewer (round caller) checks verdicts. Manual on, auto off by default. */
  review: boolean
  /** Review-window length in seconds (15/20/30/45/60). */
  reviewSeconds: number
  /** System: fixed rounds (3/5/8/10). Manual: cycles (1/2/3/5) — one cycle = everyone sets once. */
  roundsCount: number
  /** Elimination time limit, seconds. */
  elimSeconds: number
  /** Answer timer (games.timer_seconds). */
  writingTimer: number
  /** Vote/marking timer (games.operative_timer_seconds). */
  markingTimer: number
  /** Category-pick timer, also the manual setup timer (games.game_duration_seconds). */
  categoryTimer: number
}

export function defaultLandmineCreateState(): LandmineCreateState {
  return {
    mineSource: 'system',
    mode: 'zero_points',
    mineCount: LANDMINE_DEFAULT_MINE_COUNT,
    originalityBonus: true,
    review: true,
    reviewSeconds: 20,
    roundsCount: LANDMINE_DEFAULT_ROUND_COUNT,
    elimSeconds: LANDMINE_DEFAULT_ELIM_SECONDS,
    writingTimer: LANDMINE_DEFAULT_WRITING_TIMER,
    markingTimer: LANDMINE_DEFAULT_MARKING_TIMER,
    categoryTimer: LANDMINE_DEFAULT_CATEGORY_TIMER,
  }
}

/** Sensible re-defaults when the host flips the mine source (mirrors the web toggle). */
export function landmineMineSourceDefaults(source: LandmineMineSourceOpt): Partial<LandmineCreateState> {
  return source === 'manual'
    ? {
        mineSource: 'manual',
        categoryTimer: 30,
        roundsCount: LANDMINE_DEFAULT_MANUAL_CYCLES,
        review: true,
        reviewSeconds: 45,
      }
    : {
        mineSource: 'system',
        categoryTimer: LANDMINE_DEFAULT_CATEGORY_TIMER,
        roundsCount: LANDMINE_DEFAULT_ROUND_COUNT,
        review: true,
        reviewSeconds: 20,
      }
}

/** The landmine columns for the create payload (folded in via CREATE_SETTINGS_REGISTRY). */
export function landmineCreatePayload(s: LandmineCreateState): Record<string, unknown> {
  return {
    landmine_mode: s.mode,
    landmine_mine_source: s.mineSource,
    landmine_mine_count: s.mineCount,
    landmine_originality_bonus: s.originalityBonus,
    landmine_review: s.review,
    landmine_review_seconds: s.reviewSeconds,
    landmine_elim_seconds: clampLandmineElimSeconds(s.elimSeconds),
    rounds_count: s.roundsCount,
    timer_seconds: s.writingTimer,
    operative_timer_seconds: s.markingTimer,
    game_duration_seconds: s.categoryTimer,
  }
}
