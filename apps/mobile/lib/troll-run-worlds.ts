import { TROLL_RUN_WORLD_IDS, type TrollRunWorldId } from '@fateround/shared/troll-run-types'

/**
 * The shipped worlds as picker options.
 *
 * The option list is derived from `TROLL_RUN_WORLD_IDS`, so a world added to the engine turns up
 * in the create screen and the lobby editor without either being touched — the same reason the
 * trivia category options are built off their canonical list. `Record` rather than a partial map
 * is what makes the omitted label a compile error instead of an `undefined` hint at runtime.
 */
const WORLD_LABELS: Record<TrollRunWorldId, { label: string; hint: string }> = {
  pits: { label: 'The Pits', hint: 'Collapsing floors' },
  doors: { label: 'Doors', hint: 'Runaway exits' },
  gravity: { label: 'Gravity', hint: 'Ceiling runs' },
  gauntlet: { label: 'Gauntlet', hint: 'Every trap' },
  machines: { label: 'Machines', hint: 'Sweeping presses' },
}

export const TROLL_RUN_WORLD_OPTIONS = TROLL_RUN_WORLD_IDS.map((value) => ({
  value,
  label: WORLD_LABELS[value].label,
  hint: WORLD_LABELS[value].hint,
}))
