/**
 * Create-screen templates — lets a host save their current settings for a game
 * type into one of a small number of local slots (A, B, …) and reapply them
 * next time they create that game type, instead of re-entering every option.
 *
 * Purely client-side (localStorage) for now — there are no accounts yet. Keyed
 * by game type (not game code), so each game type has its own independent set
 * of slots. `MAX_TEMPLATE_SLOTS` is the free-tier slot count; once accounts +
 * paid tiers exist this can become account-driven without touching callers —
 * the shape here (a fixed-length array of slots) is designed to map cleanly
 * onto an account-backed store later.
 */

export const MAX_TEMPLATE_SLOTS = 2
export const TEMPLATE_SCHEMA_VERSION = 1

export interface GameTemplate {
  /** Custom name, or falls back to "Template A" / "Template B" in the UI. */
  name: string
  /** epoch ms — when this slot was last saved. */
  savedAt: number
  /** Schema version of `values` — lets us drop stale/incompatible saves later. */
  version: number
  /** Captured field values, keyed by the create screen's template-field registry. */
  values: Record<string, unknown>
}

export type TemplateSlots = (GameTemplate | null)[]

const templatesKey = (gameType: string) => `fateround_game_templates_${gameType}`

function emptySlots(): TemplateSlots {
  return Array.from({ length: MAX_TEMPLATE_SLOTS }, () => null)
}

/** Reads all slots for a game type. Always returns an array of length MAX_TEMPLATE_SLOTS. */
export function getTemplates(gameType: string): TemplateSlots {
  if (typeof window === 'undefined') return emptySlots()
  try {
    const raw = localStorage.getItem(templatesKey(gameType))
    if (!raw) return emptySlots()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return emptySlots()
    const slots = emptySlots()
    for (let i = 0; i < MAX_TEMPLATE_SLOTS; i++) {
      const entry = parsed[i]
      if (
        entry &&
        typeof entry === 'object' &&
        typeof entry.name === 'string' &&
        typeof entry.savedAt === 'number' &&
        entry.version === TEMPLATE_SCHEMA_VERSION &&
        entry.values &&
        typeof entry.values === 'object'
      ) {
        slots[i] = entry as GameTemplate
      }
    }
    return slots
  } catch {
    return emptySlots()
  }
}

/** Saves (or overwrites) the template in a given slot index (0-based). */
export function saveTemplate(gameType: string, slot: number, template: Omit<GameTemplate, 'version'>): void {
  if (typeof window === 'undefined') return
  if (slot < 0 || slot >= MAX_TEMPLATE_SLOTS) return
  try {
    const slots = getTemplates(gameType)
    slots[slot] = { ...template, version: TEMPLATE_SCHEMA_VERSION }
    localStorage.setItem(templatesKey(gameType), JSON.stringify(slots))
  } catch {
    // localStorage can throw in private mode / when full — saving is best-effort.
  }
}

/** Clears a single slot. */
export function deleteTemplate(gameType: string, slot: number): void {
  if (typeof window === 'undefined') return
  if (slot < 0 || slot >= MAX_TEMPLATE_SLOTS) return
  try {
    const slots = getTemplates(gameType)
    slots[slot] = null
    localStorage.setItem(templatesKey(gameType), JSON.stringify(slots))
  } catch {
    // best-effort, see above
  }
}

/** First empty slot index, or null if every slot is taken. */
export function firstFreeSlot(slots: TemplateSlots): number | null {
  const i = slots.findIndex((s) => s === null)
  return i === -1 ? null : i
}

export function slotLabel(index: number): string {
  return `Template ${String.fromCharCode(65 + index)}` // A, B, C, ...
}

export function formatTemplateSavedAt(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

// Human labels for house-rule-ish boolean/enum fields in the create screen's TEMPLATE_FIELDS
// registry (src/app/create/page.tsx). This is a "nice label" lookup only, NOT a source of
// truth for what gets shown — summarizeTemplate below always shows every captured field (via
// the generic fallbacks), so a field missing from this map still appears, just with an
// auto-generated label instead of a hand-written one. That's deliberate: we don't want a new
// per-game field to silently vanish from summaries just because nobody remembered to list it
// here (that's exactly how "6 players · 45s turn timer" ended up hiding Monopoly's game
// length being unset — the old version only special-cased known keys).
const FIELD_LABELS: Record<string, string> = {
  uno_wd4_challenge: 'WD4 challenge',
  uno_zero_seven: '0-7 rule',
  uno_stacking: 'Stacking',
  uno_jump_in: 'Jump-In',
  uno_team_mode: 'Team mode',
  whot_pick3_enabled: 'Pick 3',
  whot_pick2_stacking: 'Stack Pick 2',
  whot_cards_enabled: 'WHOT cards',
  whot_number_calls_enabled: 'Numbers on WHOT',
  crazy8_action_cards: 'Action cards',
  crazy8_jokers: 'Jokers',
  crazy8_pick2_stacking: 'Stack Pick 2',
  gender_based: 'Gender-based',
  codewords_player_picks: 'Players pick operative',
  codewords_randomize_teams: 'Randomize teams',
  landmine_originality: 'Originality bonus',
  landmine_review: 'Review before reveal',
  mafia_advanced_mode: 'Advanced roles',
  mafia_anonymous_votes: 'Anonymous votes',
  elimination_enabled: 'Elimination',
}

// Friendlier labels for common enum/string fields shared across many poll/puzzle game types,
// so e.g. "Participant Mode: Joiners" reads as "Join mode: Joiners" instead.
const STRING_FIELD_LABELS: Record<string, string> = {
  participant_mode: 'Join mode',
  pair_vote_mode: 'Vote mode',
  quick_draw_variant: 'Mode',
  quick_draw_play_mode: 'Team mode',
  word_rush_mode: 'Mode',
  word_rush_prompt_mode: 'Prompts',
  word_rush_difficulty: 'Difficulty',
  describe_it_mode: 'Mode',
  wst_quote_source: 'Quotes from',
  elimination_mode: 'Elimination mode',
  elimination_rule: 'Elimination rule',
}

// Defaults for the fields above, so a template only mentions a toggle when it's NOT the usual
// setting (otherwise every Whot template would list "Pick 3 · Stack Pick 2 · WHOT cards..."
// since those default on). A boolean field with no entry here is assumed to default `false` —
// so an unlisted future toggle still surfaces automatically the moment it's turned on.
const FIELD_DEFAULTS: Record<string, unknown> = {
  uno_wd4_challenge: true,
  whot_pick3_enabled: true,
  whot_pick2_stacking: true,
  whot_cards_enabled: true,
  whot_number_calls_enabled: true,
  crazy8_action_cards: true,
  crazy8_pick2_stacking: true,
  gender_based: true,
  codewords_player_picks: true,
  landmine_originality: true,
  landmine_review: true,
  mafia_anonymous_votes: true,
  mafia_advanced_mode: false,
}

const UNO_MULTI_PLAY_LABELS: Record<string, string> = {
  same_color_or_number: 'Multi-play: colour or number',
  same_color: 'Multi-play: colour only',
  same_number: 'Multi-play: number only',
}

// The elimination_* detail fields (mode/rule/counts) are only meaningful once elimination_enabled
// is true — otherwise every trivia/i_call_on/two_truths template would list an elimination
// configuration it isn't actually using.
const ELIMINATION_DETAIL_KEYS = new Set([
  'elimination_mode',
  'elimination_rule',
  'elimination_eliminate_count',
  'elimination_score_threshold',
  'elimination_starting_lives',
])

const LATE_JOIN_LABELS: Record<string, string> = {
  lobby_only: 'Lobby only',
  viewers_only: 'Viewers only',
  viewers_and_players: 'Viewers & players',
}

function humanize(text: string): string {
  return text.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDurationShort(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`
  if (seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}

/**
 * One-line summary of a saved template's values, for display. Walks every captured field
 * (not a curated subset) so a setting is never silently missing — max players / turn timer /
 * game length always show (with an explicit "No limit"/"No turn timer" when unset, rather than
 * disappearing), booleans show when they differ from their known default, and anything else
 * captured but not explicitly labeled still falls back to an auto-humanized "Key: value" bit
 * instead of being dropped.
 */
export function summarizeTemplate(values: Record<string, unknown>): string {
  const distinguishing: string[] = []
  const baseline: string[] = []

  const maxPlayersKey = Object.keys(values).find((k) => k.endsWith('max_players'))
  const gameDurationKey = Object.keys(values).find((k) => k.endsWith('game_duration'))

  for (const [key, value] of Object.entries(values)) {
    if (key === maxPlayersKey || key === gameDurationKey || key === 'timer_seconds' || key === 'rounds_count') continue
    if (ELIMINATION_DETAIL_KEYS.has(key) && values.elimination_enabled !== true) continue

    if (key === 'is_public') {
      if (value === true) distinguishing.push('Public')
      continue
    }
    if (key === 'theme') {
      if (typeof value === 'string') distinguishing.push(`Theme: ${humanize(value)}`)
      continue
    }
    if (key === 'late_join_policy') {
      if (typeof value === 'string') distinguishing.push(`Late joiners: ${LATE_JOIN_LABELS[value] ?? humanize(value)}`)
      continue
    }
    if (key === 'host_will_play') {
      distinguishing.push(value ? 'Host + play' : 'Host only')
      continue
    }
    if (key === 'mafia_advanced_mode') {
      distinguishing.push(value ? 'Advanced roles' : 'Classic roles')
      continue
    }
    if (key === 'host_name') {
      if (typeof value === 'string' && value.trim()) distinguishing.push(`Hosting as: ${value.trim()}`)
      continue
    }
    if (key === 'uno_multi_play_mode') {
      if (typeof value === 'string' && value !== 'off')
        distinguishing.push(UNO_MULTI_PLAY_LABELS[value] ?? humanize(value))
      continue
    }
    if (key === 'uno_uno_penalty') {
      if (value === 4) distinguishing.push('Draw 4 penalty')
      continue
    }
    if (typeof value === 'boolean') {
      const label = FIELD_LABELS[key] ?? humanize(key)
      const isDefault = key in FIELD_DEFAULTS ? value === FIELD_DEFAULTS[key] : value === false
      if (isDefault) continue
      distinguishing.push(value ? label : `${label} off`)
      continue
    }
    if (typeof value === 'string' && value) {
      distinguishing.push(`${STRING_FIELD_LABELS[key] ?? humanize(key)}: ${humanize(value)}`)
      continue
    }
    if (typeof value === 'number') {
      distinguishing.push(`${humanize(key)}: ${value}`)
    }
  }

  if (maxPlayersKey && typeof values[maxPlayersKey] === 'number') baseline.push(`${values[maxPlayersKey]} players`)
  if (typeof values.rounds_count === 'number') baseline.push(`${values.rounds_count} rounds`)
  if (typeof values.timer_seconds === 'number')
    baseline.push(values.timer_seconds ? `${values.timer_seconds}s turn timer` : 'No turn timer')
  // Always shown, even at 0 — a duration of 0 means "no limit", not "nothing to report".
  if (gameDurationKey && typeof values[gameDurationKey] === 'number')
    baseline.push(
      values[gameDurationKey] ? `${formatDurationShort(values[gameDurationKey] as number)} game length` : 'No limit'
    )

  // Lead with what's distinctive; fill remaining room with the baseline info.
  // No cap — every captured field must be representable here (a template can apply settings
  // "Use & create" never shows a review step for, so nothing may be silently left out).
  return [...distinguishing, ...baseline].join(' · ') || 'Saved settings'
}
