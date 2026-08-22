import { TROLL_RUN_WORLD_IDS, type TrollRunWorldId } from '@fateround/shared/troll-run-types'

/**
 * The four worlds as picker options.
 *
 * Derived from `TROLL_RUN_WORLD_IDS` rather than written out, so a fifth world added to the
 * engine turns up in the create screen and the lobby editor without either being touched — the
 * same reason the trivia category options are built off their canonical list.
 */
const WORLD_LABELS: Record<TrollRunWorldId, { label: string; hint: string }> = {
  pits: { label: 'The Pits', hint: 'Collapsing floors' },
  doors: { label: 'Doors', hint: 'Runaway exits' },
  gravity: { label: 'Gravity', hint: 'Ceiling runs' },
  gauntlet: { label: 'Gauntlet', hint: 'Every trap' },
}

export const TROLL_RUN_WORLD_OPTIONS = TROLL_RUN_WORLD_IDS.map((value) => ({
  value,
  label: WORLD_LABELS[value].label,
  hint: WORLD_LABELS[value].hint,
}))
