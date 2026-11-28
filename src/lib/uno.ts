import type { SupabaseClient } from '@supabase/supabase-js'
import { INTERNAL_ERROR_MESSAGE, internalErrorMessage } from '@/lib/api-errors'
import { clearSessionTables } from './session-clear'
import { callFinishRpc, roundPayload, type FinishResult, type FinishRound } from '@/lib/finish-session'
import { secondsUntilDeadline } from '@/lib/round-timing'
import type { Game, UnoCard, UnoCardColor, UnoColor, UnoPlayerHand, UnoSession } from '@/types'
import { UNO_DEFAULT_MAX_PLAYERS, UNO_MAX_PLAYERS, UNO_MIN_PLAYERS } from '@/lib/player-limits'
export { UNO_DEFAULT_MAX_PLAYERS, UNO_MAX_PLAYERS, UNO_MIN_PLAYERS }

/** Cards dealt to each player at the start of a hand. */
export const UNO_DEAL_COUNT = 7

/** Whole-game session length (seconds). 0 = no limit. */
export const UNO_GAME_DURATION_OPTIONS = [0, 600, 900, 1800, 2700, 3600, 5400] as const

/** The four playable colours (excludes the colourless `wild` slot). */
export const UNO_COLORS: UnoColor[] = ['red', 'yellow', 'green', 'blue']

export const UNO_COLOR_LABELS: Record<UnoColor, string> = {
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
}

/** Hex accents for each colour — mirrored by the CSS card faces (kept here for status copy/tests). */
export const UNO_COLOR_HEX: Record<UnoColor, string> = {
  red: '#ef4444',
  yellow: '#f59e0b',
  green: '#22c55e',
  blue: '#3b82f6',
}

// ── Rules ───────────────────────────────────────────────────────────────────────
export type UnoMode = 'classic' | 'no_mercy'
export type UnoNoMercyWin = 'first_out' | 'last_standing'

/** Mercy rule: hitting this many cards in No Mercy knocks the player out. */
export const UNO_MERCY_HAND_LIMIT = 25

export type UnoRules = {
  /** Top-level UNO shape. */
  mode: UnoMode
  /** Allow challenging a Wild Draw Four. Forced OFF in No Mercy. */
  wd4Challenge: boolean
  /** Cards drawn for a missed "UNO" call. */
  unoPenalty: number
  /** Cards a failed challenger draws. */
  wd4ChallengePenalty: number
  /** 0 = all hands pass in play direction; 7 = swap hands with a chosen player.
   *  Forced ON in No Mercy. */
  zeroSeven: boolean
  /** Allow stacking Draw cards. Forced ON in No Mercy (cross-kind equal-or-higher chaining). */
  stacking: boolean
  /** Multi-Play grouping rule (lay several matching cards in one turn). */
  multiPlay: UnoMultiPlayMode
  /** 2v2 Team-Up mode: a team wins the moment either member empties their hand.
   *  Forced OFF in No Mercy. */
  teamMode: boolean
  /** Jump-In: any player may play an exact-match card out of turn (same colour + value/symbol). */
  jumpIn: boolean
  /** No Mercy: how the round ends. Ignored in Classic. */
  noMercyWin: UnoNoMercyWin
}

/** Team-Up requires exactly this many players (2 teams of 2). */
export const UNO_TEAM_PLAYERS = 4

/**
 * Team-Up teams are derived from seating parity: turn_order alternates A–B–A–B, so seats at
 * even indices are team 0 and odd indices are team 1. Returns the team (0/1) for a player, or
 * null if they're not seated.
 */
export function unoTeamIndex(turnOrder: string[], playerId: string): 0 | 1 | null {
  const i = (turnOrder ?? []).indexOf(playerId)
  if (i < 0) return null
  return (i % 2) as 0 | 1
}

/** The player id of `playerId`'s teammate (same parity, other seat), or null. */
export function unoTeammateId(turnOrder: string[], playerId: string): string | null {
  const order = turnOrder ?? []
  const i = order.indexOf(playerId)
  if (i < 0) return null
  return order.find((id, j) => j !== i && j % 2 === i % 2) ?? null
}

/** Ids of players who left mid-round — kept in turn_order (parity) but skipped by play + placement. */
export function unoLeftPlayerIds(session: Pick<UnoSession, 'left_player_ids'>): string[] {
  return (session.left_player_ids as string[] | undefined) ?? []
}

/**
 * Seats on `playerId`'s Team-Up team that are still in the round — not left, still holding cards.
 * Used to decide, after a leave, whether a teammate remains (prompt to continue/forfeit) or the
 * whole team is gone (the other team wins).
 */
export function unoActiveTeammates(
  turnOrder: string[],
  hands: UnoPlayerHand[],
  leftIds: string[],
  playerId: string
): string[] {
  const i = (turnOrder ?? []).indexOf(playerId)
  if (i < 0) return []
  const left = new Set(leftIds)
  return (turnOrder ?? []).filter((id, j) => j !== i && j % 2 === i % 2 && !left.has(id) && unoHandCount(hands, id) > 0)
}

/**
 * Did `playerId` win this round? True for the winner, and — in Team-Up — also for
 * the winner's teammate (both partners share the win, so both belong on the
 * community leaderboard).
 */
export function unoPlayerSharesWin(
  turnOrder: string[],
  winnerId: string | null | undefined,
  playerId: string | null | undefined,
  teamMode: boolean
): boolean {
  if (!winnerId || !playerId) return false
  if (winnerId === playerId) return true
  return teamMode && unoTeammateId(turnOrder ?? [], winnerId) === playerId
}

/** Multi-Play grouping rule. `off` = Classic (one card per turn). */
export type UnoMultiPlayMode = 'off' | 'same_color' | 'same_number' | 'same_color_or_number'

const MULTI_PLAY_MODES: UnoMultiPlayMode[] = ['off', 'same_color', 'same_number', 'same_color_or_number']

export function parseMultiPlayMode(raw: unknown): UnoMultiPlayMode {
  return (MULTI_PLAY_MODES as readonly string[]).includes(String(raw)) ? (raw as UnoMultiPlayMode) : 'off'
}

export function parseUnoMode(raw: unknown): UnoMode {
  return raw === 'no_mercy' ? 'no_mercy' : 'classic'
}

export function parseUnoNoMercyWin(raw: unknown): UnoNoMercyWin {
  return raw === 'last_standing' ? 'last_standing' : 'first_out'
}

export function parseUnoRules(
  game:
    | Pick<
        Game,
        | 'uno_wd4_challenge'
        | 'uno_uno_penalty'
        | 'uno_wd4_challenge_penalty'
        | 'uno_zero_seven'
        | 'uno_stacking'
        | 'uno_multi_play_mode'
        | 'uno_team_mode'
        | 'uno_jump_in'
        | 'uno_mode'
        | 'uno_no_mercy_win'
      >
    | null
    | undefined
): UnoRules {
  const penalty = Number(game?.uno_uno_penalty ?? 2)
  const wd4Penalty = Number(game?.uno_wd4_challenge_penalty ?? 6)
  const mode = parseUnoMode(game?.uno_mode)
  const noMercy = mode === 'no_mercy'
  return {
    mode,
    // No Mercy: no WD4 challenge, always 0-7, always stacking, no Team-Up.
    wd4Challenge: noMercy ? false : game?.uno_wd4_challenge !== false,
    unoPenalty: penalty === 4 ? 4 : 2,
    wd4ChallengePenalty: wd4Penalty === 4 ? 4 : 6,
    zeroSeven: noMercy ? true : game?.uno_zero_seven === true,
    stacking: noMercy ? true : game?.uno_stacking === true,
    // Multi-Play is allowed in High Stakes too — same host-picked mode as Classic. The
    // earlier "forced off in HS" branch has been dropped per spec update.
    multiPlay: parseMultiPlayMode(game?.uno_multi_play_mode),
    teamMode: noMercy ? false : game?.uno_team_mode === true,
    // Jump-In is OFF in High Stakes. The extra chaos + out-of-turn plays don't compose
    // with the +6/+10 draws and knockouts — it made the mode unplayable in testing.
    jumpIn: noMercy ? false : game?.uno_jump_in === true,
    noMercyWin: parseUnoNoMercyWin(game?.uno_no_mercy_win),
  }
}

export function clampUnoGameDuration(raw: unknown): number {
  const n = Number(raw ?? 0)
  return (UNO_GAME_DURATION_OPTIONS as readonly number[]).includes(n) ? n : 0
}

export function formatUnoGameDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return 'No limit'
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds / 3600 === 1 ? '' : 's'}`
  return `${Math.round(seconds / 60)} minutes`
}

// ── Card helpers ──────────────────────────────────────────────────────────────
// Every "colourless" card kind — plays on any top card and, when it has a Draw value,
// carries pending penalties through choose_color. Draw 6 and Draw 10 belong here too:
// they were originally forgotten, which routed them through processUnoPlay's non-wild
// branch — that never opened the colour picker AND silently zeroed any pending Draw
// penalty they were supposed to stack onto (source of "I played +10 and it didn't stack
// / didn't ask a colour / opponent could play anything after").
const WILD_KINDS: UnoCard['kind'][] = [
  'wild',
  'wild_draw4',
  'wild_reverse_draw4',
  'wild_color_roulette',
  'draw6',
  'draw10',
]

export function isWildCard(card: UnoCard): boolean {
  return WILD_KINDS.includes(card.kind)
}

export function isActionCard(card: UnoCard): boolean {
  return (
    card.kind === 'skip' ||
    card.kind === 'reverse' ||
    card.kind === 'draw2' ||
    card.kind === 'discard_all' ||
    card.kind === 'skip_everyone'
  )
}

/** Draw penalty this kind carries when played / stacked. 0 = not a draw card. */
export function drawCardValue(kind: UnoCard['kind']): number {
  switch (kind) {
    case 'draw2':
      return 2
    case 'wild_draw4':
    case 'wild_reverse_draw4':
      return 4
    case 'draw6':
      return 6
    case 'draw10':
      return 10
    default:
      return 0
  }
}

export function isDrawCard(card: UnoCard): boolean {
  return drawCardValue(card.kind) > 0
}

const KIND_SHORT: Record<UnoCard['kind'], string> = {
  number: '',
  skip: 'Skip',
  reverse: 'Reverse',
  draw2: '+2',
  wild: 'Wild',
  wild_draw4: '+4',
  discard_all: 'Discard Colour',
  skip_everyone: 'Skip All',
  draw6: '+6',
  draw10: '+10',
  wild_reverse_draw4: 'Reverse +4',
  wild_color_roulette: 'Roulette',
}

export function cardLabel(card: UnoCard): string {
  if (card.kind === 'number') return `${UNO_COLOR_LABELS[card.color as UnoColor]} ${card.value}`
  if (card.kind === 'wild') return 'Wild'
  if (card.kind === 'wild_draw4') return 'Draw 4'
  if (card.kind === 'wild_reverse_draw4') return 'Reverse Draw 4'
  if (card.kind === 'wild_color_roulette') return 'Colour Roulette'
  if (card.kind === 'draw6') return 'Draw 6'
  if (card.kind === 'draw10') return 'Draw 10'
  return `${UNO_COLOR_LABELS[card.color as UnoColor]} ${KIND_SHORT[card.kind]}`
}

export function cardShortLabel(card: UnoCard): string {
  if (card.kind === 'number') return String(card.value)
  return KIND_SHORT[card.kind]
}

/** Points a card is worth when tallying hands at game end (lowest wins). */
export function cardPoints(card: UnoCard): number {
  if (card.kind === 'number') return card.value ?? 0
  if (isWildCard(card)) return 50
  return 20 // coloured action card
}

export function unoHandSum(cards: UnoCard[]): number {
  return cards.reduce((sum, card) => sum + cardPoints(card), 0)
}

/** Build the standard 108-card UNO deck. */
export function buildUnoDeck(): UnoCard[] {
  const deck: UnoCard[] = []
  for (const color of UNO_COLORS) {
    // One 0, two each of 1–9.
    deck.push({ id: `${color}-0`, color, kind: 'number', value: 0 })
    for (let value = 1; value <= 9; value += 1) {
      deck.push({ id: `${color}-${value}-a`, color, kind: 'number', value })
      deck.push({ id: `${color}-${value}-b`, color, kind: 'number', value })
    }
    // Two each of Skip / Reverse / Draw Two.
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      deck.push({ id: `${color}-${kind}-a`, color, kind })
      deck.push({ id: `${color}-${kind}-b`, color, kind })
    }
  }
  // Four Wild + four Wild Draw Four.
  for (let i = 0; i < 4; i += 1) {
    deck.push({ id: `wild-${i}`, color: 'wild', kind: 'wild' })
    deck.push({ id: `wild4-${i}`, color: 'wild', kind: 'wild_draw4' })
  }
  return deck
}

/**
 * Build the 168-card UNO "Show 'em No Mercy" deck. Starts from the 108-card classic
 * (minus the plain Wild — Colour Roulette replaces it here since the two looked
 * interchangeable at the table) and layers on the No-Mercy-only cards. Card counts
 * per new kind are picked so the total still lands at 168:
 *
 *   Discard All          — 1 per colour  =  4
 *   Skip Everyone        — 2 per colour  =  8
 *   Wild Reverse Draw 4  — 12
 *   Wild Draw 6          — 12
 *   Wild Draw 10         — 12
 *   Wild Color Roulette  — 16   (was 12; +4 to backfill the removed plain Wilds)
 *   ─────────────────────────────────── + 64
 *   Base UNO deck − plain Wild — 104
 *   ═════════════════════════════════ = 168
 */
export function buildNoMercyDeck(): UnoCard[] {
  // Plain Wild is dropped here; every "pick a colour" surface in HS goes through
  // Colour Roulette (the wild+colour-choice surface players already know), so the
  // classic Wild's own "just change colour" beat isn't reachable in HS.
  const deck = buildUnoDeck().filter((c) => c.kind !== 'wild')
  for (const color of UNO_COLORS) {
    deck.push({ id: `${color}-discard_all`, color, kind: 'discard_all' })
    deck.push({ id: `${color}-skip_everyone-a`, color, kind: 'skip_everyone' })
    deck.push({ id: `${color}-skip_everyone-b`, color, kind: 'skip_everyone' })
  }
  for (let i = 0; i < 12; i += 1) {
    deck.push({ id: `wildrev4-${i}`, color: 'wild', kind: 'wild_reverse_draw4' })
    deck.push({ id: `wild6-${i}`, color: 'wild', kind: 'draw6' })
    deck.push({ id: `wild10-${i}`, color: 'wild', kind: 'draw10' })
  }
  // 16 Roulettes (12 originals + 4 replacements for the removed plain Wilds), keeps
  // the deck at the documented 168-card total.
  for (let i = 0; i < 16; i += 1) {
    deck.push({ id: `wildroul-${i}`, color: 'wild', kind: 'wild_color_roulette' })
  }
  return deck
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function currentPlayerId(session: UnoSession): string | null {
  const order = session.turn_order ?? []
  if (order.length === 0) return null
  const len = order.length
  return order[((session.current_turn_index % len) + len) % len] ?? null
}

export function unoTurnDeadline(timerSeconds: number): string | null {
  if (!timerSeconds || timerSeconds <= 0) return null
  return new Date(Date.now() + timerSeconds * 1000).toISOString()
}

export function unoSecondsLeft(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000))
}

export function specialCardMessage(card: UnoCard): string | null {
  switch (card.kind) {
    case 'skip':
      return 'Skip — next player loses their turn'
    case 'reverse':
      return 'Reverse — direction of play flips'
    case 'draw2':
      return 'Draw 2 — next player draws 2 and loses their turn'
    case 'wild':
      return 'Wild — choose a colour'
    case 'wild_draw4':
      return 'Draw 4 — next player draws 4 and loses their turn'
    case 'discard_all':
      return 'Discard Colour — drop every matching-colour card in your hand'
    case 'skip_everyone':
      return 'Skip All — everyone else is skipped, go again'
    case 'draw6':
      return 'Draw 6 — next player draws 6 and loses their turn'
    case 'draw10':
      return 'Draw 10 — next player draws 10 and loses their turn'
    case 'wild_reverse_draw4':
      return 'Reverse Draw 4 — reverse, then next player draws 4'
    case 'wild_color_roulette':
      return 'Colour Roulette — next player picks a colour and draws until they hit it'
    default:
      return null
  }
}

/** Colour the current top card / call demands the next player match. */
export function activeColor(session: UnoSession): UnoColor | null {
  if (session.required_color) return session.required_color
  const top = session.top_card
  if (!top || top.color === 'wild') return null
  return top.color as UnoColor
}

export function canPlayCard(card: UnoCard, session: UnoSession): boolean {
  // A pending forced draw must be taken — unless a stack card is played. Classic stacking is
  // same-kind only (draw2-on-draw2, wild_draw4-on-wild_draw4). No Mercy stacking is value-based:
  // any Draw card whose value is >= the pending value can stack.
  if ((session.draw_penalty ?? 0) > 0) {
    const pendingKind = session.draw_penalty_kind
    if (!pendingKind) return false
    const cardVal = drawCardValue(card.kind)
    if (cardVal === 0) return false
    if (card.kind === pendingKind) return true
    // Cross-kind stacking (No Mercy). The new draw kinds only exist in a No Mercy deck.
    if (card.kind === 'draw6' || card.kind === 'draw10' || card.kind === 'wild_reverse_draw4') {
      return cardVal >= drawCardValue(pendingKind)
    }
    // For classic-only kinds ('draw2' / 'wild_draw4') a mismatched pending kind is illegal.
    return false
  }

  // Wild cards play on anything, anytime.
  if (isWildCard(card)) return true

  const reqColor = session.required_color
  if (reqColor) return card.color === reqColor

  const top = session.top_card
  if (!top) return true
  if (top.color === 'wild' && !reqColor) return true // shouldn't happen (colour is always chosen)

  if (card.color === top.color) return true
  if (card.kind === 'number' && top.kind === 'number') return card.value === top.value
  if (card.kind !== 'number' && card.kind === top.kind) return true // matching symbol (Skip on Skip, etc.)
  return false
}

/**
 * Jump-In eligibility: `card` is an EXACT match for the settled top card — same colour AND same
 * number (for number cards) or same symbol (Skip/Reverse/Draw Two). Wild and Wild Draw Four are
 * never eligible (no fixed colour/number to match). A different colour or a different value/symbol
 * does not qualify.
 */
export function isJumpInMatch(card: UnoCard, top: UnoCard | null): boolean {
  if (!top) return false
  if (isWildCard(card) || isWildCard(top)) return false
  if (card.color !== top.color) return false
  if (card.kind === 'number' && top.kind === 'number') return card.value === top.value
  return card.kind !== 'number' && card.kind === top.kind
}

export function playPenaltyError(card: UnoCard, session: UnoSession): string | null {
  const penalty = session.draw_penalty ?? 0
  if (penalty <= 0) return null
  if (canPlayCard(card, session)) return null // a legal stack
  const kind = session.draw_penalty_kind
  if (kind === 'draw2') return `Draw ${penalty} — stack with a Draw 2 (or higher in High Stakes)`
  if (kind === 'wild_draw4') return `Draw ${penalty} — stack with a Draw 4 (or higher in High Stakes)`
  return `Draw ${penalty} — stack with a Draw card of equal or higher value`
}

export function hasPlayableCard(hand: UnoCard[], session: UnoSession): boolean {
  return hand.some((c) => canPlayCard(c, session))
}

// ── Multi-Play ──────────────────────────────────────────────────────────────────
/** A card that can be part of a Multi-Play set (wilds are colourless — must be played alone). */
export function isMultiPlayableCard(card: UnoCard): boolean {
  return !isWildCard(card)
}

/** Do these cards form a legal Multi-Play group under the mode? Order-independent. */
export function multiSetGroupingOk(cards: UnoCard[], mode: UnoMultiPlayMode): boolean {
  if (mode === 'off' || cards.length < 2) return false
  if (cards.some((c) => isWildCard(c))) return false
  const first = cards[0]!
  const allSameColor = cards.every((c) => c.color === first.color)
  const allSameValue = cards.every((c) => c.kind === 'number' && c.value === first.value)
  if (mode === 'same_color') return allSameColor
  if (mode === 'same_number') return allSameValue
  return allSameColor || allSameValue // same_color_or_number
}

/**
 * Validate a Multi-Play. `cards` are IN PLAY ORDER — the FIRST must legally match the top of
 * the discard, and every card must satisfy the grouping rule. Returns an error string or null.
 */
export function validateMultiSet(cards: UnoCard[], session: UnoSession, mode: UnoMultiPlayMode): string | null {
  if (mode === 'off') return 'Multi-Play is off'
  if ((session.draw_penalty ?? 0) > 0) return 'Resolve the draw penalty first'
  if (cards.length < 2) return 'Select at least two cards'
  if (cards.some((c) => isWildCard(c))) return 'Wild cards must be played on their own'
  if (!multiSetGroupingOk(cards, mode)) {
    return mode === 'same_color'
      ? 'All cards must be the same colour'
      : mode === 'same_number'
        ? 'All cards must be the same number'
        : 'All cards must share a colour or a number'
  }
  if (!canPlayCard(cards[0]!, session)) return 'The first card must match the top card'
  return null
}

export function unoHandCount(hands: UnoPlayerHand[], playerId: string): number {
  return ((hands.find((h) => h.player_id === playerId)?.cards as UnoCard[]) ?? []).length
}

/** True when the player has no cards left and is watching the rest of the game. */
export function isUnoPlayerOut(handCount: number, spectator?: boolean | null): boolean {
  return handCount === 0 || spectator === true
}

/**
 * Advance `steps` active players from `fromIndex` in `direction` (1 forward,
 * -1 reversed), skipping players who are out of cards or knocked out by the
 * High Stakes 25-card limit.
 */
export function unoNextTurnIndex(
  session: UnoSession,
  hands: UnoPlayerHand[],
  fromIndex: number,
  steps: number,
  direction: number
): number {
  const order = session.turn_order ?? []
  const len = order.length
  if (len === 0) return 0
  const dir = direction < 0 ? -1 : 1
  const eliminated = new Set<string>((session.eliminated_player_ids as string[] | null) ?? [])
  // A Team-Up leaver stays in turn_order (seat parity) and is marked left BEFORE the hand row is deleted: the marker,
  // not the later hand deletion, is what takes them out of the rotation.
  const left = new Set<string>(unoLeftPlayerIds(session))

  let idx = fromIndex
  for (let s = 0; s < steps; s += 1) {
    let advanced = false
    for (let attempt = 0; attempt < len; attempt += 1) {
      idx = (((idx + dir) % len) + len) % len
      const pid = order[idx]!
      if (!eliminated.has(pid) && !left.has(pid) && unoHandCount(hands, pid) > 0) {
        advanced = true
        break
      }
    }
    if (!advanced) return fromIndex
  }
  return idx
}

function activePlayerCount(session: UnoSession, hands: UnoPlayerHand[]): number {
  const eliminated = new Set<string>((session.eliminated_player_ids as string[] | null) ?? [])
  const left = new Set<string>(unoLeftPlayerIds(session))
  return (session.turn_order ?? []).filter((id) => !eliminated.has(id) && !left.has(id) && unoHandCount(hands, id) > 0)
    .length
}

export function anyPlayerCanPlay(hands: UnoPlayerHand[], session: UnoSession): boolean {
  // A hand counts only for a seat that is still in the round: seated in turn_order (a leave removes the seat BEFORE it
  // deletes the hand row) and, for Team-Up where a departed seat stays in turn_order, not marked left.
  const left = new Set<string>(unoLeftPlayerIds(session))
  const seated = new Set<string>(session.turn_order ?? [])
  for (const row of hands) {
    if (left.has(row.player_id) || !seated.has(row.player_id)) continue
    const cards = (row.cards as UnoCard[]) ?? []
    if (cards.length === 0) continue
    if (hasPlayableCard(cards, session)) return true
  }
  return false
}

/**
 * Shared by the server (full row, service role) and the client (redacted row: `draw_pile` and
 * `discard_pile` are revoked from anon/authenticated, only the generated counts come back).
 *
 * Prefer the counts; fall back to the array lengths for service-role rows and fixtures written
 * before the counts existed. Where NEITHER is readable, return `false` — "I cannot see the pile"
 * must never be reported as "the pile is empty", which would flip live games into pass-turn and
 * reshuffle states on a redacted field read as meaningful state.
 */
export function isDrawPileDepleted(session: UnoSession): boolean {
  const drawLen = session.draw_count ?? (Array.isArray(session.draw_pile) ? session.draw_pile.length : null)
  const discardLen = session.discard_count ?? (Array.isArray(session.discard_pile) ? session.discard_pile.length : null)
  if (drawLen == null || discardLen == null) return false
  return drawLen === 0 && discardLen === 0
}

// ── Standings / placement ───────────────────────────────────────────────────────
export type UnoStanding = {
  playerId: string
  name: string
  cardCount: number
  handSum: number
  rank: number
}

type UnoRankableHand = { player_id: string; cards: UnoCard[] | null }

/**
 * Final placement order (1st → last). Players who emptied their hand rank FIRST, in the
 * exact order they finished (`finishOrder`); everyone still holding cards follows, ordered
 * by lowest hand total then fewest cards. Mirrors crazyEightsPlacementOrder.
 *
 * `eliminatedPlayerIds` (No Mercy Mercy knockouts) are ALWAYS sorted after every live
 * player — a knocked-out seat can't win a timed game just because their hand summed to a
 * low value. Within the eliminated group they still sort by hand-sum for a stable order.
 */
export function unoPlacementOrder(
  hands: UnoRankableHand[],
  turnOrder: string[],
  finishOrder: string[],
  teamMode = false,
  leftPlayerIds: string[] = [],
  eliminatedPlayerIds: string[] = []
): string[] {
  const activeIds = new Set(turnOrder ?? [])
  const finished = (finishOrder ?? []).filter((id) => activeIds.has(id))
  const finishedSet = new Set(finished)
  const leftSet = new Set(leftPlayerIds)
  const eliminatedSet = new Set(eliminatedPlayerIds)

  // Team-Up: rank the winning team's two members first, then the losing team. The winning team
  // is whoever emptied a hand first, or — if a timer ended it — the lower combined hand total.
  // A member who left mid-round counts for nothing: excluded from the team total, and sorted to
  // the back of their group. If a whole team has left, the other team wins by default.
  const order = turnOrder ?? []
  if (teamMode && order.length === UNO_TEAM_PLAYERS) {
    const sumOf = (id: string) => unoHandSum((hands.find((h) => h.player_id === id)?.cards as UnoCard[]) ?? [])
    const teamActive = (parity: number) => order.filter((id, i) => i % 2 === parity && !leftSet.has(id))
    let winTeam: number
    if (finished.length > 0) winTeam = order.indexOf(finished[0]!) % 2
    else if (teamActive(0).length === 0) winTeam = 1
    else if (teamActive(1).length === 0) winTeam = 0
    else {
      const s0 = teamActive(0).reduce((s, id) => s + sumOf(id), 0)
      const s1 = teamActive(1).reduce((s, id) => s + sumOf(id), 0)
      winTeam = s0 <= s1 ? 0 : 1
    }
    // Players who left sort last within their group (they didn't finish the round).
    const byLeft = (a: string, b: string) => (leftSet.has(a) ? 1 : 0) - (leftSet.has(b) ? 1 : 0)
    const winners = order
      .filter((_, i) => i % 2 === winTeam)
      .sort(
        (a, b) =>
          byLeft(a, b) ||
          (finishedSet.has(b) ? 1 : 0) - (finishedSet.has(a) ? 1 : 0) ||
          sumOf(a) - sumOf(b) ||
          a.localeCompare(b)
      )
    const losers = order
      .filter((_, i) => i % 2 !== winTeam)
      .sort((a, b) => byLeft(a, b) || sumOf(a) - sumOf(b) || a.localeCompare(b))
    return [...winners, ...losers]
  }
  // Split the still-holding-cards group into LIVE seats (playable at time of
  // finalisation) and ELIMINATED seats (Mercy knockouts) so eliminated players always
  // sort behind every live player regardless of their hand-sum. Within each subgroup
  // the sort is identical: lowest hand-sum, then fewest cards, then id for stability.
  const stillHolding = hands
    .filter((h) => activeIds.has(h.player_id) && !finishedSet.has(h.player_id))
    .map((h) => {
      const cards = (h.cards as UnoCard[]) ?? []
      return {
        playerId: h.player_id,
        handSum: unoHandSum(cards),
        cardCount: cards.length,
        eliminated: eliminatedSet.has(h.player_id),
      }
    })
    .sort((a, b) => {
      if (a.handSum !== b.handSum) return a.handSum - b.handSum
      if (a.cardCount !== b.cardCount) return a.cardCount - b.cardCount
      return a.playerId.localeCompare(b.playerId)
    })
  const live = stillHolding.filter((r) => !r.eliminated).map((r) => r.playerId)
  const eliminated = stillHolding.filter((r) => r.eliminated).map((r) => r.playerId)
  return [...finished, ...live, ...eliminated]
}

export function buildUnoStandings(
  hands: UnoPlayerHand[],
  players: { id: string; name: string }[],
  turnOrder: string[],
  finishOrder: string[] = [],
  teamMode = false,
  leftPlayerIds: string[] = [],
  eliminatedPlayerIds: string[] = []
): UnoStanding[] {
  const activeIds = new Set(turnOrder ?? [])
  const byId = new Map(hands.filter((h) => activeIds.has(h.player_id)).map((h) => [h.player_id, h]))
  return unoPlacementOrder(hands, turnOrder, finishOrder, teamMode, leftPlayerIds, eliminatedPlayerIds).map(
    (playerId, index) => {
      const cards = (byId.get(playerId)?.cards as UnoCard[]) ?? []
      return {
        playerId,
        name: players.find((p) => p.id === playerId)?.name ?? 'Player',
        cardCount: cards.length,
        handSum: unoHandSum(cards),
        rank: index + 1,
      }
    }
  )
}

export function unoGameSessionExpired(
  sessionStartedAt: string | null | undefined,
  durationSeconds: number | null | undefined
): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false
  if (!sessionStartedAt) return false
  return secondsUntilDeadline(sessionStartedAt, durationSeconds) <= 0
}

// ── Deck / init ───────────────────────────────────────────────────────────────
function isStarterSpecial(card: UnoCard): boolean {
  return card.kind !== 'number'
}

/** Choose the colour the player holds most of — used to auto-name a colour on timeout. */
function dominantColor(hand: UnoCard[]): UnoColor {
  const counts: Record<UnoColor, number> = { red: 0, yellow: 0, green: 0, blue: 0 }
  for (const c of hand) {
    if (c.color !== 'wild') counts[c.color as UnoColor] += 1
  }
  return UNO_COLORS.reduce((best, color) => (counts[color] > counts[best] ? color : best), 'red')
}

function drawStarter(deck: UnoCard[]): { top: UnoCard; rest: UnoCard[] } {
  const pile = [...deck]
  // Prefer a plain number starter so the first turn has no action to resolve.
  const idx = pile.findIndex((c) => !isStarterSpecial(c))
  if (idx === -1) {
    const top = pile.pop()!
    return { top, rest: pile }
  }
  const [top] = pile.splice(idx, 1)
  return { top: top!, rest: pile }
}

export async function initializeUnoGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string }> {
  const { data: gameRow, error: gameError } = await supabase
    .from('games')
    .select('timer_seconds, uno_team_mode, uno_mode')
    .eq('id', gameId)
    .maybeSingle()
  // A failed settings read must not deal a Team-Up / No Mercy lobby as a classic game.
  if (gameError) return { error: internalErrorMessage('uno', gameError) }
  const timerSeconds = gameRow?.timer_seconds ?? 0
  const mode = parseUnoMode(gameRow?.uno_mode)
  const noMercy = mode === 'no_mercy'
  // No Mercy disables Team-Up (Mercy elimination replaces team-based winning).
  const teamMode = !noMercy && gameRow?.uno_team_mode === true

  if (teamMode && playerIds.length !== UNO_TEAM_PLAYERS) {
    return { error: `Team-Up needs exactly ${UNO_TEAM_PLAYERS} players (2 teams of 2)` }
  }

  // Team-Up: randomly pair the 4 players into two teams, then seat them alternating
  // (A–B–A–B) so teammates sit across and team = seat parity in turn_order.
  const turnOrder = teamMode
    ? (() => {
        const s = shuffle(playerIds)
        return [s[0]!, s[2]!, s[1]!, s[3]!]
      })()
    : shuffle(playerIds)
  const deck = shuffle(noMercy ? buildNoMercyDeck() : buildUnoDeck())

  const hands: UnoCard[][] = turnOrder.map(() => [])
  let drawPile = [...deck]

  for (let c = 0; c < UNO_DEAL_COUNT; c += 1) {
    for (let p = 0; p < turnOrder.length; p += 1) {
      const card = drawPile.pop()
      if (card) hands[p].push(card)
    }
  }

  const { top, rest } = drawStarter(drawPile)
  drawPile = rest

  const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
  const initNames = new Map<string, string>()
  for (const p of playerRows ?? []) initNames.set(p.id, p.name)

  const firstPlayerId = turnOrder[0]
  const firstName = firstPlayerId ? (initNames.get(firstPlayerId) ?? 'Player') : 'Player'
  const sessionRow: Partial<UnoSession> = {
    turn_order: turnOrder,
    current_turn_index: 0,
    direction: 1,
    phase: 'playing',
    draw_pile: drawPile,
    discard_pile: [],
    top_card: top,
    last_play_cards: null,
    required_color: null,
    draw_penalty: 0,
    pending_wild: null,
    challenge_prev_color: null,
    wd4_player_id: null,
    uno_pending_player: null,
    uno_called: false,
    status_message: `${firstName}'s turn — match ${cardLabel(top)}`,
    winner_player_id: null,
    finish_order: [],
    eliminated_player_ids: [],
    color_roulette_player_id: null,
    turn_deadline_at: unoTurnDeadline(timerSeconds),
  }

  const handRows = turnOrder.map((playerId, index) => ({
    player_id: playerId,
    cards: hands[index],
    player_order: index,
  }))

  // The start is ONE database transaction under the games row lock (start_uno_game): the previous deal is replaced, the
  // session and every hand are written, AND the game is flipped to `active`, together. There is no half-started room to
  // resume or to clean up (a failed start changes nothing and the next one deals again), a second overlapping start
  // finds the game no longer `waiting` and writes nothing, and a seat whose player row is gone is rejected up front.
  const { data, error } = await supabase.rpc('start_uno_game', {
    p_game_id: gameId,
    p_session_row: sessionRow,
    p_hand_rows: handRows,
  })
  if (error) return { error: internalErrorMessage('uno', error) }
  const outcome = (data ?? {}) as { status?: string; reason?: string }
  if (outcome.status === 'not_waiting') return { error: 'Game already in progress' }
  if (outcome.status !== 'started') {
    return {
      error: internalErrorMessage('uno', `start_uno_game rejected the call: ${outcome.reason ?? outcome.status}`),
    }
  }
  return {}
}

export async function clearUnoSessionData(supabase: SupabaseClient, gameId: string): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, ['uno_sessions', 'uno_player_hands'], {
    resetSpectators: true,
  })
}

// ── State loading ─────────────────────────────────────────────────────────────
async function loadGameState(
  supabase: SupabaseClient,
  gameId: string
): Promise<{
  /** Set when a state read FAILED (as opposed to succeeding with no row) — callers answer 500, not "not found". */
  error?: string
  session: UnoSession | null
  hands: UnoPlayerHand[]
  timerSeconds: number
  gameDurationSeconds: number
  sessionStartedAt: string | null
  rules: UnoRules
  playerNames: Map<string, string>
}> {
  // The hands are read AFTER the session, never alongside it. Every move commits its session version and its hands in
  // one transaction, so hands read after the session are the same version or a newer one; a newer one means the
  // version moved, and the claim the caller makes with this session's `updated_at` loses (nothing is written from a
  // mixed snapshot). Reading them in parallel could pair hands of an OLDER version with a newer session token.
  const sessionRes = await supabase.from('uno_sessions').select('*').eq('game_id', gameId).maybeSingle()
  const [handsRes, gameRes, playersRes] = await Promise.all([
    supabase.from('uno_player_hands').select('*').eq('game_id', gameId).order('player_order'),
    supabase
      .from('games')
      .select(
        'timer_seconds, game_duration_seconds, session_started_at, uno_wd4_challenge, uno_uno_penalty, uno_wd4_challenge_penalty, uno_zero_seven, uno_stacking, uno_multi_play_mode, uno_team_mode, uno_jump_in, uno_mode, uno_no_mercy_win'
      )
      .eq('id', gameId)
      .maybeSingle(),
    supabase.from('players').select('id, name').eq('game_id', gameId),
  ])

  const playerNames = new Map<string, string>()
  for (const p of playersRes.data ?? []) playerNames.set(p.id, p.name)

  const readError = sessionRes.error ?? handsRes.error ?? gameRes.error
  return {
    error: readError ? internalErrorMessage('uno', readError) : undefined,
    session: sessionRes.data as UnoSession | null,
    hands: (handsRes.data as UnoPlayerHand[]) ?? [],
    timerSeconds: gameRes.data?.timer_seconds ?? 0,
    gameDurationSeconds: gameRes.data?.game_duration_seconds ?? 0,
    sessionStartedAt: gameRes.data?.session_started_at ?? null,
    rules: parseUnoRules(gameRes.data),
    playerNames,
  }
}

function handForPlayer(hands: UnoPlayerHand[], playerId: string): UnoCard[] {
  const row = hands.find((h) => h.player_id === playerId)
  return (row?.cards as UnoCard[]) ?? []
}

function playerName(playerNames: Map<string, string>, playerId: string): string {
  return playerNames.get(playerId) ?? 'Player'
}

function refillDrawPile(
  drawPile: UnoCard[],
  discardPile: UnoCard[]
): { drawPile: UnoCard[]; discardPile: UnoCard[]; reshuffled: boolean } {
  if (drawPile.length > 0) return { drawPile, discardPile, reshuffled: false }
  if (discardPile.length === 0) return { drawPile, discardPile, reshuffled: false }
  return { drawPile: shuffle(discardPile), discardPile: [], reshuffled: true }
}

function drawCardsWithRefill(
  drawPile: UnoCard[],
  discardPile: UnoCard[],
  count: number
): { drawn: UnoCard[]; drawPile: UnoCard[]; discardPile: UnoCard[]; reshuffled: boolean } {
  let pile = [...drawPile]
  let discard = [...discardPile]
  let reshuffled = false
  const drawn: UnoCard[] = []

  for (let i = 0; i < count; i += 1) {
    if (pile.length === 0) {
      const refilled = refillDrawPile(pile, discard)
      pile = refilled.drawPile
      discard = refilled.discardPile
      if (refilled.reshuffled) reshuffled = true
    }
    if (pile.length === 0) break
    const card = pile.pop()
    if (card) drawn.push(card)
  }

  return { drawn, drawPile: pile, discardPile: discard, reshuffled }
}

/**
 * A player dropped to one card without calling "UNO". If they haven't satisfied the call by
 * the time the NEXT player acts, they draw the penalty. Returns the resulting piles plus the
 * penalised player's new hand, or null when there's nothing to settle.
 */
function settleMissedUno(
  session: UnoSession,
  hands: UnoPlayerHand[],
  actingPlayerId: string,
  rules: UnoRules,
  playerNames: Map<string, string>
): { drawPile: UnoCard[]; discardPile: UnoCard[]; playerId: string; hand: UnoCard[]; note: string } | null {
  const pending = session.uno_pending_player
  if (!pending || session.uno_called) return null
  if (pending === actingPlayerId) return null
  if (unoHandCount(hands, pending) === 0) return null

  const { drawn, drawPile, discardPile } = drawCardsWithRefill(
    (session.draw_pile as UnoCard[]) ?? [],
    (session.discard_pile as UnoCard[]) ?? [],
    rules.unoPenalty
  )
  if (drawn.length === 0) return null

  const hand = [...handForPlayer(hands, pending), ...drawn]
  return {
    drawPile,
    discardPile,
    playerId: pending,
    hand,
    note: `${playerName(playerNames, pending)} forgot to call last card — drew ${drawn.length}`,
  }
}

// ── Finish helpers ────────────────────────────────────────────────────────────
async function finishByLowestHand(
  supabase: SupabaseClient,
  gameId: string,
  session: UnoSession,
  hands: UnoPlayerHand[],
  playerNames: Map<string, string>,
  reasonPrefix: string,
  teamMode = false,
  // Writes that belong to this finish. Nothing is written before the finish claim wins: `patch` rides in the
  // claiming session UPDATE itself, and `handWrites` (the hands `hands` already reflects, e.g. a partial
  // penalty draw) are written only AFTER the claim, so a lost or failed claim leaves hands and piles untouched.
  extra?: {
    patch?: Partial<UnoSession>
    handWrites?: { playerId: string; cards: UnoCard[] }[]
    /** Stats-only writes (a knockout's attribution) and the spectator flags that belong to this finish. */
    statsWrites?: { player_id: string; stats: Record<string, number> }[]
    spectatorIds?: string[]
    round?: FinishRound
  }
): Promise<FinishResult> {
  const finishOrder = session.finish_order ?? []
  const leftIds = unoLeftPlayerIds(session)
  // No Mercy: knocked-out seats must never rank as the winner on a timed finish. Pass
  // the current eliminated list through so unoPlacementOrder sorts them behind every
  // live seat regardless of hand-sum.
  const eliminatedIds = (session.eliminated_player_ids as string[] | null) ?? []
  const placement = unoPlacementOrder(hands, session.turn_order ?? [], finishOrder, teamMode, leftIds, eliminatedIds)
  const winnerId = placement[0] ?? null
  const winnerName = winnerId ? playerName(playerNames, winnerId) : 'Nobody'

  let statusMessage: string
  if (teamMode && winnerId) {
    // The winner + their teammate share the round — unless the teammate left mid-round.
    const mate = unoTeammateId(session.turn_order ?? [], winnerId)
    const mateName = mate && !leftIds.includes(mate) ? playerName(playerNames, mate) : null
    statusMessage = mateName
      ? `${reasonPrefix} ${winnerName} & ${mateName} win!`
      : `${reasonPrefix} ${winnerName} wins!`
  } else {
    let detail = 'lowest hand total'
    if (winnerId && finishOrder.includes(winnerId)) {
      detail = 'emptied their hand first'
    } else if (winnerId) {
      const winnerHand = hands.find((h) => h.player_id === winnerId)
      detail = `lowest hand total (${unoHandSum((winnerHand?.cards as UnoCard[]) ?? [])})`
    }
    statusMessage = `${reasonPrefix} ${winnerName} wins — ${detail}.`
  }

  // The ranking is decided here (in memory, on the post-draw hands the caller passes); the finish itself is ONE
  // database transaction (see finish_uno_session): session + piles, final hands, series points, games flip.
  const eliminatedCount = (extra?.patch?.eliminated_player_ids ?? session.eliminated_player_ids ?? []).length
  return finishUnoRound(supabase, gameId, session, {
    patch: { ...extra?.patch, winner_player_id: winnerId, status_message: statusMessage },
    // One entry per player (the finish function rejects a duplicate): a player with both new cards and stats keeps both.
    hands: mergeHandWrites([
      ...(extra?.handWrites ?? []).map((w) => ({ player_id: w.playerId, cards: w.cards })),
      ...(extra?.statsWrites ?? []),
    ]),
    spectatorIds: extra?.spectatorIds,
    series: seriesAward(winnerId, hands, eliminatedCount, {
      turn_order: extra?.patch?.turn_order ?? session.turn_order,
      left_player_ids: extra?.patch?.left_player_ids ?? session.left_player_ids,
    }),
    round: extra?.round,
  })
}

/** Everything one finish writes, applied by `finish_uno_session` in a single transaction (or not at all). */
type UnoFinish = {
  /** Session columns to set (the function forces phase = finished and clears the deadline). */
  patch: Record<string, unknown>
  /** Final hand rows / stats, by player. */
  hands?: { player_id: string; cards?: UnoCard[]; stats?: Record<string, number> }[]
  /** The round's series award; the function adds it only while scoring is on and no series winner exists. */
  series?: { winner_id: string; points: number } | null
  spectatorIds?: string[]
  /** A leaver whose hand + players rows go in the same step. */
  removePlayerId?: string
  /** The round an expiry was decided about; the function answers `lost` for another round. */
  round?: FinishRound
}

async function finishUnoRound(
  supabase: SupabaseClient,
  gameId: string,
  session: { updated_at: string },
  o: UnoFinish
): Promise<FinishResult> {
  const { phase: _phase, updated_at: _updatedAt, turn_deadline_at: _deadline, ...patch } = o.patch
  void _phase
  void _updatedAt
  void _deadline
  return callFinishRpc(
    supabase,
    'finish_uno_session',
    {
      p_game_id: gameId,
      p_expected_updated_at: session.updated_at,
      p_session_patch: patch,
      p_hand_writes: o.hands ?? [],
      p_series: o.series ?? null,
      p_spectator_ids: o.spectatorIds ?? null,
      p_remove_player_id: o.removePlayerId ?? null,
      p_round: roundPayload(o.round),
    },
    'uno',
    gameId
  )
}

/** Action result for a finish that must end the request: error -> error, lost CAS -> skipped, landed -> success. */
function finishOutcome(finished: FinishResult): { error?: string; skipped?: boolean } {
  if (finished.error) return { error: finished.error }
  return finished.won ? {} : { skipped: true }
}

async function finalizeIfGameExpired(
  supabase: SupabaseClient,
  gameId: string,
  session: UnoSession,
  hands: UnoPlayerHand[],
  playerNames: Map<string, string>,
  sessionStartedAt: string | null,
  gameDurationSeconds: number,
  teamMode = false
): Promise<FinishResult | null> {
  if (session.phase === 'finished') return null
  if (!unoGameSessionExpired(sessionStartedAt, gameDurationSeconds)) return null
  // The expiry was decided from THIS round's start time: the finish applies only to that round.
  return finishByLowestHand(supabase, gameId, session, hands, playerNames, "Time's up!", teamMode, {
    round: { sessionStartedAt },
  })
}

/** The message of a manual action that found the round's timer expired and ended it. */
const UNO_TIMES_UP_ERROR = "Time's up — the game has ended"

/** Result for a move on a round whose timer expired: it was ended (error), lost the finish race (skipped) or just ended. */
function expiredPlayResult(expired: FinishResult): { error?: string; skipped?: boolean } {
  if (expired.error) return { error: expired.error }
  return expired.won ? { error: UNO_TIMES_UP_ERROR } : { skipped: true }
}

/**
 * Session patch for when `playerId` empties their hand this turn. Folded into the play
 * handler's single session write. `board` carries the board changes from the card played.
 */
function playerOutPatch(
  session: UnoSession,
  hands: UnoPlayerHand[],
  gameDurationSeconds: number,
  playerId: string,
  name: string,
  playerNames: Map<string, string>,
  board: Partial<UnoSession>,
  nextDirection: number,
  teamMode: boolean
): Partial<UnoSession> {
  const finishOrder = [...(session.finish_order ?? []), playerId]
  const winnerId = finishOrder[0]

  // Team-Up: the round ends the instant a member empties their hand — their team wins.
  if (teamMode) {
    const mate = unoTeammateId(session.turn_order ?? [], playerId)
    // A teammate who left mid-round isn't celebrated (the solo player wins for the team).
    const mateName = mate && !unoLeftPlayerIds(session).includes(mate) ? playerName(playerNames, mate) : null
    return {
      ...board,
      phase: 'finished',
      finish_order: finishOrder,
      winner_player_id: winnerId,
      status_message: mateName ? `${name} & ${mateName} win!` : `${name} wins!`,
    }
  }

  const eliminated = new Set<string>((session.eliminated_player_ids as string[] | null) ?? [])
  const leftIds = unoLeftPlayerIds(session)
  const remaining = (session.turn_order ?? []).filter(
    (id) => id !== playerId && !eliminated.has(id) && !leftIds.includes(id) && unoHandCount(hands, id) > 0
  )

  if (gameDurationSeconds <= 0 || remaining.length < 2) {
    return {
      ...board,
      phase: 'finished',
      finish_order: finishOrder,
      winner_player_id: winnerId,
      status_message: `${playerName(playerNames, winnerId)} wins!`,
    }
  }

  const nextIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1, nextDirection)
  const nextId = session.turn_order[nextIndex]
  const top = board.top_card ?? session.top_card
  const matchHint = top ? ` — match ${cardLabel(top)}` : ''
  return {
    ...board,
    current_turn_index: nextIndex,
    direction: nextDirection,
    phase: 'playing',
    finish_order: finishOrder,
    status_message: `${playerName(playerNames, nextId)}'s turn${matchHint} — ${name} is out (${remaining.length} left)`,
  }
}

type TurnAdvance = { nextIndex: number; direction: number }

/** Resolve where the turn goes after a NON-wild card is played (skip / reverse / plain). */
function resolveNextTurn(session: UnoSession, hands: UnoPlayerHand[], card: UnoCard): TurnAdvance {
  let direction = session.direction < 0 ? -1 : 1
  let steps = 1

  if (card.kind === 'reverse') {
    direction = -direction
    // With two active players Reverse acts as a Skip (the mover goes again).
    if (activePlayerCount(session, hands) <= 2) steps = 2
  } else if (card.kind === 'skip') {
    steps = 2
  } else if (card.kind === 'skip_everyone') {
    // Skip all other players — turn returns to the mover. Advance one full lap of active seats.
    steps = activePlayerCount(session, hands)
  }
  // Draw Two / Discard All advance 1 (Discard All just plays like a coloured card).

  const nextIndex = unoNextTurnIndex(session, hands, session.current_turn_index, steps, direction)
  return { nextIndex, direction }
}

/**
 * Turn resolution for a Multi-Play set (cards IN PLAY ORDER). Action cards resolve in sequence:
 * a Draw Two makes the *immediate* next player draw and lose their turn; a Skip then skips whoever
 * is up after that. So order matters — the Draw-Two penalty lands on the player reached after the
 * skips that come BEFORE it, and skips AFTER it push the turn further along.
 *
 * The card left on top wins (WYSIWYG): only the run of action cards laid AFTER the last non-action
 * (number) card counts. Covering your own Draw Two with a number settles the pile — the next player
 * just matches the number, no draw — so the demand always matches the visible top card.
 *
 * Returns:
 *  - `direction`   — play direction after any reverses.
 *  - `penalty`     — total Draw-Two cards owed (0 when the trailing run has no Draw Two).
 *  - `skipsBefore` — skip-steps (skip / 2-player reverse) laid down before the first Draw Two.
 *  - `skipsAfter`  — skip-steps laid down after the first Draw Two.
 *
 * The caller turns this into indices: the drawer sits `1 + skipsBefore` active seats ahead; when
 * there are `skipsAfter` skips the penalty is applied immediately and the turn advances past the
 * drawer + those skips (see processUnoPlayMulti). All Draw Twos accumulate onto the one drawer.
 */
export function resolveMultiPlayAdvance(
  cards: UnoCard[],
  session: Pick<UnoSession, 'direction'>,
  activeCount: number
): { direction: number; penalty: number; skipsBefore: number; skipsAfter: number } {
  const baseDirection = session.direction < 0 ? -1 : 1
  let direction = baseDirection
  let skipsBefore = 0
  let skipsAfter = 0
  let penalty = 0
  let seenDraw2 = false
  for (const c of cards) {
    if (c.kind === 'reverse') {
      // With ≤2 active players Reverse acts as a Skip; otherwise it just flips direction.
      if (activeCount <= 2) {
        if (seenDraw2) skipsAfter += 1
        else skipsBefore += 1
      } else {
        direction = -direction
      }
    } else if (c.kind === 'skip') {
      if (seenDraw2) skipsAfter += 1
      else skipsBefore += 1
    } else if (c.kind === 'draw2') {
      seenDraw2 = true
      penalty += 2
    } else {
      // A non-action (number) card settles the pile: everything laid before it is covered and
      // cancelled. Only the action cards played after it carry a turn-flow effect.
      direction = baseDirection
      skipsBefore = 0
      skipsAfter = 0
      penalty = 0
      seenDraw2 = false
    }
  }
  return { direction, penalty, skipsBefore, skipsAfter }
}

function discardWith(base: UnoCard[], top: UnoCard | null): UnoCard[] {
  const discard = [...base]
  if (top) discard.push(top)
  return discard
}

// ── Per-game trophy accumulator ──────────────────────────────────────────────────────────────
// UNO is a position game: the session and hands hold only current state, and a finished hand is
// empty, so "played a Skip", "called UNO", "caught a missed call", "challenged a Wild Draw Four",
// "changed the colour five times", "won on a Wild" cannot be reconstructed after the fact. Each
// acting player's counters are folded forward on their own action, gated on WINNING the session
// CAS (a lost race writes nothing, so nothing double-counts), and stashed on
// `uno_player_hands.stats`. These functions are pure and additive; they change no card, turn or
// score. See src/lib/trophies/game-facts/uno.ts for how each key becomes a trophy.

/** Opaque bag of integer counters stored on `uno_player_hands.stats`. */
type UnoRoundStats = Record<string, number>

/** This player's current accumulator, copied so the fold never mutates the loaded row. */
function currentUnoStats(hands: UnoPlayerHand[], playerId: string): UnoRoundStats {
  const row = hands.find((h) => h.player_id === playerId) as (UnoPlayerHand & { stats?: UnoRoundStats }) | undefined
  return { ...(row?.stats ?? {}) }
}

function incU(stats: UnoRoundStats, key: string, by = 1): void {
  stats[key] = (stats[key] ?? 0) + by
}

function bumpMaxU(stats: UnoRoundStats, key: string, value: number): void {
  if (value > (stats[key] ?? 0)) stats[key] = value
}

/**
 * Fold the counters for a play of `cards` (a single-card play is a one-element array). `handBefore`
 * is the hand as it was when the turn began; `wentOut` whether this play emptied it. `opts` carries
 * the play's cross-cutting facts: whether the player called UNO on their second-to-last card,
 * whether this move CAUGHT a missed UNO call, whether a Draw Two stacked onto a pending one, and
 * (Multi-Play only) whether the set spanned all four colours.
 */
function foldUnoPlay(
  prev: UnoRoundStats,
  cards: UnoCard[],
  handBefore: UnoCard[],
  wentOut: boolean,
  opts: {
    calledUno: boolean
    caught: boolean
    stackedDraw2: boolean
    rainbow: boolean
    /** Any Draw card stacked onto a pending Draw penalty this play (No Mercy cross-kind). */
    stackedAnyDraw?: boolean
    /** True when this play triggered the 7-swap phase (isSeven with a target). */
    playedSevenSwap?: boolean
    /** True when this play triggered the 0-pass rotation (isZero). */
    playedZeroPass?: boolean
    /** True when this play brought the Draw stack chain to 3+ (Double Stack). */
    threePlusStack?: boolean
  }
): UnoRoundStats {
  const stats = { ...prev }
  incU(stats, 'uno_turns_taken')
  bumpMaxU(stats, 'uno_peak_hand_size', handBefore.length)
  for (const c of cards) {
    if (c.kind === 'skip') incU(stats, 'uno_skips')
    else if (c.kind === 'reverse') incU(stats, 'uno_reverses')
    else if (c.kind === 'draw2') incU(stats, 'uno_draw_twos')
    else if (c.kind === 'wild') incU(stats, 'uno_wilds')
    else if (c.kind === 'wild_draw4') incU(stats, 'uno_wild_draw_fours')
    // High Stakes card kinds. These counters only ever accumulate when the game is High Stakes
    // (there's no way to hold a No-Mercy-only card in a Classic deck) — so unoFacts can gate on
    // uno_mode without any extra flag needed here.
    else if (c.kind === 'draw6') incU(stats, 'uno_hs_draw6_plays')
    else if (c.kind === 'draw10') incU(stats, 'uno_hs_draw10_plays')
    else if (c.kind === 'wild_reverse_draw4') incU(stats, 'uno_hs_rev_draw4_plays')
    else if (c.kind === 'wild_color_roulette') incU(stats, 'uno_hs_roulette_plays')
    else if (c.kind === 'discard_all') incU(stats, 'uno_hs_discard_all_plays')
    else if (c.kind === 'skip_everyone') incU(stats, 'uno_hs_skip_all_plays')
  }
  if (opts.stackedDraw2) incU(stats, 'uno_draw2_stacked')
  if (opts.stackedAnyDraw) incU(stats, 'uno_hs_stack_plays')
  if (opts.playedSevenSwap) incU(stats, 'uno_hs_seven_swap_plays')
  if (opts.playedZeroPass) incU(stats, 'uno_hs_zero_pass_plays')
  if (opts.threePlusStack) stats.uno_hs_stack3plus = 1
  if (opts.calledUno) incU(stats, 'uno_uno_calls')
  if (opts.caught) incU(stats, 'uno_catches')
  if (opts.rainbow) stats.uno_rainbow = 1
  if (wentOut) {
    const last = cards[cards.length - 1]!
    stats.uno_out_wild = isWildCard(last) ? 1 : 0
    stats.uno_out_wd4 = last.kind === 'wild_draw4' ? 1 : 0
  }
  return stats
}

/** Fold the counter for naming a colour after a Wild / Wild Draw Four (the colour-change event). */
function foldUnoChoose(prev: UnoRoundStats): UnoRoundStats {
  const stats = { ...prev }
  incU(stats, 'uno_color_changes')
  return stats
}

/** Fold a draw. `forced` marks a Draw Two / Draw Four penalty draw, distinct from a voluntary one. */
function foldUnoDraw(prev: UnoRoundStats, drawnCount: number, newHandLen: number, forced: boolean): UnoRoundStats {
  const stats = { ...prev }
  incU(stats, 'uno_cards_drawn', drawnCount)
  bumpMaxU(stats, 'uno_peak_hand_size', newHandLen)
  if (forced) {
    incU(stats, 'uno_forced_hits')
    // High Stakes Chain Breaker keys off the largest single stacked penalty a player absorbed.
    bumpMaxU(stats, 'uno_hs_max_stack_absorbed', drawnCount)
  }
  return stats
}

/** Fold a single event counter onto a player's bag (challenge outcomes, the standalone UNO call). */
function foldUnoEvent(prev: UnoRoundStats, key: string): UnoRoundStats {
  const stats = { ...prev }
  incU(stats, key)
  return stats
}

/** Write one player's folded accumulator. Separate from the hand write so the 0-rule rotation and
 *  cross-player challenge credits both reach the right row without disturbing card writes. */
async function writeUnoStats(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  stats: UnoRoundStats
): Promise<void> {
  await supabase.from('uno_player_hands').update({ stats }).eq('game_id', gameId).eq('player_id', playerId)
}

/** One hand row's changes in a move: the cards, the folded stats, or both. */
type UnoHandWrite = { player_id: string; cards?: UnoCard[]; stats?: Record<string, number> }

/** Everything a non-finishing move writes besides the session row: it commits WITH the session claim, or not at all. */
type UnoMoveWrites = {
  hands?: UnoHandWrite[]
  spectatorIds?: string[]
  /** A side effect of an earlier move (a knockout) must not restart the turn timer. */
  keepDeadline?: boolean
}

/** Merge several writes for the same player (cards from one place, stats from another) into one entry. */
function mergeHandWrites(writes: UnoHandWrite[]): UnoHandWrite[] {
  const byPlayer = new Map<string, UnoHandWrite>()
  for (const w of writes) byPlayer.set(w.player_id, { ...byPlayer.get(w.player_id), ...w })
  return [...byPlayer.values()]
}

/**
 * The session claim of a move. Without `writes` it is the plain compare-and-swap UPDATE. With the move's hand /
 * stats / spectator writes it is ONE database transaction (apply_uno_move): the new session version and the hands it
 * describes become visible together, so a finish, a leave or the next player's move can never act on a version whose
 * hand writes are still pending, and a lost claim writes no hand at all.
 */
async function persistSession(
  supabase: SupabaseClient,
  gameId: string,
  patch: Partial<UnoSession>,
  timerSeconds: number,
  expectedUpdatedAt: string,
  writes?: UnoMoveWrites
): Promise<{ won: boolean; error?: string }> {
  const turnDeadline = patch.phase === 'finished' ? null : (patch.turn_deadline_at ?? unoTurnDeadline(timerSeconds))
  const deadline = writes?.keepDeadline ? {} : { turn_deadline_at: turnDeadline }
  if (writes && ((writes.hands?.length ?? 0) > 0 || (writes.spectatorIds?.length ?? 0) > 0)) {
    const { data, error } = await supabase.rpc('apply_uno_move', {
      p_game_id: gameId,
      p_expected_updated_at: expectedUpdatedAt,
      p_session_patch: { ...patch, ...deadline },
      p_hand_writes: mergeHandWrites(writes.hands ?? []),
      p_spectator_ids: writes.spectatorIds?.length ? writes.spectatorIds : null,
    })
    if (error) return { won: false, error: internalErrorMessage('uno', error) }
    const status = (data as { status?: string; reason?: string } | null)?.status
    if (status === 'applied') return { won: true }
    if (status === 'lost') return { won: false }
    return { won: false, error: internalErrorMessage('uno', `apply_uno_move answered ${status ?? 'nothing'}`) }
  }
  const { data, error } = await supabase
    .from('uno_sessions')
    .update({ ...patch, ...deadline, updated_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .eq('updated_at', expectedUpdatedAt)
    .select('game_id')
  // A database failure is not a lost race: reporting it as one would answer 200 for a write that never landed.
  if (error) return { won: false, error: internalErrorMessage('uno', error) }
  return { won: (data?.length ?? 0) > 0 }
}

/** Bonus per opponent knocked out by the Mercy rule this round (No Mercy scoring only). */
const UNO_KNOCKOUT_BONUS = 250

/**
 * Optional UNO scoring: the round winner's award, computed in memory and applied (against the CURRENT totals,
 * only while scoring is on and no series winner exists) by `finish_uno_session` inside the finish transaction.
 *
 * Points: sum of card values still in every opponent's hand (numbers = face, coloured actions
 * = 20, wilds = 50) PLUS 250 per player knocked out by Mercy during the round. When any
 * player reaches uno_series_target the id lands in uno_series_winner_id.
 */
/** The hands as they will be once the finish's hand writes have landed (the score must see every final hand). */
function withHandWrites(hands: UnoPlayerHand[], writes: { player_id: string; cards?: UnoCard[] }[]): UnoPlayerHand[] {
  return writes.reduce((acc, w) => (w.cards ? updateHand(acc, w.player_id, w.cards) : acc), hands)
}

function seriesAward(
  winnerId: string | null,
  hands: UnoPlayerHand[],
  eliminatedCount: number,
  // The committed seating the finish acts on (the session, with the finish's own patch applied).
  seating: { turn_order?: string[] | null; left_player_ids?: string[] | null }
): { winner_id: string; points: number } | null {
  if (!winnerId) return null
  // Only seats still in the round pay out: a leave commits its turn_order / left_player_ids change before the
  // leaver's hand row is deleted, so a finish reading hands in that window must not count the departed cards
  // (Team-Up leavers stay in turn_order and are excluded through left_player_ids).
  const order = seating.turn_order ?? []
  const left = new Set(seating.left_player_ids ?? [])
  // Points from opponents' hands (winner scores their own hand as 0, since it's empty).
  let handPoints = 0
  for (const h of hands) {
    if (h.player_id === winnerId) continue
    if (left.has(h.player_id) || (order.length > 0 && !order.includes(h.player_id))) continue
    handPoints += unoHandSum((h.cards as UnoCard[]) ?? [])
  }
  return { winner_id: winnerId, points: handPoints + eliminatedCount * UNO_KNOCKOUT_BONUS }
}

/**
 * The knockout of a player whose hand reached the limit, as data: the session bookkeeping (eliminated list, the
 * hand returned to the draw pile, the status note, and — for `last_standing` — the round end), the writes for the
 * zeroed hand and the credited setter's stats. Pure, so a move that crosses the limit (a forced draw) can commit it
 * IN the same transaction as the move instead of as a second step that a finish could overtake.
 */
function planMercyKnockout(input: {
  state: {
    turn_order?: string[] | null
    eliminated_player_ids?: string[] | null
    finish_order?: string[] | null
    left_player_ids?: string[] | null
    draw_pile?: UnoCard[] | null
    status_message?: string | null
  }
  playerId: string
  koCards: UnoCard[]
  playerNames: Map<string, string>
  winCondition: UnoNoMercyWin
  /** The credited player's CURRENT stats (the plan adds the knockout to them), or null. */
  attribution: { player_id: string; stats: Record<string, number> } | null
}): { patch: Partial<UnoSession>; hands: UnoHandWrite[]; endsRound: boolean; nextEliminated: string[] } {
  const { state, playerId, koCards, playerNames, winCondition, attribution } = input
  const nextEliminated = [...new Set([...(state.eliminated_player_ids ?? []), playerId])]
  const name = playerName(playerNames, playerId)
  const note = `${name} hit ${koCards.length} cards — knocked out (High Stakes 25-card limit)`
  // Return the KO'd player's hand to the draw pile so the deck can keep dealing to survivors, shuffled in so the
  // returning cards sit anywhere in the pile.
  const currentPile = (state.draw_pile ?? []).filter(Boolean)
  const returnedPile = koCards.length > 0 ? shuffle([...currentPile, ...koCards]) : currentPile

  // Standing players = seated - eliminated - already-finished (emptied their hand).
  const seated = new Set<string>(state.turn_order ?? [])
  const finished = new Set<string>(state.finish_order ?? [])
  const leftIds = new Set<string>(state.left_player_ids ?? [])
  const standing = [...seated].filter((id) => !nextEliminated.includes(id) && !finished.has(id) && !leftIds.has(id))

  // The round ends when nobody is left standing, in EITHER win mode (a continuing knockout that removes the last standing
  // seat would otherwise leave the turn on a knocked-out seat with no playable hand and nobody to pass it to), and, in
  // `last_standing`, when a single survivor remains and nobody has gone out yet.
  const endsRound =
    standing.length === 0 || (winCondition === 'last_standing' && standing.length === 1 && finished.size === 0)
  const patch: Partial<UnoSession> = {
    eliminated_player_ids: nextEliminated,
    draw_pile: returnedPile,
    status_message:
      `${state.status_message ?? ''} · ${note}${koCards.length > 0 ? ` (${koCards.length} cards returned to the deck)` : ''}`.replace(
        /^ · /,
        ''
      ),
  }
  if (endsRound) {
    const winnerId = standing[0] ?? finished.values().next().value ?? null
    patch.phase = 'finished'
    patch.winner_player_id = winnerId
    patch.turn_deadline_at = null
    patch.status_message = winnerId
      ? `${note} · ${playerName(playerNames, winnerId as string)} is the last standing — wins!`
      : `${note} · everyone knocked out — no winner`
  }

  const hands: UnoHandWrite[] = []
  if (koCards.length > 0) hands.push({ player_id: playerId, cards: [] })
  if (attribution) {
    const stats = { ...attribution.stats }
    stats.uno_hs_knockouts = (stats.uno_hs_knockouts ?? 0) + 1
    hands.push({ player_id: attribution.player_id, stats })
  }
  return { patch, hands, endsRound, nextEliminated }
}

/**
 * Whether a player may appear in a payload built from `session` as an optional credit (caster / setter stats,
 * knockout attribution): seated in the claimed session, not marked left, and holding a hand row. Seat membership is
 * what makes this reliable: a leave changes the session version first, so a seat that is in the claimed session's
 * turn order cannot have left by the time the claim wins; a hand-row check alone cannot cover that interval.
 */
function creditableSeat(
  session: Pick<UnoSession, 'turn_order' | 'left_player_ids'>,
  hands: UnoPlayerHand[],
  playerId: string | null | undefined
): playerId is string {
  return (
    !!playerId &&
    (session.turn_order ?? []).includes(playerId) &&
    !unoLeftPlayerIds(session).includes(playerId) &&
    hands.some((h) => h.player_id === playerId)
  )
}

/**
 * Commits a move TOGETHER with the Mercy knockouts its final hands trigger (a forced draw, a 0-rotation, a roulette
 * reveal, a 7-swap): the session patch, every hand write, the knockout bookkeeping, the spectator flags and the
 * attribution are ONE transaction, or ONE finish when the knockout ends the round. A finish can therefore never
 * overtake a required knockout, and a failed write leaves neither the move nor the knockout (nothing is half-done, so
 * nothing needs a repair step that would replay the move).
 */
async function commitMoveWithKnockouts(
  supabase: SupabaseClient,
  gameId: string,
  session: UnoSession,
  hands: UnoPlayerHand[],
  playerNames: Map<string, string>,
  winCondition: UnoNoMercyWin,
  timerSeconds: number,
  move: {
    patch: Partial<UnoSession>
    hands: UnoHandWrite[]
    spectatorIds?: string[]
    /** Players whose hand reached the limit with this move; `attributionId` is credited with the knockout. */
    knockouts: { playerId: string; cards: UnoCard[]; attributionId: string | null }[]
  }
): Promise<{ error?: string; skipped?: boolean }> {
  let patch: Partial<UnoSession> = { ...move.patch }
  let writes: UnoHandWrite[] = [...move.hands]
  const spectators = [...(move.spectatorIds ?? [])]
  let state = {
    turn_order: session.turn_order,
    eliminated_player_ids: session.eliminated_player_ids,
    finish_order: session.finish_order,
    left_player_ids: unoLeftPlayerIds(session),
    draw_pile: (patch.draw_pile ?? session.draw_pile) as UnoCard[] | null,
    status_message: patch.status_message ?? session.status_message,
  }
  let endsRound = false
  for (const victim of move.knockouts) {
    if ((state.eliminated_player_ids ?? []).includes(victim.playerId)) continue
    if (!(state.turn_order ?? []).includes(victim.playerId)) continue
    // Attribution is optional: a setter who has since left has no hand row, and the knockout must still commit.
    const credited =
      victim.attributionId && victim.attributionId !== victim.playerId
        ? creditableSeat(session, hands, victim.attributionId)
          ? victim.attributionId
          : null
        : null
    const plan = planMercyKnockout({
      state,
      playerId: victim.playerId,
      koCards: victim.cards,
      playerNames,
      winCondition,
      attribution: credited
        ? {
            player_id: credited,
            stats: {
              ...(mergeHandWrites(writes).find((w) => w.player_id === credited)?.stats ??
                currentUnoStats(hands, credited)),
            },
          }
        : null,
    })
    patch = { ...patch, ...plan.patch }
    writes = [...writes, ...plan.hands]
    spectators.push(victim.playerId)
    state = {
      ...state,
      eliminated_player_ids: plan.nextEliminated,
      draw_pile: plan.patch.draw_pile as UnoCard[],
      status_message: plan.patch.status_message ?? state.status_message,
    }
    // Never stop at the first plan that ends the round: a LATER candidate of the same move is knocked out too (its cards
    // return to the deck, it becomes a spectator), and the winner / "everyone knocked out" outcome is the one that holds
    // after EVERY candidate (each plan counts the standing seats net of all earlier knockouts, so the last plan wins).
    if (plan.endsRound) endsRound = true
  }
  const merged = mergeHandWrites(writes)
  if (!endsRound && move.knockouts.length > 0) {
    // A continuing move whose seat was just knocked out must not leave the turn (or a draw / Roulette decision owned by
    // that seat) on a spectator with no way to resolve it: pass play to the next surviving seat.
    const eliminatedNow = state.eliminated_player_ids ?? []
    const turnIndex = patch.current_turn_index ?? session.current_turn_index
    const seatId = (session.turn_order ?? [])[turnIndex]
    if (seatId && eliminatedNow.includes(seatId)) {
      const direction = (patch.direction ?? session.direction) < 0 ? -1 : 1
      const nextIndex = unoNextTurnIndex(
        { ...session, eliminated_player_ids: eliminatedNow },
        withHandWrites(hands, merged),
        turnIndex,
        1,
        direction
      )
      const nextId = (session.turn_order ?? [])[nextIndex]
      const pendingUno = patch.uno_pending_player ?? session.uno_pending_player
      patch = {
        ...patch,
        current_turn_index: nextIndex,
        phase: 'playing',
        color_roulette_player_id: null,
        color_roulette_reveals: null,
        draw_penalty: 0,
        draw_penalty_kind: null,
        draw_stack_chain: 0,
        drawn_card_id: null,
        ...(pendingUno && eliminatedNow.includes(pendingUno) ? { uno_pending_player: null, uno_called: false } : {}),
        status_message: `${patch.status_message ?? ''} · ${playerName(playerNames, nextId)}'s turn`.replace(/^ · /, ''),
      }
    }
  }
  if (endsRound) {
    const finished = await finishUnoRound(supabase, gameId, session, {
      patch,
      hands: merged,
      series: seriesAward(
        (patch.winner_player_id as string | null) ?? null,
        withHandWrites(hands, merged),
        (state.eliminated_player_ids ?? []).length,
        session
      ),
      spectatorIds: spectators,
    })
    return finishOutcome(finished)
  }
  const persisted = await persistSession(supabase, gameId, patch, timerSeconds, session.updated_at, {
    hands: merged,
    spectatorIds: spectators.length > 0 ? spectators : undefined,
  })
  if (!persisted.won) return persisted.error ? { error: persisted.error } : { skipped: true }
  return {}
}

/** Snapshot of every player's hand AFTER the current play + any missed-UNO penalty. */
function handMapAfter(
  hands: UnoPlayerHand[],
  playerId: string,
  newHand: UnoCard[],
  missed: { playerId: string; hand: UnoCard[] } | null
): Map<string, UnoCard[]> {
  const m = new Map<string, UnoCard[]>()
  for (const h of hands) m.set(h.player_id, (h.cards as UnoCard[]) ?? [])
  m.set(playerId, newHand)
  if (missed) m.set(missed.playerId, missed.hand)
  return m
}

/**
 * 0-rule: pass every active hand one seat in the direction of play. Forward → each player
 * hands their cards to the next active seat; reversed → to the previous one. Players who are
 * out (no cards) are skipped. Returns the new (playerId, cards) for every active seat.
 */
export function rotateActiveHands(
  session: UnoSession,
  handMap: Map<string, UnoCard[]>,
  direction: number
): { playerId: string; cards: UnoCard[] }[] {
  const eliminated = new Set<string>((session.eliminated_player_ids as string[] | null) ?? [])
  // A marked Team-Up leaver is out of the rotation as soon as the marker commits (their hand row may still exist).
  const left = new Set<string>(unoLeftPlayerIds(session))
  const seq = (session.turn_order ?? []).filter(
    (id) => !eliminated.has(id) && !left.has(id) && (handMap.get(id)?.length ?? 0) > 0
  )
  const n = seq.length
  if (n < 2) return seq.map((id) => ({ playerId: id, cards: handMap.get(id) ?? [] }))
  const H = seq.map((id) => handMap.get(id) ?? [])
  const newH: UnoCard[][] = new Array(n)
  const dir = direction < 0 ? -1 : 1
  for (let i = 0; i < n; i += 1) {
    const target = dir === 1 ? (i + 1) % n : (i - 1 + n) % n
    newH[target] = H[i]
  }
  return seq.map((id, i) => ({ playerId: id, cards: newH[i]! }))
}

// ── Play ──────────────────────────────────────────────────────────────────────
export async function processUnoPlay(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  cardId: string,
  callUno = false,
  opts?: { jumpIn?: boolean; expectedUpdatedAt?: string }
): Promise<{ error?: string; skipped?: boolean }> {
  const {
    error: loadError,
    session,
    hands,
    timerSeconds,
    gameDurationSeconds,
    sessionStartedAt,
    rules,
    playerNames,
  } = await loadGameState(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Session not found' }
  // A delegated auto-play (turn expiry) acts only on the session version whose deadline expired: a move that landed
  // since (even one that renewed this seat's turn) means that expiry no longer applies.
  if (opts?.expectedUpdatedAt && session.updated_at !== opts?.expectedUpdatedAt) return { skipped: true }
  if (session.phase === 'finished') return { error: 'Game is finished' }

  const expired = await finalizeIfGameExpired(
    supabase,
    gameId,
    session,
    hands,
    playerNames,
    sessionStartedAt,
    gameDurationSeconds,
    rules.teamMode
  )
  if (expired) return expiredPlayResult(expired)

  if (session.phase !== 'playing') return { error: 'Resolve the current card first' }
  if (unoHandCount(hands, playerId) === 0) return { error: 'You are out of the game' }

  const hand = handForPlayer(hands, playerId)
  const cardIndex = hand.findIndex((c) => c.id === cardId)
  if (cardIndex < 0) return { error: 'Card not in hand' }
  const card = hand[cardIndex]

  if (opts?.jumpIn) {
    // Jump-In: play an exact-match card out of turn. Only settled top cards are eligible — no
    // jumping while a Draw penalty is pending, and Wilds are never eligible (see isJumpInMatch).
    if (!rules.jumpIn) return { error: 'Jump-In is off for this game' }
    if ((session.draw_penalty ?? 0) > 0) return { error: "Can't jump in while a Draw penalty is pending" }
    if (!isJumpInMatch(card, session.top_card)) return { error: 'Only an exact match can jump in' }
    // The jumper takes the seat; play then flows on from immediately after them, so seats that
    // would have played in between are skipped. Everything below keys off current_turn_index.
    const jumpIndex = (session.turn_order ?? []).indexOf(playerId)
    if (jumpIndex < 0) return { error: 'You are not in this game' }
    session.current_turn_index = jumpIndex
  } else {
    if (currentPlayerId(session) !== playerId) return { error: 'Not your turn' }
    const penaltyError = playPenaltyError(card, session)
    if (penaltyError) return { error: penaltyError }
    if (!canPlayCard(card, session)) return { error: 'Cannot play that card' }
  }

  // Settle a missed "UNO" call by the previous player before applying this move.
  const missed = settleMissedUno(session, hands, playerId, rules, playerNames)
  const basePile = missed?.drawPile ?? (session.draw_pile as UnoCard[]) ?? []
  const baseDiscard = missed?.discardPile ?? (session.discard_pile as UnoCard[]) ?? []

  let newHand = hand.filter((_, i) => i !== cardIndex)
  // Discard All: strip every matching-colour card from the hand; they land under this card in
  // the discard pile so the top-card is still the Discard All the mover just played.
  let discardAllExtras: UnoCard[] = []
  if (card.kind === 'discard_all') {
    discardAllExtras = newHand.filter((c) => c.color === card.color)
    newHand = newHand.filter((c) => c.color !== card.color)
  }
  const wentOut = newHand.length === 0
  const name = playerName(playerNames, playerId)

  // UNO-call bookkeeping: a play that leaves exactly one card owes a call.
  const owesUno = newHand.length === 1
  const unoPatch: Partial<UnoSession> = owesUno
    ? { uno_pending_player: playerId, uno_called: callUno }
    : { uno_pending_player: null, uno_called: false }

  let patch: Partial<UnoSession>
  // 0-7 rule: a 0 rotates every hand in play direction; a 7 pauses for a swap choice.
  const isZero = rules.zeroSeven && card.kind === 'number' && card.value === 0 && !wentOut
  // Only enter the swap phase if there's actually another player to swap with — otherwise a
  // no-timer game would hang on the picker. Without a target the 7 just plays as a number.
  const leftSeats = unoLeftPlayerIds(session)
  const sevenHasTarget = (session.turn_order ?? []).some(
    (id) => id !== playerId && !leftSeats.includes(id) && unoHandCount(hands, id) > 0
  )
  const isSeven = rules.zeroSeven && card.kind === 'number' && card.value === 7 && !wentOut && sevenHasTarget
  let rotatedWrites: { playerId: string; cards: UnoCard[] }[] | null = null

  // Double Stack chain: any Draw card played onto a pending Draw penalty extends the running
  // chain; a fresh Draw starts a new chain at 1; a non-Draw play breaks any pending chain.
  // Persisted on the session so the drawer can be credited too when the stack resolves.
  const _drewOntoPendingStack = isDrawCard(card) && (session.draw_penalty ?? 0) > 0 && !!session.draw_penalty_kind
  const newChain = isDrawCard(card) ? (_drewOntoPendingStack ? (session.draw_stack_chain ?? 0) + 1 : 1) : 0

  if (isWildCard(card) && !wentOut) {
    // Wild / Wild Draw Four / Draw Six / Draw Ten / Wild Reverse Draw Four / Color Roulette.
    // All wilds pause on the same seat for the colour choice (choose endpoint drives the rest).
    // A Draw-carrying wild carries the accumulated stack forward when the choose fires.
    const drawVal = drawCardValue(card.kind)
    // No Mercy stacking: any draw wild played onto a pending draw penalty of equal-or-lower value
    // adds to the running stack. Classic path: only wild_draw4-on-wild_draw4 adds.
    const carriedPenalty =
      drawVal > 0 && (session.draw_penalty ?? 0) > 0 && session.draw_penalty_kind ? (session.draw_penalty ?? 0) : 0

    if (card.kind === 'wild_color_roulette') {
      // The MOVER doesn't pick a colour — the next player does, and reveals cards from the draw
      // pile until they hit it. Advance the turn now and enter the roulette phase.
      const dir = session.direction < 0 ? -1 : 1
      const nextIdx = unoNextTurnIndex(session, hands, session.current_turn_index, 1, dir)
      const nextId = session.turn_order[nextIdx]
      patch = {
        top_card: card,
        last_play_cards: [card],
        last_play_player_id: playerId,
        draw_stack_chain: 0,
        discard_pile: discardWith(baseDiscard, session.top_card),
        draw_pile: basePile,
        required_color: null,
        pending_wild: 'wild_color_roulette',
        challenge_prev_color: null,
        wd4_player_id: null,
        draw_penalty: 0,
        draw_penalty_kind: null,
        drawn_card_id: null,
        phase: 'color_roulette',
        current_turn_index: nextIdx,
        color_roulette_player_id: nextId,
        // Fresh event — reveals start at 0 and increment on every no-match Draw click.
        color_roulette_reveals: 0,
        status_message: `${name} played Colour Roulette — ${playerName(playerNames, nextId)} picks a colour and draws until they hit it`,
        ...unoPatch,
      }
    } else {
      patch = {
        top_card: card,
        last_play_cards: [card],
        last_play_player_id: playerId,
        draw_stack_chain: newChain,
        discard_pile: discardWith(baseDiscard, session.top_card),
        draw_pile: basePile,
        required_color: null,
        pending_wild: card.kind === 'wild' ? 'wild' : (card.kind as UnoSession['pending_wild']),
        challenge_prev_color: card.kind === 'wild_draw4' && rules.wd4Challenge ? activeColor(session) : null,
        wd4_player_id: card.kind === 'wild_draw4' && rules.wd4Challenge ? playerId : null,
        draw_penalty: carriedPenalty,
        draw_penalty_kind: null,
        drawn_card_id: null,
        phase: 'choose_color',
        status_message: `${name} played ${cardLabel(card)} — choose a colour`,
        ...unoPatch,
      }
    }
  } else {
    // Draw Two: with stacking on, a 2 played onto a pending Draw-Two stack adds to it.
    const draw2Base = card.kind === 'draw2' && session.draw_penalty_kind === 'draw2' ? (session.draw_penalty ?? 0) : 0
    const draw2Penalty = card.kind === 'draw2' ? draw2Base + 2 : 0
    // Discard All: the auto-dropped matching cards go into the discard pile UNDER the played
    // Discard All (which is the new top_card). They're stashed after the previous top so the
    // count / reshuffle pool includes them.
    const nextDiscard = [...discardWith(baseDiscard, session.top_card), ...discardAllExtras]
    const board: Partial<UnoSession> = {
      top_card: card,
      last_play_cards: [card],
      last_play_player_id: playerId,
      draw_stack_chain: newChain,
      required_color: null,
      pending_wild: null,
      challenge_prev_color: null,
      wd4_player_id: null,
      draw_penalty: draw2Penalty,
      draw_penalty_kind: card.kind === 'draw2' && rules.stacking ? 'draw2' : null,
      drawn_card_id: null,
      discard_pile: nextDiscard,
      draw_pile: basePile,
    }

    if (wentOut) {
      patch = {
        ...playerOutPatch(
          session,
          hands,
          gameDurationSeconds,
          playerId,
          name,
          playerNames,
          board,
          session.direction,
          rules.teamMode
        ),
        ...unoPatch,
      }
    } else if (isSeven) {
      // Pause on the same player for the swap-target choice; hand counts change on swap,
      // so the UNO-call obligation is cleared here.
      patch = {
        ...board,
        current_turn_index: session.current_turn_index,
        direction: session.direction,
        phase: 'swap_target',
        status_message: `${name} played a 7 — choose a player to swap hands with`,
        uno_pending_player: null,
        uno_called: false,
      }
    } else {
      const advance = resolveNextTurn(session, hands, card)
      const nextPlayerId = session.turn_order[advance.nextIndex]
      const special = specialCardMessage(card)
      let status = `${playerName(playerNames, nextPlayerId)}'s turn — match ${cardLabel(card)}`
      if (special) status = `${status} · ${special}`
      if (card.kind === 'draw2') {
        status = `${playerName(playerNames, nextPlayerId)} must draw ${draw2Penalty}${rules.stacking ? ' or stack a Draw 2' : ''} (Draw 2)`
      }
      if (card.kind === 'discard_all' && discardAllExtras.length > 0) {
        status = `${status} · ${name} dropped ${discardAllExtras.length} extra ${card.color} card${discardAllExtras.length === 1 ? '' : 's'}`
      }
      if (card.kind === 'skip_everyone') {
        status = `${name} skipped everyone — goes again`
      }
      if (isZero) {
        // Rotate every active hand one seat in the direction of play (this play's post-settle
        // hands are the source). The UNO-call obligation is recomputed from the new sizes below.
        const handMap = handMapAfter(hands, playerId, newHand, missed)
        rotatedWrites = rotateActiveHands(session, handMap, advance.direction)
        status = `${name} played a 0 — everyone passed their hand · ${playerName(playerNames, nextPlayerId)}'s turn`
      }
      // A 0 can leave a player on exactly one card — flag the first such seat (turn order) to
      // owe an "UNO" call. (Single field, so if the pass leaves several on one card only the
      // first is tracked.)
      const zeroPending = isZero ? (rotatedWrites?.find((w) => w.cards.length === 1)?.playerId ?? null) : null
      patch = {
        ...board,
        current_turn_index: advance.nextIndex,
        direction: advance.direction,
        phase: 'playing',
        status_message: status,
        ...(isZero ? { uno_pending_player: zeroPending, uno_called: false } : unoPatch),
      }
    }
  }

  // Surface a missed-UNO penalty in the status so the whole room sees the catch.
  if (missed && patch.status_message) patch.status_message = `${patch.status_message} · ${missed.note}`

  const moverStats = foldUnoPlay(currentUnoStats(hands, playerId), [card], hand, wentOut, {
    calledUno: owesUno && callUno,
    caught: !!missed,
    stackedDraw2: card.kind === 'draw2' && session.draw_penalty_kind === 'draw2' && (session.draw_penalty ?? 0) > 0,
    stackedAnyDraw: _drewOntoPendingStack,
    playedSevenSwap: isSeven,
    playedZeroPass: isZero,
    threePlusStack: newChain >= 3,
    rainbow: false,
  })

  if (patch.phase === 'finished') {
    // The round ends on this play: the session, every changed hand (the mover's carries the folded stats), the
    // series points, the out player's spectator flag and the games flip are ONE transaction.
    const handWrites = rotatedWrites
      ? rotatedWrites.map((w) => ({ player_id: w.playerId, cards: w.cards }))
      : [
          { player_id: playerId, cards: newHand },
          ...(missed ? [{ player_id: missed.playerId, cards: missed.hand }] : []),
        ]
    const moverWrite = handWrites.find((w) => w.player_id === playerId)
    const winnerId = (patch.winner_player_id ?? playerId) as string
    const finished = await finishUnoRound(supabase, gameId, session, {
      patch,
      hands: handWrites.map((w) => (w === moverWrite ? { ...w, stats: moverStats } : w)),
      series: seriesAward(
        winnerId,
        withHandWrites(hands, handWrites),
        (patch.eliminated_player_ids ?? session.eliminated_player_ids ?? []).length,
        session
      ),
      spectatorIds: [playerId],
    })
    return finishOutcome(finished)
  }

  // Rotation is the source of truth for every active hand (includes the mover + any missed-UNO penalty), so it
  // replaces the individual hand writes. The mover's hand carries the folded stats; the session and every hand
  // change commit together with the claim.
  const moveHands: UnoHandWrite[] = rotatedWrites
    ? rotatedWrites.map((w) => ({ player_id: w.playerId, cards: w.cards }))
    : [{ player_id: playerId, cards: newHand }, ...(missed ? [{ player_id: missed.playerId, cards: missed.hand }] : [])]
  // Mercy: a 0-rotation can hand a seat 25+ cards. Attribute to whoever played the 0; the knockouts commit with the play.
  const rotationKnockouts =
    rules.mode === 'no_mercy' && isZero && rotatedWrites
      ? rotatedWrites
          .filter((w) => w.playerId !== playerId && w.cards.length >= UNO_MERCY_HAND_LIMIT)
          .map((w) => ({ playerId: w.playerId, cards: w.cards, attributionId: playerId as string | null }))
      : []
  return commitMoveWithKnockouts(supabase, gameId, session, hands, playerNames, rules.noMercyWin, timerSeconds, {
    patch,
    hands: [...moveHands, { player_id: playerId, stats: moverStats }],
    spectatorIds: wentOut ? [playerId] : undefined,
    knockouts: rotationKnockouts,
  })
}

/**
 * Jump-In: `playerId` plays an exact-match card out of turn. Shares the single-card play pipeline
 * (missed-UNO settle, 0-7, UNO-call bookkeeping, turn advance) — only the turn/eligibility gate
 * differs. Play resumes from the seat immediately after the jumper.
 */
export async function processUnoJumpIn(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  cardId: string,
  callUno = false
): Promise<{ error?: string; skipped?: boolean }> {
  return processUnoPlay(supabase, gameId, playerId, cardId, callUno, { jumpIn: true })
}

// ── Multi-Play (lay several matching cards at once) ──────────────────────────────
export async function processUnoPlayMulti(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  cardIds: string[],
  callUno = false
): Promise<{ error?: string; skipped?: boolean }> {
  const {
    error: loadError,
    session,
    hands,
    timerSeconds,
    gameDurationSeconds,
    sessionStartedAt,
    rules,
    playerNames,
  } = await loadGameState(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { error: 'Game is finished' }

  const expired = await finalizeIfGameExpired(
    supabase,
    gameId,
    session,
    hands,
    playerNames,
    sessionStartedAt,
    gameDurationSeconds,
    rules.teamMode
  )
  if (expired) return expiredPlayResult(expired)

  if (rules.multiPlay === 'off') return { error: 'Multi-Play is off for this game' }
  if (session.phase !== 'playing') return { error: 'Resolve the current card first' }

  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (unoHandCount(hands, playerId) === 0) return { error: 'You are out of the game' }

  const hand = handForPlayer(hands, playerId)
  // Resolve the requested cards IN ORDER; reject duplicates or unknown ids.
  const remaining = [...hand]
  const cards: UnoCard[] = []
  for (const id of cardIds) {
    const idx = remaining.findIndex((c) => c.id === id)
    if (idx < 0) return { error: 'Card not in hand' }
    cards.push(remaining.splice(idx, 1)[0]!)
  }

  const setError = validateMultiSet(cards, session, rules.multiPlay)
  if (setError) return { error: setError }

  const playedIds = new Set(cards.map((c) => c.id))
  const newHand = hand.filter((c) => !playedIds.has(c.id))
  const wentOut = newHand.length === 0
  const name = playerName(playerNames, playerId)

  // Settle a missed "UNO" call by the previous player first.
  const missed = settleMissedUno(session, hands, playerId, rules, playerNames)
  const basePile = missed?.drawPile ?? (session.draw_pile as UnoCard[]) ?? []
  const baseDiscard = missed?.discardPile ?? (session.discard_pile as UnoCard[]) ?? []

  // Resolve the action cards in play order. A Draw Two makes the *immediate* next player draw and
  // lose their turn; a Skip then skips whoever is up after that. So the penalty lands on the seat
  // reached after the skips laid BEFORE it, and skips laid AFTER push the turn further along.
  const activeCount = activePlayerCount(session, hands)
  const { direction, penalty, skipsBefore, skipsAfter } = resolveMultiPlayAdvance(cards, session, activeCount)
  const draw2Count = penalty / 2
  const lastCard = cards[cards.length - 1]!
  // Discard everything except the card that stays face-up on top.
  const discardPile = [...baseDiscard, ...(session.top_card ? [session.top_card] : []), ...cards.slice(0, -1)]

  // A Draw Two followed by a Skip can't be resolved with a single pending penalty (the trailing
  // skip must fire only after the draw), so that combo auto-applies the draw here and advances
  // past the drawer + skips. A pending penalty (Draw Two with no trailing skip) stays live so the
  // target can stack when the host allows it.
  const autoResolve = penalty > 0 && skipsAfter > 0 && !wentOut
  const pendingPenalty = penalty > 0 && !autoResolve && !wentOut

  // Multi-Play chain: count the Draw 2s in this set as one continuous chain contribution.
  // (Multi-Play is Draw 2 only — wild draws must play alone.) If the pile was pending a stack
  // when this set landed, extend it; otherwise it starts fresh.
  const draw2InSet = cards.filter((c) => c.kind === 'draw2').length
  const priorChain = (session.draw_penalty ?? 0) > 0 && session.draw_penalty_kind ? (session.draw_stack_chain ?? 0) : 0
  const nextChain = pendingPenalty ? priorChain + draw2InSet : 0

  const board: Partial<UnoSession> = {
    top_card: lastCard,
    // The whole set, in play order — the client fans the covered cards behind the top one.
    last_play_cards: cards,
    last_play_player_id: playerId,
    draw_stack_chain: nextChain,
    required_color: null,
    pending_wild: null,
    challenge_prev_color: null,
    wd4_player_id: null,
    draw_penalty: pendingPenalty ? penalty : 0,
    draw_penalty_kind: pendingPenalty && rules.stacking ? 'draw2' : null,
    drawn_card_id: null,
    discard_pile: discardPile,
    draw_pile: basePile,
  }

  const owesUno = newHand.length === 1
  const unoPatch: Partial<UnoSession> = owesUno
    ? { uno_pending_player: playerId, uno_called: callUno }
    : { uno_pending_player: null, uno_called: false }

  // AUTO-resolve draws for the target here; captured so the hand write happens after persist.
  let autoDraw: { playerId: string; hand: UnoCard[] } | null = null

  let patch: Partial<UnoSession>
  if (wentOut) {
    patch = {
      ...playerOutPatch(
        session,
        hands,
        gameDurationSeconds,
        playerId,
        name,
        playerNames,
        board,
        direction,
        rules.teamMode
      ),
      ...unoPatch,
    }
  } else if (pendingPenalty) {
    // Land on the drawer (the seat after the leading skips); they draw or stack on their turn.
    const drawerIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1 + skipsBefore, direction)
    const drawerId = session.turn_order[drawerIndex]
    const stackNote = rules.stacking ? ' or stack a Draw Two' : ''
    patch = {
      ...board,
      current_turn_index: drawerIndex,
      direction,
      phase: 'playing',
      status_message: `${name} played ${cards.length} cards — ${playerName(playerNames, drawerId)} must draw ${penalty}${stackNote} (${draw2Count} × Draw 2)`,
      ...unoPatch,
    }
  } else if (autoResolve) {
    // The immediate target draws now and loses their turn; play continues past them + the skips.
    const drawerIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1 + skipsBefore, direction)
    const drawerId = session.turn_order[drawerIndex]
    // The draw builds on the hand AFTER this play when the drawer is the mover (a Skip - Draw Two - Skip chain in a
    // two-seat game comes back to them), and on the missed-UNO penalty hand when that is the drawer.
    const drawerBase =
      drawerId === playerId
        ? newHand
        : missed && missed.playerId === drawerId
          ? missed.hand
          : handForPlayer(hands, drawerId)
    const drawResult = drawCardsWithRefill(basePile, discardPile, penalty)
    autoDraw = { playerId: drawerId, hand: [...drawerBase, ...drawResult.drawn] }
    const nextIndex = unoNextTurnIndex(session, hands, drawerIndex, 1 + skipsAfter, direction)
    const nextPlayerId = session.turn_order[nextIndex]
    patch = {
      ...board,
      draw_pile: drawResult.drawPile,
      discard_pile: drawResult.discardPile,
      current_turn_index: nextIndex,
      direction,
      phase: 'playing',
      status_message: `${name} played ${cards.length} cards — ${playerName(playerNames, drawerId)} drew ${drawResult.drawn.length}, skipped to ${playerName(playerNames, nextPlayerId)}`,
      ...unoPatch,
    }
  } else {
    // Plain multi (no Draw Two): advance past every skip to the next player.
    const nextIndex = unoNextTurnIndex(
      session,
      hands,
      session.current_turn_index,
      1 + skipsBefore + skipsAfter,
      direction
    )
    const nextPlayerId = session.turn_order[nextIndex]
    patch = {
      ...board,
      current_turn_index: nextIndex,
      direction,
      phase: 'playing',
      status_message: `${name} played ${cards.length} cards — ${playerName(playerNames, nextPlayerId)}'s turn, match ${cardLabel(lastCard)}`,
      ...unoPatch,
    }
  }

  // The UNO-call marker follows the mover's FINAL hand: an auto-resolved Draw Two chain that comes back to the mover
  // makes them draw, so one card after the play may be three cards after the draw (no call is owed then).
  if (autoDraw && autoDraw.playerId === playerId) {
    const owesAfterDraw = autoDraw.hand.length === 1
    patch = {
      ...patch,
      uno_pending_player: owesAfterDraw ? playerId : null,
      uno_called: owesAfterDraw ? callUno : false,
    }
  }
  if (missed && patch.status_message) patch.status_message = `${patch.status_message} · ${missed.note}`

  // The call counts only if the mover is STILL on one card after an auto-resolved draw that came back to them.
  const finalOwesUno = autoDraw && autoDraw.playerId === playerId ? autoDraw.hand.length === 1 : owesUno
  const moverStats = foldUnoPlay(currentUnoStats(hands, playerId), cards, hand, wentOut, {
    calledUno: finalOwesUno && callUno,
    caught: !!missed,
    stackedDraw2:
      session.draw_penalty_kind === 'draw2' && (session.draw_penalty ?? 0) > 0 && cards.some((c) => c.kind === 'draw2'),
    // "Rainbow" is a single set spanning all four colours (same-value cards of every colour).
    rainbow: new Set(cards.filter((c) => c.color !== 'wild').map((c) => c.color)).size >= 4,
  })
  // AUTO-resolve drew for the target (its hand already folds in any missed-UNO penalty for them).
  const handWrites: { player_id: string; cards: UnoCard[]; stats?: Record<string, number> }[] = [
    { player_id: playerId, cards: newHand, stats: moverStats },
  ]
  if (autoDraw) handWrites.push({ player_id: autoDraw.playerId, cards: autoDraw.hand })
  if (missed && missed.playerId !== autoDraw?.playerId) {
    handWrites.push({ player_id: missed.playerId, cards: missed.hand })
  }

  if (patch.phase === 'finished') {
    // The round ends on this play: session, hands (the mover's with its stats), series points, the out player's
    // spectator flag and the games flip are ONE transaction.
    const winnerId = (patch.winner_player_id ?? playerId) as string
    const finished = await finishUnoRound(supabase, gameId, session, {
      patch,
      hands: handWrites,
      series: seriesAward(
        winnerId,
        withHandWrites(hands, handWrites),
        (patch.eliminated_player_ids ?? session.eliminated_player_ids ?? []).length,
        session
      ),
      spectatorIds: [playerId],
    })
    return finishOutcome(finished)
  }

  // Mercy: an auto-resolved Draw Two chain that pushes the drawer to the limit knocks them out in the same transaction
  // as the play (attribution: whoever played the chain).
  return commitMoveWithKnockouts(supabase, gameId, session, hands, playerNames, rules.noMercyWin, timerSeconds, {
    patch,
    hands: handWrites,
    spectatorIds: wentOut ? [playerId] : undefined,
    knockouts:
      rules.mode === 'no_mercy' && autoDraw && autoDraw.hand.length >= UNO_MERCY_HAND_LIMIT
        ? [{ playerId: autoDraw.playerId, cards: autoDraw.hand, attributionId: playerId }]
        : [],
  })
}

// ── Draw ──────────────────────────────────────────────────────────────────────
export async function processUnoDraw(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  expectedUpdatedAt?: string
): Promise<{ error?: string; skipped?: boolean }> {
  const {
    error: loadError,
    session,
    hands,
    timerSeconds,
    gameDurationSeconds,
    sessionStartedAt,
    rules,
    playerNames,
  } = await loadGameState(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Session not found' }
  // A delegated auto-play (turn expiry) acts only on the session version whose deadline expired: a move that landed
  // since (even one that renewed this seat's turn) means that expiry no longer applies.
  if (expectedUpdatedAt && session.updated_at !== expectedUpdatedAt) return { skipped: true }
  if (session.phase === 'finished') return { error: 'Game is finished' }

  const expired = await finalizeIfGameExpired(
    supabase,
    gameId,
    session,
    hands,
    playerNames,
    sessionStartedAt,
    gameDurationSeconds,
    rules.teamMode
  )
  if (expired) return expiredPlayResult(expired)

  // Colour Roulette: the target reveals cards one at a time by clicking Draw. Route to
  // the dedicated reveal helper; it handles the match/no-match branches and the caster's
  // reveal-count stats + mercy check.
  if (session.phase === 'color_roulette') {
    if (session.color_roulette_player_id !== playerId) return { error: 'Not your Colour Roulette' }
    return processUnoColorRouletteReveal(supabase, gameId, playerId, session, hands, playerNames, rules, timerSeconds)
  }

  if (session.phase !== 'playing') return { error: 'Resolve the current card first' }

  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (unoHandCount(hands, playerId) === 0) return { error: 'You are out of the game' }
  // One draw per turn: after drawing you either play the drawn card or keep it (pass).
  if (session.drawn_card_id && (session.draw_penalty ?? 0) === 0) {
    return { error: 'You already drew — play it or keep it' }
  }

  // Settle a missed UNO call by the previous player first.
  const missed = settleMissedUno(session, hands, playerId, rules, playerNames)
  let drawPile = missed?.drawPile ?? (session.draw_pile as UnoCard[]) ?? []
  let discardPile = missed?.discardPile ?? (session.discard_pile as UnoCard[]) ?? []

  const penalty = session.draw_penalty ?? 0
  const drawCount = penalty > 0 ? penalty : 1

  const {
    drawn: initialDrawn,
    drawPile: nextDrawPile,
    discardPile: nextDiscardPile,
    reshuffled,
  } = drawCardsWithRefill(drawPile, discardPile, drawCount)
  // `drawn` is `let` (not const) because the No Mercy voluntary-draw path may sweep more
  // cards below until a playable one is found; the trophy fold at the bottom of this
  // function reads the final swept total, not the initial draw count.
  let drawn = initialDrawn
  drawPile = nextDrawPile
  discardPile = nextDiscardPile

  const direction = session.direction < 0 ? -1 : 1
  const hand = handForPlayer(hands, playerId)
  // Playability, the next-turn lookup and the finish all use the hands AFTER the missed-UNO penalty (a Wild in the
  // penalty cards is playable, so "nobody can play" must be judged on the committed hands).
  const handsAfterPenalty = missed ? updateHand(hands, missed.playerId, missed.hand) : hands

  if (drawn.length === 0) {
    if (hasPlayableCard(hand, session)) {
      return { error: 'Draw pile is empty — play a card from your hand' }
    }
    if (!anyPlayerCanPlay(handsAfterPenalty, session)) {
      // Rank on the penalised hands and commit the hand and the (now empty) piles in the same finish.
      const ended = await finishByLowestHand(
        supabase,
        gameId,
        session,
        handsAfterPenalty,
        playerNames,
        'Nobody can play —',
        rules.teamMode,
        missed
          ? {
              patch: { draw_pile: drawPile, discard_pile: discardPile },
              handWrites: [{ playerId: missed.playerId, cards: missed.hand }],
            }
          : undefined
      )
      return finishOutcome(ended)
    }
    const nextIndex = unoNextTurnIndex(session, handsAfterPenalty, session.current_turn_index, 1, direction)
    const nextPlayerId = session.turn_order[nextIndex]
    const top = session.top_card
    const matchHint = top ? ` — match ${cardLabel(top)}` : ''
    const persisted = await persistSession(
      supabase,
      gameId,
      {
        draw_pile: drawPile,
        discard_pile: discardPile,
        current_turn_index: nextIndex,
        uno_pending_player: null,
        uno_called: false,
        status_message: `${playerName(playerNames, nextPlayerId)}'s turn${matchHint} (draw pile empty)`,
      },
      timerSeconds,
      session.updated_at,
      // The missed-UNO penalty hand commits with the claim (a lost claim writes no hand).
      { hands: missed ? [{ player_id: missed.playerId, cards: missed.hand }] : [] }
    )
    if (!persisted.won) return persisted.error ? { error: persisted.error } : { skipped: true }
    return {}
  }

  // `let` because the No Mercy sweep below may append more drawn cards before we persist.
  let newHand = [...hand, ...drawn]
  const missedNote = missed ? ` · ${missed.note}` : ''
  const reshuffledNote = reshuffled ? ' · deck reshuffled' : ''
  const forced = penalty > 0

  let patch: Partial<UnoSession>

  if (forced) {
    // High Stakes — the pile (plus everything already reshuffled from the discard AND
    // the KO'd hands returned on Mercy) couldn't cover the full pending penalty. There
    // is no more deck to draw from, so the round can't continue: end it by lowest hand
    // total. Only in No Mercy — Classic keeps the existing "draw what you can" beat,
    // which is fine for smaller +2/+4 penalties.
    if (rules.mode === 'no_mercy' && drawn.length < penalty) {
      // The partial payout counts in the standings, but nothing is written until the finish claim wins:
      // the post-draw hands are computed in memory, and the hand rows + final piles are written only after it.
      let rankHands = updateHand(hands, playerId, newHand)
      const handWrites = [{ playerId, cards: newHand }]
      if (missed) {
        rankHands = updateHand(rankHands, missed.playerId, missed.hand)
        handWrites.push({ playerId: missed.playerId, cards: missed.hand })
      }
      // The Mercy limit applies BEFORE ranking: a drawer whose partial payout reached it is knocked out (zeroed hand,
      // elimination, spectator flag, the setter's credit) in the same finish and cannot win on a low total.
      let rankSession = session
      let extraPatch: Partial<UnoSession> = { draw_pile: drawPile, discard_pile: discardPile }
      let statsWrites: { player_id: string; stats: Record<string, number> }[] = []
      let spectatorIds: string[] | undefined
      if (newHand.length >= UNO_MERCY_HAND_LIMIT) {
        const setterId = session.last_play_player_id
        const plan = planMercyKnockout({
          state: {
            turn_order: session.turn_order,
            eliminated_player_ids: session.eliminated_player_ids,
            finish_order: session.finish_order,
            left_player_ids: unoLeftPlayerIds(session),
            draw_pile: drawPile,
            status_message: session.status_message,
          },
          playerId,
          koCards: newHand,
          playerNames,
          winCondition: rules.noMercyWin,
          attribution:
            setterId && setterId !== playerId && creditableSeat(session, hands, setterId)
              ? { player_id: setterId, stats: { ...currentUnoStats(hands, setterId) } }
              : null,
        })
        rankHands = updateHand(rankHands, playerId, [])
        handWrites[0] = { playerId, cards: [] }
        extraPatch = {
          ...extraPatch,
          eliminated_player_ids: plan.nextEliminated,
          // the knocked-out hand goes back to the pile: the finished snapshot keeps all of those cards
          draw_pile: plan.patch.draw_pile,
        }
        rankSession = { ...session, eliminated_player_ids: plan.nextEliminated }
        statsWrites = plan.hands.filter((w) => w.stats && w.player_id !== playerId) as typeof statsWrites
        spectatorIds = [playerId]
      }
      const ended = await finishByLowestHand(
        supabase,
        gameId,
        rankSession,
        rankHands,
        playerNames,
        `Deck ran out mid-penalty (${drawn.length}/${penalty}) —`,
        rules.teamMode,
        { patch: extraPatch, handWrites, statsWrites, spectatorIds }
      )
      return finishOutcome(ended)
    }
    // A forced penalty draw (Draw Two / Draw Four target) ends the turn — pass play on.
    const nextIndex = unoNextTurnIndex(
      session,
      updateHand(hands, playerId, newHand),
      session.current_turn_index,
      1,
      direction
    )
    const nextPlayerId = session.turn_order[nextIndex]
    const penaltyName =
      session.draw_penalty_kind === 'wild_draw4'
        ? ' (Draw 4)'
        : session.draw_penalty_kind === 'draw2'
          ? ' (Draw 2)'
          : session.draw_penalty_kind === 'draw6'
            ? ' (Draw 6)'
            : session.draw_penalty_kind === 'draw10'
              ? ' (Draw 10)'
              : session.draw_penalty_kind === 'wild_reverse_draw4'
                ? ' (Reverse Draw 4)'
                : ''
    patch = {
      draw_pile: drawPile,
      discard_pile: discardPile,
      draw_penalty: 0,
      draw_penalty_kind: null,
      draw_stack_chain: 0,
      drawn_card_id: null,
      current_turn_index: nextIndex,
      uno_pending_player: null,
      uno_called: false,
      status_message: `${playerName(playerNames, nextPlayerId)}'s turn — ${playerName(playerNames, playerId)} drew ${drawn.length}${penaltyName}${reshuffledNote}${missedNote}`,
    }
  } else {
    // Voluntary draw.
    //
    // Classic: draw exactly one card. If it's playable, keep the turn so the player may play
    // it or keep it (pass). Otherwise the turn ends — they keep the card.
    //
    // High Stakes (No Mercy): "draw until you get a playable card". Keep drawing one at a
    // time until we hit a card that plays on the current top, or the draw pile + discard
    // both run dry. If we found one, treat it exactly like the classic playable-draw case
    // (drawn_card_id = the last card, keep turn). If we ran dry without finding one, take
    // everything drawn and end the turn — matches classic "you drew, turn passes on".
    //
    // Safety cap keeps a pathological session (draw==0 loop, corrupted data) from spinning:
    // the deck has 108 cards Classic / 168 HS, so any real game exits far before this.
    const DRAW_UNTIL_CAP = 200
    let sweptDraw: UnoCard[] = [...drawn]
    let sweptReshuffled = reshuffled
    if (rules.mode === 'no_mercy') {
      while (
        sweptDraw.length < DRAW_UNTIL_CAP &&
        !canPlayCard(sweptDraw[sweptDraw.length - 1]!, { ...session, draw_penalty: 0 })
      ) {
        const step = drawCardsWithRefill(drawPile, discardPile, 1)
        if (step.drawn.length === 0) break
        sweptDraw = [...sweptDraw, ...step.drawn]
        drawPile = step.drawPile
        discardPile = step.discardPile
        if (step.reshuffled) sweptReshuffled = true
      }
    }
    const lastCard = sweptDraw[sweptDraw.length - 1]!
    const drawnPlayable = canPlayCard(lastCard, { ...session, draw_penalty: 0 })
    const finalReshuffledNote = sweptReshuffled ? ' · deck reshuffled' : ''
    const finalHand = [...hand, ...sweptDraw]
    // On the No Mercy path the drawer may have taken many cards — announce the count so the
    // board shows "drew 7" instead of a silent single-card note.
    const drawCountNote =
      rules.mode === 'no_mercy' && sweptDraw.length > 1 ? ` drew ${sweptDraw.length}` : ` drew a card`

    if (drawnPlayable) {
      patch = {
        draw_pile: drawPile,
        discard_pile: discardPile,
        draw_penalty: 0,
        drawn_card_id: lastCard.id,
        current_turn_index: session.current_turn_index,
        uno_pending_player: null,
        uno_called: false,
        // Never disclose the drawn card in the shared board status — only the drawer sees it
        // (in their own hand + private "play it or keep it" hint).
        status_message: `${playerName(playerNames, playerId)}${drawCountNote}${finalReshuffledNote}${missedNote}`,
      }
    } else {
      const nextIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
      const nextPlayerId = session.turn_order[nextIndex]
      patch = {
        draw_pile: drawPile,
        discard_pile: discardPile,
        draw_penalty: 0,
        drawn_card_id: null,
        current_turn_index: nextIndex,
        uno_pending_player: null,
        uno_called: false,
        status_message: `${playerName(playerNames, playerId)}${drawCountNote} — ${playerName(playerNames, nextPlayerId)}'s turn${finalReshuffledNote}${missedNote}`,
      }
    }
    // Rebind for the trophy fold + writeHand at the bottom of this function.
    drawn = sweptDraw
    newHand = finalHand
  }

  // Fold the draw. `forced` marks a Draw Two / Draw Four penalty draw, which the "never made to
  // draw" and "no penalties" trophies key off, distinct from a voluntary single draw.
  const drawerStats = foldUnoDraw(currentUnoStats(hands, playerId), drawn.length, newHand.length, forced)
  // Double Stack (drawer credit): if the chain about to reset was already 3+, the drawer was
  // also "part of" that stack per spec.
  if (forced && (session.draw_stack_chain ?? 0) >= 3) drawerStats.uno_hs_stack3plus = 1
  const drawHands: UnoHandWrite[] = [{ player_id: playerId, cards: newHand, stats: drawerStats }]
  if (missed) drawHands.push({ player_id: missed.playerId, cards: missed.hand })

  // High Stakes attribution folds on the SETTER of the pending penalty (last_play_player_id).
  // (a setter who has since left has no hand row: nothing to credit)
  if (
    forced &&
    session.last_play_player_id &&
    session.last_play_player_id !== playerId &&
    creditableSeat(session, hands, session.last_play_player_id)
  ) {
    const setterId = session.last_play_player_id
    const setterStats = { ...currentUnoStats(hands, setterId) }
    // Twenty Load: cumulate the count of forced draws this attacker has dealt to THIS victim.
    const victimKey = `uno_hs_forced_of_${playerId}`
    setterStats[victimKey] = (setterStats[victimKey] ?? 0) + drawn.length
    // Stack Kingpin: bump the largest single penalty landed on any opponent from a Draw the
    // setter played (any chain length; 16+ triggers the trophy at facts time).
    bumpMaxU(setterStats, 'uno_hs_max_stack_sent', drawn.length)
    drawHands.push({ player_id: setterId, stats: setterStats })
  }

  // Mercy: a No Mercy player who crosses the 25-card threshold is knocked out in THE SAME transaction as the draw (or
  // the finish it triggers). Attribution goes to whoever played the Draw card that set the pending penalty.
  const drawKnockouts =
    rules.mode === 'no_mercy' && newHand.length >= UNO_MERCY_HAND_LIMIT
      ? [{ playerId, cards: newHand, attributionId: forced ? (session.last_play_player_id ?? null) : null }]
      : []
  return commitMoveWithKnockouts(supabase, gameId, session, hands, playerNames, rules.noMercyWin, timerSeconds, {
    patch,
    hands: drawHands,
    knockouts: drawKnockouts,
  })
}

// ── Keep the drawn card (pass) ──────────────────────────────────────────────────
export async function processUnoPass(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  expectedUpdatedAt?: string
): Promise<{ error?: string; skipped?: boolean }> {
  const {
    error: loadError,
    session,
    hands,
    timerSeconds,
    gameDurationSeconds,
    sessionStartedAt,
    rules,
    playerNames,
  } = await loadGameState(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Session not found' }
  // A delegated auto-play (turn expiry) acts only on the session version whose deadline expired: a move that landed
  // since (even one that renewed this seat's turn) means that expiry no longer applies.
  if (expectedUpdatedAt && session.updated_at !== expectedUpdatedAt) return { skipped: true }
  if (session.phase === 'finished') return { error: 'Game is finished' }

  const expired = await finalizeIfGameExpired(
    supabase,
    gameId,
    session,
    hands,
    playerNames,
    sessionStartedAt,
    gameDurationSeconds,
    rules.teamMode
  )
  if (expired) return expiredPlayResult(expired)

  if (session.phase !== 'playing') return { error: 'Resolve the current card first' }
  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your turn' }
  // You can only pass after drawing (keeping the card you just drew).
  if (!session.drawn_card_id) return { error: 'Draw a card first' }

  const direction = session.direction < 0 ? -1 : 1
  const nextIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
  const nextPlayerId = session.turn_order[nextIndex]

  const persisted = await persistSession(
    supabase,
    gameId,
    {
      drawn_card_id: null,
      current_turn_index: nextIndex,
      status_message: `${playerName(playerNames, playerId)} kept the card — ${playerName(playerNames, nextPlayerId)}'s turn`,
    },
    timerSeconds,
    session.updated_at
  )
  if (!persisted.won) return persisted.error ? { error: persisted.error } : { skipped: true }
  return {}
}

function updateHand(hands: UnoPlayerHand[], playerId: string, cards: UnoCard[]): UnoPlayerHand[] {
  return hands.map((h) => (h.player_id === playerId ? { ...h, cards } : h))
}

// ── Choose colour ───────────────────────────────────────────────────────────────
export async function processUnoChoose(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  color: UnoColor,
  expectedUpdatedAt?: string
): Promise<{ error?: string; skipped?: boolean }> {
  const {
    error: loadError,
    session,
    hands,
    timerSeconds,
    gameDurationSeconds,
    sessionStartedAt,
    rules,
    playerNames,
  } = await loadGameState(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Session not found' }
  // A delegated auto-play (turn expiry) acts only on the session version whose deadline expired: a move that landed
  // since (even one that renewed this seat's turn) means that expiry no longer applies.
  if (expectedUpdatedAt && session.updated_at !== expectedUpdatedAt) return { skipped: true }

  // Wild Color Roulette resolves through the same endpoint but takes a different flow — the
  // player reveals cards from the pile until they hit their named colour. Dispatch early.
  if (session.phase === 'color_roulette') {
    return processUnoColorRoulette(supabase, gameId, playerId, color)
  }

  const expired = await finalizeIfGameExpired(
    supabase,
    gameId,
    session,
    hands,
    playerNames,
    sessionStartedAt,
    gameDurationSeconds,
    rules.teamMode
  )
  if (expired) return expiredPlayResult(expired)

  if (session.phase !== 'choose_color') return { error: 'Not choosing a colour' }

  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (!UNO_COLORS.includes(color)) return { error: 'Choose a colour' }

  // For a Wild Reverse Draw Four the direction flips BEFORE the next seat is picked.
  // Two-player: like classic Reverse, the mover plays the card back onto themselves —
  // advance TWO seats so the Draw-4 penalty lands on the mover instead of the sole
  // opponent. `activePlayerCount<=2` guards the case where a knockout has left just
  // two active seats mid-round in No Mercy.
  const baseDirection = session.direction < 0 ? -1 : 1
  const isRevDraw4 = session.pending_wild === 'wild_reverse_draw4'
  const direction = isRevDraw4 ? -baseDirection : baseDirection
  const twoPlayerReverse = isRevDraw4 && activePlayerCount(session, hands) <= 2
  const steps = twoPlayerReverse ? 2 : 1
  const nextIndex = unoNextTurnIndex(session, hands, session.current_turn_index, steps, direction)
  const nextPlayerId = session.turn_order[nextIndex]

  // No Mercy wilds — Draw Six, Draw Ten, Wild Reverse Draw Four. All behave like a Wild Draw
  // Four for turn flow: colour is set, the next player owes N, may stack a Draw card of equal
  // or higher value, or draws the accumulated total. No challenge window.
  if (
    session.pending_wild === 'draw6' ||
    session.pending_wild === 'draw10' ||
    session.pending_wild === 'wild_reverse_draw4'
  ) {
    const add = session.pending_wild === 'draw6' ? 6 : session.pending_wild === 'draw10' ? 10 : 4
    const accumulated = (session.draw_penalty ?? 0) + add
    const kindLabel =
      session.pending_wild === 'draw6' ? 'Draw 6' : session.pending_wild === 'draw10' ? 'Draw 10' : 'Reverse Draw 4'
    const status = `${playerName(playerNames, nextPlayerId)} must draw ${accumulated} — colour ${UNO_COLOR_LABELS[color]} (${kindLabel})`
    const persisted = await persistSession(
      supabase,
      gameId,
      {
        required_color: color,
        pending_wild: null,
        challenge_prev_color: null,
        wd4_player_id: null,
        phase: 'playing',
        current_turn_index: nextIndex,
        direction,
        draw_penalty: accumulated,
        draw_penalty_kind: session.pending_wild,
        status_message: status,
      },
      timerSeconds,
      session.updated_at,
      { hands: [{ player_id: playerId, stats: foldUnoChoose(currentUnoStats(hands, playerId)) }] }
    )
    if (!persisted.won) return persisted.error ? { error: persisted.error } : { skipped: true }
    return {}
  }

  // Wild Color Roulette — the mover doesn't pick a colour; the NEXT player does. This branch
  // fires only when a mover has been (incorrectly) routed through choose_color for a roulette,
  // which shouldn't happen (roulette should transition to phase 'color_roulette' on the play).
  // Handled below in processUnoColorRoulette. If we somehow reach it, just advance the turn.
  if (session.pending_wild === 'wild_color_roulette') {
    const persisted = await persistSession(
      supabase,
      gameId,
      {
        required_color: null,
        pending_wild: 'wild_color_roulette',
        phase: 'color_roulette',
        current_turn_index: nextIndex,
        color_roulette_player_id: nextPlayerId,
        color_roulette_reveals: 0,
        status_message: `${playerName(playerNames, nextPlayerId)} — pick a colour to reveal until`,
      },
      timerSeconds,
      session.updated_at,
      { hands: [{ player_id: playerId, stats: foldUnoChoose(currentUnoStats(hands, playerId)) }] }
    )
    if (!persisted.won) return persisted.error ? { error: persisted.error } : { skipped: true }
    return {}
  }

  if (session.pending_wild === 'wild_draw4') {
    // The play carried any accumulated Draw Four penalty; this WD4 adds its own 4.
    const accumulated = (session.draw_penalty ?? 0) + 4
    // The challenge window only applies to a lone Draw Four — stacking replaces it.
    if (rules.wd4Challenge && !rules.stacking) {
      const status = `${playerName(playerNames, nextPlayerId)} — accept Draw 4 or challenge (colour: ${UNO_COLOR_LABELS[color]})`
      const persisted = await persistSession(
        supabase,
        gameId,
        {
          required_color: color,
          pending_wild: null,
          phase: 'challenge_window',
          current_turn_index: nextIndex,
          draw_penalty: accumulated,
          draw_penalty_kind: null,
          status_message: status,
        },
        timerSeconds,
        session.updated_at,
        { hands: [{ player_id: playerId, stats: foldUnoChoose(currentUnoStats(hands, playerId)) }] }
      )
      if (!persisted.won) return persisted.error ? { error: persisted.error } : { skipped: true }
      return {}
    }
    // Stacking (or challenge disabled): the penalty passes to the next player, who may stack
    // another Wild Draw Four (when stacking is on), draw the accumulated total, or — when the
    // challenge is also on — challenge the most recent Wild Draw Four player. Keep wd4_player_id
    // + challenge_prev_color only when the challenge stays available, so the UI can offer it.
    const challengeable = rules.wd4Challenge && rules.stacking
    const options = [rules.stacking ? 'stack a Wild Draw Four' : null, challengeable ? 'challenge' : null].filter(
      Boolean
    )
    const optionNote = options.length ? ` or ${options.join(' / ')}` : ''
    const status = `${playerName(playerNames, nextPlayerId)} must draw ${accumulated}${optionNote} — colour ${UNO_COLOR_LABELS[color]}`
    const persisted = await persistSession(
      supabase,
      gameId,
      {
        required_color: color,
        pending_wild: null,
        challenge_prev_color: challengeable ? session.challenge_prev_color : null,
        wd4_player_id: challengeable ? session.wd4_player_id : null,
        phase: 'playing',
        current_turn_index: nextIndex,
        draw_penalty: accumulated,
        draw_penalty_kind: rules.stacking ? 'wild_draw4' : null,
        status_message: status,
      },
      timerSeconds,
      session.updated_at,
      { hands: [{ player_id: playerId, stats: foldUnoChoose(currentUnoStats(hands, playerId)) }] }
    )
    if (!persisted.won) return persisted.error ? { error: persisted.error } : { skipped: true }
    return {}
  }

  // Plain Wild: colour set, play passes on.
  const persisted = await persistSession(
    supabase,
    gameId,
    {
      required_color: color,
      pending_wild: null,
      phase: 'playing',
      current_turn_index: nextIndex,
      draw_penalty: 0,
      draw_penalty_kind: null,
      status_message: `${playerName(playerNames, nextPlayerId)}'s turn — match ${UNO_COLOR_LABELS[color]}`,
    },
    timerSeconds,
    session.updated_at,
    { hands: [{ player_id: playerId, stats: foldUnoChoose(currentUnoStats(hands, playerId)) }] }
  )
  if (!persisted.won) return persisted.error ? { error: persisted.error } : { skipped: true }
  return {}
}

// ── Wild Color Roulette ────────────────────────────────────────────────────────
/**
 * The target player names a colour, then reveals cards from the draw pile one at a time until
 * they get a card of that colour (Wild cards do NOT count as a match — they still go into the
 * hand). All revealed cards are added to their hand and their turn ends. If the pile runs out
 * before a match, the discard is reshuffled once; if still no match, everything they revealed
 * still lands in their hand and the turn ends.
 */
export async function processUnoColorRoulette(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  color: UnoColor
): Promise<{ error?: string; skipped?: boolean }> {
  const {
    error: loadError,
    session,
    hands,
    timerSeconds,
    gameDurationSeconds,
    sessionStartedAt,
    rules,
    playerNames,
  } = await loadGameState(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Session not found' }
  const expired = await finalizeIfGameExpired(
    supabase,
    gameId,
    session,
    hands,
    playerNames,
    sessionStartedAt,
    gameDurationSeconds,
    rules.teamMode
  )
  if (expired) return expiredPlayResult(expired)
  if (session.phase !== 'color_roulette') return { error: 'No Color Roulette pending' }
  if (session.color_roulette_player_id !== playerId) return { error: 'Not your Color Roulette' }
  if (!UNO_COLORS.includes(color)) return { error: 'Choose a colour' }

  // Colour pick only sets the target colour and keeps the phase — the target draws cards
  // one at a time via processUnoDraw (each Draw click reveals one). Better UX than the
  // server auto-drawing and reporting "revealed N" back — the player wants to feel the
  // reveals happen. See processUnoDraw's color_roulette branch for the reveal loop.
  const status = `${playerName(playerNames, playerId)} picked ${UNO_COLOR_LABELS[color]} — click Draw until you hit it`

  const persisted = await persistSession(
    supabase,
    gameId,
    {
      required_color: color,
      status_message: status,
    },
    timerSeconds,
    session.updated_at
  )
  if (!persisted.won) return persisted.error ? { error: persisted.error } : { skipped: true }
  return {}
}

/**
 * Reveal ONE card during a color_roulette phase. Called from processUnoDraw when the target
 * clicks the Draw button. Adds the card to the target's hand; if it matches required_color
 * (wilds don't count), the roulette resolves — clear the phase, advance the turn, credit
 * the caster's running max reveal count, and check the Mercy hand limit.
 */
async function processUnoColorRouletteReveal(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  session: UnoSession,
  hands: UnoPlayerHand[],
  playerNames: Map<string, string>,
  rules: UnoRules,
  timerSeconds: number
): Promise<{ error?: string; skipped?: boolean }> {
  const color = session.required_color as UnoColor | null
  if (!color) return { error: 'Pick a colour first' }

  let pile = [...((session.draw_pile as UnoCard[]) ?? [])]
  let discard = [...((session.discard_pile as UnoCard[]) ?? [])]
  if (pile.length === 0) {
    const refill = refillDrawPile(pile, discard)
    pile = refill.drawPile
    discard = refill.discardPile
  }
  if (pile.length === 0) {
    // Nothing left to reveal — the pile plus the entire discard couldn't produce a card,
    // and the eliminated hands (returned to the pile on Mercy) don't rescue us either.
    // On No Mercy the round can't meaningfully continue from here, so end it via
    // lowest-hand-wins. Classic falls back to "no colour found, next player's turn".
    if (rules.mode === 'no_mercy') {
      const ended = await finishByLowestHand(
        supabase,
        gameId,
        session,
        hands,
        playerNames,
        `Deck ran out mid-Roulette (no ${UNO_COLOR_LABELS[color]}) —`,
        rules.teamMode,
        { patch: { draw_pile: pile, discard_pile: discard } }
      )
      return finishOutcome(ended)
    }
    const direction = session.direction < 0 ? -1 : 1
    const nextIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
    const nextPlayerId = session.turn_order[nextIndex]
    const status = `${playerName(playerNames, playerId)} — pile ran out, no ${UNO_COLOR_LABELS[color]} · ${playerName(playerNames, nextPlayerId)}'s turn`
    const resumed = await persistSession(
      supabase,
      gameId,
      {
        draw_pile: pile,
        discard_pile: discard,
        pending_wild: null,
        color_roulette_player_id: null,
        color_roulette_reveals: null,
        phase: 'playing',
        current_turn_index: nextIndex,
        status_message: status,
      },
      timerSeconds,
      session.updated_at
    )
    return resumed.won ? {} : lostWrite(resumed)
  }

  const card = pile.pop()!
  const targetHand = [...handForPlayer(hands, playerId), card]
  const matched = !isWildCard(card) && card.color === color

  // Running per-event reveal counter (starts at 0 when the roulette opens, incremented
  // below on every no-match Draw, cleared on match). This is what Roulette Master (>=5)
  // and Roulette Executioner (>=8) key off — inflated the target's hand-size delta with
  // unrelated draws would silently earn either trophy on a mid-round roulette.
  const priorReveals = session.color_roulette_reveals ?? 0
  const revealCount = priorReveals + 1

  if (!matched) {
    // Keep revealing — same seat, same phase; the card lands in the hand and the player
    // clicks Draw again for the next reveal.
    // A long unlucky reveal streak can push the target past 25 mid-roulette: the knockout (attribution: the Colour
    // Roulette caster) commits with the reveal.
    return commitMoveWithKnockouts(supabase, gameId, session, hands, playerNames, rules.noMercyWin, timerSeconds, {
      patch: {
        draw_pile: pile,
        discard_pile: discard,
        color_roulette_reveals: revealCount,
        status_message: `${playerName(playerNames, playerId)} revealed a ${cardLabel(card)} — still hunting ${UNO_COLOR_LABELS[color]}`,
      },
      hands: [{ player_id: playerId, cards: targetHand }],
      knockouts:
        rules.mode === 'no_mercy' && targetHand.length >= UNO_MERCY_HAND_LIMIT
          ? [{ playerId, cards: targetHand, attributionId: session.last_play_player_id ?? null }]
          : [],
    })
  }

  // Match: resolve the roulette. Card lands in hand, required_color persists (the next
  // player must match this colour on their normal turn), turn advances.
  const direction = session.direction < 0 ? -1 : 1
  const nextIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
  const nextPlayerId = session.turn_order[nextIndex]
  const status = `${playerName(playerNames, playerId)} hit ${UNO_COLOR_LABELS[color]} — ${playerName(playerNames, nextPlayerId)}'s turn`

  // High Stakes — record the largest single roulette reveal count on the CASTER's row
  // (last_play_player_id captured whoever played the Wild Colour Roulette). unoFacts turns
  // this into Roulette Master (>=5) and Roulette Executioner (>=8).
  const casterId = session.last_play_player_id ?? null
  const rouletteHands: UnoHandWrite[] = [{ player_id: playerId, cards: targetHand }]
  // (a caster who has since left has no hand row: finish / move payloads never name a seat that is gone)
  if (revealCount > 0 && casterId !== playerId && creditableSeat(session, hands, casterId)) {
    const casterStats = { ...currentUnoStats(hands, casterId) }
    bumpMaxU(casterStats, 'uno_hs_max_roulette_dealt', revealCount)
    rouletteHands.push({ player_id: casterId, stats: casterStats })
  }

  // Mercy: revealing a huge stack of cards can push the target past the knockout limit (attribution: the caster); the
  // knockout commits with the resolution.
  return commitMoveWithKnockouts(supabase, gameId, session, hands, playerNames, rules.noMercyWin, timerSeconds, {
    patch: {
      draw_pile: pile,
      discard_pile: discard,
      pending_wild: null,
      color_roulette_player_id: null,
      color_roulette_reveals: null,
      phase: 'playing',
      current_turn_index: nextIndex,
      status_message: status,
    },
    hands: rouletteHands,
    knockouts:
      rules.mode === 'no_mercy' && targetHand.length >= UNO_MERCY_HAND_LIMIT
        ? [{ playerId, cards: targetHand, attributionId: casterId }]
        : [],
  })
}

// ── Wild Draw Four challenge ──────────────────────────────────────────────────────
export async function processUnoChallenge(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  challenge: boolean,
  expectedUpdatedAt?: string
): Promise<{ error?: string; skipped?: boolean }> {
  const {
    error: loadError,
    session,
    hands,
    timerSeconds,
    gameDurationSeconds,
    sessionStartedAt,
    rules,
    playerNames,
  } = await loadGameState(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Session not found' }
  // A delegated auto-play (turn expiry) acts only on the session version whose deadline expired: a move that landed
  // since (even one that renewed this seat's turn) means that expiry no longer applies.
  if (expectedUpdatedAt && session.updated_at !== expectedUpdatedAt) return { skipped: true }

  const expired = await finalizeIfGameExpired(
    supabase,
    gameId,
    session,
    hands,
    playerNames,
    sessionStartedAt,
    gameDurationSeconds,
    rules.teamMode
  )
  if (expired) return expiredPlayResult(expired)

  // Challengeable either in the dedicated window (challenge-only games) or, when stacking is on,
  // while a Wild Draw Four penalty sits pending on the current player in normal play. The +4
  // player may have left (wd4_player_id cleared); the penalty is then still pending and the
  // challenge degrades to a plain accept below, so wd4_player_id is deliberately not required.
  const inChallengeWindow = session.phase === 'challenge_window'
  const inStackedPenalty =
    session.phase === 'playing' &&
    rules.wd4Challenge &&
    rules.stacking &&
    (session.draw_penalty ?? 0) > 0 &&
    session.draw_penalty_kind === 'wild_draw4'
  if (!inChallengeWindow && !inStackedPenalty) return { error: 'No Wild Draw Four to challenge' }

  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your decision' }

  const wd4PlayerId = session.wd4_player_id
  const prevColor = session.challenge_prev_color
  const penalty = session.draw_penalty > 0 ? session.draw_penalty : 4
  const direction = session.direction < 0 ? -1 : 1
  // "Turn skipped as normal": after the WD4 resolves, play continues past this player.
  const afterIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
  const afterId = session.turn_order[afterIndex]

  const clearBoard = (extra: Partial<UnoSession>): Partial<UnoSession> => ({
    pending_wild: null,
    challenge_prev_color: null,
    wd4_player_id: null,
    draw_penalty: 0,
    draw_penalty_kind: null,
    phase: 'playing',
    ...extra,
  })

  const applyDrawTo = async (
    targetId: string
  ): Promise<{ hand: UnoCard[]; drawPile: UnoCard[]; discardPile: UnoCard[]; drawnCount: number }> => {
    const { drawn, drawPile, discardPile } = drawCardsWithRefill(
      (session.draw_pile as UnoCard[]) ?? [],
      (session.discard_pile as UnoCard[]) ?? [],
      penalty
    )
    return { hand: [...handForPlayer(hands, targetId), ...drawn], drawPile, discardPile, drawnCount: drawn.length }
  }

  // A challenge needs a Wild Draw Four player whose hand can be revealed; if they left, it can only be accepted.
  if (!challenge || !wd4PlayerId) {
    // Accept: challenger draws 4 and is skipped.
    if (!playerId) return { error: 'Player required' }
    const drawResult = await applyDrawTo(playerId)
    const persisted = await persistSession(
      supabase,
      gameId,
      clearBoard({
        draw_pile: drawResult.drawPile,
        discard_pile: drawResult.discardPile,
        current_turn_index: afterIndex,
        status_message: `${playerName(playerNames, playerId)} drew ${drawResult.drawnCount} — ${playerName(playerNames, afterId)}'s turn`,
      }),
      timerSeconds,
      session.updated_at,
      { hands: [{ player_id: playerId, cards: drawResult.hand }] }
    )
    if (!persisted.won) return persisted.error ? { error: persisted.error } : { skipped: true }
    return {}
  }

  // Challenge: reveal the WD4 player's hand; did they hold a card of the previous colour?
  const wd4Hand = wd4PlayerId ? handForPlayer(hands, wd4PlayerId) : []
  const hadMatch = prevColor != null && wd4Hand.some((c) => c.color === prevColor)

  if (hadMatch && wd4PlayerId) {
    // Challenge succeeds: the Wild Draw Four player draws instead and their turn ends. The
    // challenger never lost their turn (they only avoided the draw), so play stays on them —
    // it's now their normal turn, matching the colour the WD4 named (required_color is kept).
    const drawResult = await applyDrawTo(wd4PlayerId)
    const colorHint = session.required_color ? ` — match ${UNO_COLOR_LABELS[session.required_color as UnoColor]}` : ''
    // Spell out WHY the challenge won — the bluffer was caught holding the previous colour.
    const prevLabel = prevColor ? UNO_COLOR_LABELS[prevColor] : 'the colour'
    const persisted = await persistSession(
      supabase,
      gameId,
      clearBoard({
        draw_pile: drawResult.drawPile,
        discard_pile: drawResult.discardPile,
        current_turn_index: session.current_turn_index,
        status_message: `Challenge won — ${playerName(playerNames, wd4PlayerId)} was hiding a ${prevLabel} card! ${playerName(playerNames, wd4PlayerId)} draws ${penalty}. ${playerName(playerNames, playerId)}'s turn${colorHint}`,
      }),
      timerSeconds,
      session.updated_at,
      {
        hands: [
          { player_id: wd4PlayerId, cards: drawResult.hand },
          // The challenger correctly called the bluff — "Challenger".
          { player_id: playerId, stats: foldUnoEvent(currentUnoStats(hands, playerId), 'uno_challenges_won') },
        ],
      }
    )
    if (!persisted.won) return persisted.error ? { error: persisted.error } : { skipped: true }
    return {}
  }

  // Challenge fails: challenger draws the pending total plus the failed-challenge extra
  // (the standard +2 when wd4ChallengePenalty is 6; +0 for the milder 4 variant). This
  // generalises correctly when the pending penalty is a stacked total, not just a single 4.
  const failPenalty = penalty + (rules.wd4ChallengePenalty - 4)
  const { drawn, drawPile, discardPile } = drawCardsWithRefill(
    (session.draw_pile as UnoCard[]) ?? [],
    (session.discard_pile as UnoCard[]) ?? [],
    failPenalty
  )
  const failHand = [...handForPlayer(hands, playerId), ...drawn]
  // Spell out WHY the challenge lost — the Wild Draw Four was legal (no card of the prev colour).
  const failLabel = prevColor ? UNO_COLOR_LABELS[prevColor] : 'that colour'
  const wd4Name = wd4PlayerId ? playerName(playerNames, wd4PlayerId) : 'They'
  const persisted = await persistSession(
    supabase,
    gameId,
    clearBoard({
      draw_pile: drawPile,
      discard_pile: discardPile,
      current_turn_index: afterIndex,
      status_message: `Challenge lost — ${wd4Name} had no ${failLabel} card. ${playerName(playerNames, playerId)} draws ${drawn.length}. ${playerName(playerNames, afterId)}'s turn`,
    }),
    timerSeconds,
    session.updated_at,
    {
      hands: [
        { player_id: playerId, cards: failHand },
        // The Wild Draw Four was legal — the WD4 player survived a challenge on their own Draw Four.
        ...(wd4PlayerId
          ? [{ player_id: wd4PlayerId, stats: foldUnoEvent(currentUnoStats(hands, wd4PlayerId), 'uno_bluff_survived') }]
          : []),
      ],
    }
  )
  if (!persisted.won) return persisted.error ? { error: persisted.error } : { skipped: true }
  return {}
}

// ── 0-7 rule: seven swap ────────────────────────────────────────────────────────
export async function processUnoSwap(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  targetId: string,
  expectedUpdatedAt?: string
): Promise<{ error?: string; skipped?: boolean }> {
  const {
    error: loadError,
    session,
    hands,
    timerSeconds,
    gameDurationSeconds,
    sessionStartedAt,
    rules,
    playerNames,
  } = await loadGameState(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Session not found' }
  // A delegated auto-play (turn expiry) acts only on the session version whose deadline expired: a move that landed
  // since (even one that renewed this seat's turn) means that expiry no longer applies.
  if (expectedUpdatedAt && session.updated_at !== expectedUpdatedAt) return { skipped: true }

  const expired = await finalizeIfGameExpired(
    supabase,
    gameId,
    session,
    hands,
    playerNames,
    sessionStartedAt,
    gameDurationSeconds,
    rules.teamMode
  )
  if (expired) return expiredPlayResult(expired)

  if (session.phase !== 'swap_target') return { error: 'No hand swap pending' }

  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (targetId === playerId) return { error: 'Pick another player to swap with' }
  if (!(session.turn_order ?? []).includes(targetId) || unoLeftPlayerIds(session).includes(targetId)) {
    return { error: 'That player is not in the game' }
  }
  if (((session.eliminated_player_ids as string[] | null) ?? []).includes(targetId)) {
    return { error: 'That player is knocked out' }
  }
  if (unoHandCount(hands, targetId) === 0) return { error: 'That player has no cards to swap' }

  const myCards = handForPlayer(hands, playerId)
  const theirCards = handForPlayer(hands, targetId)

  // Swap done, then play passes on normally (a 7 has no skip).
  const handsAfter = updateHand(updateHand(hands, playerId, theirCards), targetId, myCards)
  const direction = session.direction < 0 ? -1 : 1
  const nextIndex = unoNextTurnIndex(session, handsAfter, session.current_turn_index, 1, direction)
  const nextPlayerId = session.turn_order[nextIndex]

  // A swap can leave a player on exactly one card — they now owe an "UNO" call.
  const swapPending = theirCards.length === 1 ? playerId : myCards.length === 1 ? targetId : null

  // Mercy: a 7-swap can hand a player 25+ cards, who is knocked out in the same transaction as the swap. The swapper
  // CHOSE to take the pile, so no attribution to another player; the target only crosses the threshold if the
  // swapper's own hand was already at the limit, so attribute that back to the swapper.
  const swapKnockouts =
    rules.mode === 'no_mercy'
      ? [
          ...(theirCards.length >= UNO_MERCY_HAND_LIMIT
            ? [{ playerId, cards: theirCards, attributionId: null as string | null }]
            : []),
          ...(myCards.length >= UNO_MERCY_HAND_LIMIT
            ? [{ playerId: targetId, cards: myCards, attributionId: playerId as string | null }]
            : []),
        ]
      : []
  return commitMoveWithKnockouts(supabase, gameId, session, hands, playerNames, rules.noMercyWin, timerSeconds, {
    patch: {
      phase: 'playing',
      current_turn_index: nextIndex,
      uno_pending_player: swapPending,
      uno_called: false,
      status_message: `${playerName(playerNames, playerId)} swapped hands with ${playerName(playerNames, targetId)} — ${playerName(playerNames, nextPlayerId)}'s turn`,
    },
    hands: [
      { player_id: playerId, cards: theirCards },
      { player_id: targetId, cards: myCards },
    ],
    knockouts: swapKnockouts,
  })
}

// ── UNO call ──────────────────────────────────────────────────────────────────
export async function processUnoCall(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string; skipped?: boolean }> {
  const { data: sessionRaw, error: readError } = await supabase
    .from('uno_sessions')
    .select('*')
    .eq('game_id', gameId)
    .maybeSingle()
  if (readError) return { error: internalErrorMessage('uno', readError) }
  const session = sessionRaw as UnoSession | null
  if (!session) return { error: 'Session not found' }
  if (session.uno_pending_player !== playerId) return { error: 'Nothing to call' }
  if (session.uno_called) return {}

  const { data: playerRow } = await supabase.from('players').select('name').eq('id', playerId).maybeSingle()
  const nm = playerRow?.name ?? 'A player'

  const { data: landed, error: callError } = await supabase
    .from('uno_sessions')
    .update({ uno_called: true, status_message: `${nm} called last card! 🎉`, updated_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .eq('updated_at', session.updated_at)
    .select('game_id')
  if (callError) return { error: internalErrorMessage('uno', callError) }
  // A lost CAS (the game moved on) means the call did not land.
  if (!landed || landed.length === 0) return { skipped: true }
  // Correctly called UNO on the second-to-last card via the standalone button — "UNO!". Only when
  // the call actually landed (CAS won), and read/written here since this path skips loadGameState.
  if ((landed?.length ?? 0) > 0) {
    const { data: handRow } = await supabase
      .from('uno_player_hands')
      .select('stats')
      .eq('game_id', gameId)
      .eq('player_id', playerId)
      .maybeSingle()
    const prev = ((handRow?.stats as UnoRoundStats | null) ?? {}) as UnoRoundStats
    await writeUnoStats(supabase, gameId, playerId, foldUnoEvent(prev, 'uno_uno_calls'))
  }
  return {}
}

// ── Turn / game expiry ────────────────────────────────────────────────────────
/** A write that did not land: a database error is surfaced, a lost CAS is a skip. */
function lostWrite(persisted: { error?: string }): { error?: string; skipped?: boolean } {
  return persisted.error ? { error: persisted.error } : { skipped: true }
}

/**
 * Timer poke. `skipped` alone means nothing to do (a finished round, a turn that is not yet due); `conflict` means
 * the poke lost the claim to another request (a move, a finish, a rematch), which the route answers with 409.
 */
export async function processUnoExpireTurn(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string; skipped?: boolean; conflict?: boolean }> {
  const result = await expireUnoTurn(supabase, gameId)
  if (result.skipped && !result.idle) return { skipped: true, conflict: true }
  if (result.idle) return { skipped: true }
  return result
}

async function expireUnoTurn(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string; skipped?: boolean; idle?: boolean }> {
  const {
    error: loadError,
    session,
    hands,
    timerSeconds,
    gameDurationSeconds,
    sessionStartedAt,
    rules,
    playerNames,
  } = await loadGameState(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { skipped: true, idle: true }

  const expired = await finalizeIfGameExpired(
    supabase,
    gameId,
    session,
    hands,
    playerNames,
    sessionStartedAt,
    gameDurationSeconds,
    rules.teamMode
  )
  if (expired) return finishOutcome(expired)

  if (!session.turn_deadline_at || new Date(session.turn_deadline_at as string) > new Date()) {
    return { skipped: true, idle: true }
  }

  const currentId = currentPlayerId(session)
  if (!currentId) return { error: 'No current player' }

  // Concurrent expire pokes all pass the deadline check above; the winner's auto-play advances the
  // turn, so the losers' delegated processor re-reads a moved-on session and fails its own turn /
  // phase validation ("Not your turn", "Card not in hand", ...). That is not a client error — the
  // turn was already handled — so when the session changed under us, report a skip instead.
  // Only validation errors convert: a database failure (the generic internal message) stays an error.
  const expectedUpdatedAt = session.updated_at
  const settle = async (result: { error?: string }): Promise<{ error?: string; skipped?: boolean }> => {
    if (!result.error || result.error === INTERNAL_ERROR_MESSAGE) return result
    // The delegate ended the round because the game timer ran out (a committed finish): for a turn expiry that is
    // success, not a version-conflict skip (the finish itself changed the version).
    if (result.error === UNO_TIMES_UP_ERROR) return {}
    const { data: fresh, error: rereadError } = await supabase
      .from('uno_sessions')
      .select('updated_at')
      .eq('game_id', gameId)
      .maybeSingle()
    // A failed reread cannot establish that the caller sent an invalid action: it is a database failure.
    if (rereadError) return { error: internalErrorMessage('uno', rereadError) }
    if (fresh && fresh.updated_at !== expectedUpdatedAt) return { skipped: true }
    return result
  }

  const hand = handForPlayer(hands, currentId)
  if (hand.length === 0) {
    const direction = session.direction < 0 ? -1 : 1
    const nextIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
    const nextId = session.turn_order[nextIndex]
    if (!nextId || unoHandCount(hands, nextId) === 0) {
      const finished = await finishByLowestHand(
        supabase,
        gameId,
        session,
        hands,
        playerNames,
        'Nobody left —',
        rules.teamMode
      )
      return finishOutcome(finished)
    }
    const top = session.top_card
    const matchHint = top ? ` — match ${cardLabel(top)}` : ''
    const advanced = await persistSession(
      supabase,
      gameId,
      {
        current_turn_index: nextIndex,
        phase: 'playing',
        status_message: `${playerName(playerNames, nextId)}'s turn${matchHint}`,
      },
      timerSeconds,
      session.updated_at
    )
    return advanced.won ? {} : lostWrite(advanced)
  }

  if (session.phase === 'choose_color') {
    return settle(await processUnoChoose(supabase, gameId, currentId, dominantColor(hand), expectedUpdatedAt))
  }

  if (session.phase === 'challenge_window') {
    // Auto-accept on timeout — the safe default.
    return settle(await processUnoChallenge(supabase, gameId, currentId, false, expectedUpdatedAt))
  }

  if (session.phase === 'swap_target') {
    // Auto-swap with the first other active player on timeout.
    const leftNow = unoLeftPlayerIds(session)
    const targetId = (session.turn_order ?? []).find(
      (id) => id !== currentId && !leftNow.includes(id) && unoHandCount(hands, id) > 0
    )
    if (targetId) return settle(await processUnoSwap(supabase, gameId, currentId, targetId, expectedUpdatedAt))
    // No one to swap with — just resume play.
    const direction = session.direction < 0 ? -1 : 1
    const nextIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
    const resumed = await persistSession(
      supabase,
      gameId,
      {
        phase: 'playing',
        current_turn_index: nextIndex,
        status_message: `${playerName(playerNames, session.turn_order[nextIndex])}'s turn`,
      },
      timerSeconds,
      session.updated_at
    )
    return resumed.won ? {} : lostWrite(resumed)
  }

  // Already drew this turn and idled — keep the card (auto-pass), the safe default.
  if (session.drawn_card_id) {
    return settle(await processUnoPass(supabase, gameId, currentId, expectedUpdatedAt))
  }

  if (hasPlayableCard(hand, session)) {
    const playable = hand.filter((c) => canPlayCard(c, session))
    // Prefer a non-wild, lowest-points card so the auto-play doesn't waste a wild.
    const nonWild = playable.filter((c) => !isWildCard(c))
    const pool = nonWild.length > 0 ? nonWild : playable
    const card = [...pool].sort((a, b) => cardPoints(a) - cardPoints(b))[0]!
    return settle(
      await processUnoPlay(supabase, gameId, currentId, card.id, hand.length - 1 === 1, { expectedUpdatedAt })
    )
  }

  return settle(await processUnoDraw(supabase, gameId, currentId, expectedUpdatedAt))
}

export async function finishExpiredUnoGame(
  supabase: SupabaseClient,
  game: Pick<Game, 'id' | 'status' | 'session_started_at' | 'game_duration_seconds' | 'uno_team_mode'> & {
    sessions_played?: number | null
  }
): Promise<FinishResult> {
  if (game.status !== 'active') return { won: false }
  if (!unoGameSessionExpired(game.session_started_at, game.game_duration_seconds)) return { won: false }

  const gameId = game.id
  // Session first, hands after (see loadGameState): the finish claims with this session's version, so hands that are
  // newer than it make the claim lose instead of being ranked under an older token.
  const sessionRes = await supabase.from('uno_sessions').select('*').eq('game_id', gameId).maybeSingle()
  const [handsRes, playersRes] = await Promise.all([
    supabase.from('uno_player_hands').select('player_id, cards, player_order').eq('game_id', gameId),
    supabase.from('players').select('id, name').eq('game_id', gameId),
  ])

  if (sessionRes.error ?? handsRes.error)
    return { won: false, error: internalErrorMessage('uno', sessionRes.error ?? handsRes.error) }
  const session = sessionRes.data as UnoSession | null
  if (!session) return { won: false }
  const playerNames = new Map<string, string>()
  for (const p of playersRes.data ?? []) playerNames.set(p.id, p.name)

  const hands = (handsRes.data as UnoPlayerHand[]) ?? []
  // An already finished round only gets its games-row flip completed by the function (no re-rank, no re-award).
  const finished = await finishByLowestHand(
    supabase,
    gameId,
    session,
    hands,
    playerNames,
    "Time's up!",
    game.uno_team_mode === true,
    // The expiry was decided from THIS snapshot: the finish applies only to that round (not a later rematch).
    {
      round: {
        sessionStartedAt: game.session_started_at ?? null,
        sessionsPlayed: game.sessions_played ?? undefined,
        gameDurationSeconds: game.game_duration_seconds ?? null,
      },
    }
  )
  return finished.already ? { won: true } : finished
}

// ── Host mode ─────────────────────────────────────────────────────────────────
export type UnoHostMode = 'spectator' | 'player'
const UNO_HOST_MODE_KEY = 'uno_host_mode'

export function getUnoHostMode(gameCode: string): UnoHostMode {
  if (typeof window === 'undefined') return 'player'
  return (localStorage.getItem(`${UNO_HOST_MODE_KEY}_${gameCode}`) as UnoHostMode) ?? 'player'
}

export function setUnoHostMode(gameCode: string, mode: UnoHostMode): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${UNO_HOST_MODE_KEY}_${gameCode}`, mode)
}

// ── Remove player ─────────────────────────────────────────────────────────────
/** Surfaced (as a 409 by the DELETE players route) when a leave keeps losing the session race. */
export const UNO_REMOVE_CONFLICT_ERROR = 'Game changed, please try again.'
const UNO_REMOVE_MAX_ATTEMPTS = 4

/**
 * A leave rewrites turn_order / current_turn_index from a snapshot of the session, so the write is
 * compare-and-swapped on `updated_at`. Two concurrent leaves (or a leave racing a play) used to
 * each write from the same snapshot, the second silently dropping the first removal and leaving a
 * dead seat in turn_order. Nothing retries a Leave, so we retry here against a freshly read
 * session, and only delete the players row once the session write has landed.
 */
export async function removeUnoPlayer(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  playerNameArg?: string
): Promise<{ error: string | null; retained?: boolean }> {
  for (let attempt = 0; attempt < UNO_REMOVE_MAX_ATTEMPTS; attempt++) {
    const result = await removeUnoPlayerOnce(supabase, gameId, playerId, playerNameArg)
    if (result !== 'retry') return result
  }
  return { error: UNO_REMOVE_CONFLICT_ERROR }
}

/** The leave claim + patch + the leaver's rows in ONE transaction (leave_uno_seat). A lost claim retries. */
async function leaveUnoSeat(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  expectedUpdatedAt: string,
  patch: Record<string, unknown>
): Promise<{ error: string | null } | 'retry'> {
  const { updated_at: _updatedAt, ...sessionPatch } = patch
  void _updatedAt
  const { data, error } = await supabase.rpc('leave_uno_seat', {
    p_game_id: gameId,
    p_player_id: playerId,
    p_expected_updated_at: expectedUpdatedAt,
    p_session_patch: sessionPatch,
  })
  if (error) return { error: internalErrorMessage('uno', error) }
  const outcome = (data ?? {}) as { status?: string; reason?: string }
  if (outcome.status === 'lost') return 'retry'
  if (outcome.status !== 'left') {
    return {
      error: internalErrorMessage('uno', `leave_uno_seat rejected the call: ${outcome.reason ?? outcome.status}`),
    }
  }
  return { error: null }
}

async function removeUnoPlayerOnce(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  playerNameArg?: string
): Promise<{ error: string | null; retained?: boolean } | 'retry'> {
  const { data: sessionRaw, error: lookupError } = await supabase
    .from('uno_sessions')
    .select('*')
    .eq('game_id', gameId)
    .maybeSingle()
  // A failed lookup is not "no session": falling through would delete the player's rows while the
  // session still lists them in turn_order. A successful lookup that finds no row still reaches cleanup.
  if (lookupError) return { error: internalErrorMessage('uno', lookupError) }
  const session = sessionRaw as UnoSession | null

  // Seat RETENTION (a published result, a player who already went out) is decided by remove_uno_lobby_seat from the locked
  // games row and session row together, never here from two separate reads: this function only takes the live-round
  // branch below for a seat that is actually playing, and hands every other case to that function.
  const order = session ? [...(session.turn_order ?? [])] : []
  const removedIndex = order.indexOf(playerId)

  if (session && removedIndex >= 0 && session.phase !== 'finished' && !session.finish_order?.includes(playerId)) {
    const { data: gameRow, error: gameError } = await supabase
      .from('games')
      .select('timer_seconds, uno_team_mode')
      .eq('id', gameId)
      .maybeSingle()
    // A failed settings read is not "not Team-Up": the ordinary branch would shrink a four-seat Team-Up turn order to
    // three and delete the leaver's rows, bypassing the team path. Stop before choosing a branch.
    if (gameError) return { error: internalErrorMessage('uno', gameError) }
    const timerSeconds = gameRow?.timer_seconds ?? 0
    const teamMode = gameRow?.uno_team_mode === true
    const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
    const names = new Map<string, string>()
    for (const p of playerRows ?? []) names.set(p.id, p.name)
    const removedName = playerNameArg ?? names.get(playerId) ?? 'A player'

    // ── Team-Up (2v2): keep the leaver's seat in turn_order (teams derive from A-B-A-B
    // parity, which needs 4 seats) and mark them left instead. If their teammate is still
    // in, pause for that teammate to choose continue-solo vs forfeit; if the whole team is
    // gone, the other team wins. ────────────────────────────────────────────────────────
    if (teamMode && order.length === UNO_TEAM_PLAYERS) {
      // A retry of a departure that already COMMITTED (the marker is in left_player_ids) is cleanup only: it must not
      // claim the session again, and above all must not reopen a teammate decision that was already resolved.
      if (unoLeftPlayerIds(session).includes(playerId)) {
        const { data: departure, error: departureError } = await supabase.rpc('complete_uno_departure', {
          p_game_id: gameId,
          p_player_id: playerId,
        })
        if (departureError) return { error: internalErrorMessage('uno', departureError) }
        if ((departure as { status?: string } | null)?.status === 'completed') return { error: null }
        // `none`: nothing was deleted. That is fine while the SAME round still carries the marker (the cleanup is pending
        // until the round ends); but if the session no longer carries it (a finish and a rematch replaced the round) and
        // the leaver's row is still there, the leave did NOT happen: decide again from the current rows.
        const { data: again, error: againError } = await supabase
          .from('uno_sessions')
          .select('left_player_ids, turn_order')
          .eq('game_id', gameId)
          .maybeSingle()
        if (againError) return { error: internalErrorMessage('uno', againError) }
        if (again && unoLeftPlayerIds(again as UnoSession).includes(playerId)) return { error: null }
        const { data: seat, error: seatError } = await supabase
          .from('players')
          .select('id')
          .eq('id', playerId)
          .eq('game_id', gameId)
          .maybeSingle()
        if (seatError) return { error: internalErrorMessage('uno', seatError) }
        return seat ? 'retry' : { error: null }
      }
      const { data: handRows, error: handError } = await supabase
        .from('uno_player_hands')
        .select('player_id, cards')
        .eq('game_id', gameId)
      // A failed read is not "no hands": it would end the round with no winner and delete the leaver's rows.
      if (handError) return { error: internalErrorMessage('uno', handError) }
      const hands = (handRows ?? []) as UnoPlayerHand[]
      const prevLeft = unoLeftPlayerIds(session)
      const leftIds = prevLeft.includes(playerId) ? prevLeft : [...prevLeft, playerId]
      const partner = unoTeammateId(order, playerId)
      const partnerActive = !!partner && !leftIds.includes(partner) && unoHandCount(hands, partner) > 0
      const opponentIds = order.filter(
        (id, i) => i % 2 !== removedIndex % 2 && !leftIds.includes(id) && unoHandCount(hands, id) > 0
      )

      const teamUpdate: Record<string, unknown> = {
        left_player_ids: leftIds,
        uno_pending_player: session.uno_pending_player === playerId ? null : session.uno_pending_player,
        updated_at: new Date().toISOString(),
      }
      // The pending Wild Draw Four player left: drop the challenge (nobody's hand can be revealed).
      if (session.wd4_player_id === playerId) {
        teamUpdate.wd4_player_id = null
        teamUpdate.challenge_prev_color = null
      }

      if (partnerActive) {
        // Pause the round; the remaining teammate decides via processUnoTeamLeaveDecision.
        teamUpdate.phase = 'team_leave_decision'
        teamUpdate.team_decider_id = partner
        teamUpdate.turn_deadline_at = null
        teamUpdate.status_message = `${removedName} left — ${names.get(partner!) ?? 'their teammate'}: play on solo (1 vs 2) or forfeit?`
      } else {
        // The leaver's whole team is gone — the opposing team takes the round.
        const winnerId = opponentIds[0] ?? null
        const winnerMate = winnerId ? unoTeammateId(order, winnerId) : null
        const winNames = [winnerId, winnerMate]
          .filter((id): id is string => !!id && !leftIds.includes(id))
          .map((id) => names.get(id) ?? 'Winner')
        teamUpdate.phase = 'finished'
        teamUpdate.team_decider_id = null
        teamUpdate.winner_player_id = winnerId
        teamUpdate.turn_deadline_at = null
        teamUpdate.status_message = winNames.length
          ? `${removedName} left — ${winNames.join(' & ')} win!`
          : `${removedName} left — game over.`
      }

      if (teamUpdate.phase === 'finished') {
        // The leaver's whole team is gone: the round ends and the leaver's rows go in the same transaction.
        const finished = await finishUnoRound(supabase, gameId, session, {
          patch: teamUpdate,
          removePlayerId: playerId,
        })
        if (finished.waiting) return removeUnoLobbySeat(supabase, gameId, playerId)
        if (finished.error) return { error: finished.error }
        if (finished.won) return { error: null }
        return 'retry' // another request finished first: decide the seat again from the locked rows (remove_uno_lobby_seat)
      }

      return leaveUnoSeat(supabase, gameId, playerId, session.updated_at, teamUpdate)
    }

    const turnOrder = order.filter((id) => id !== playerId)
    let currentTurnIndex = session.current_turn_index
    if (removedIndex < currentTurnIndex) currentTurnIndex -= 1
    else if (removedIndex === currentTurnIndex && turnOrder.length > 0) currentTurnIndex %= turnOrder.length
    if (turnOrder.length === 0) currentTurnIndex = 0

    const update: Record<string, unknown> = {
      turn_order: turnOrder,
      current_turn_index: currentTurnIndex,
      // A removed player might have owed an UNO call — clear it so a ghost never penalises.
      uno_pending_player: session.uno_pending_player === playerId ? null : session.uno_pending_player,
      updated_at: new Date().toISOString(),
    }
    // The pending Wild Draw Four player left: drop the challenge (nobody's hand can be revealed) but keep
    // the +4 penalty and the target's turn, so the target takes the stack with no failed-challenge penalty.
    if (session.wd4_player_id === playerId) {
      update.wd4_player_id = null
      update.challenge_prev_color = null
    }

    // Players who already went out (finish_order) or were knocked out (eliminated_player_ids)
    // stay in turn_order — they're skipped on their turn — but are NOT still in play. The game
    // can only continue while at least two players remain active, so count active seats, not raw
    // turn_order length. Otherwise a finished winner or an eliminated player left sitting in
    // turn_order masks a lone survivor, and the game keeps dealing turns to a player playing alone.
    const finishOrder = session.finish_order ?? []
    const eliminatedIds = (session.eliminated_player_ids as string[] | null) ?? []
    const outSet = new Set<string>([...finishOrder, ...eliminatedIds])
    const activeRemaining = turnOrder.filter((id) => !outSet.has(id))

    const finishing = activeRemaining.length < 2
    if (finishing) {
      // First to empty wins (finish_order[0]); if nobody finished, the lone survivor wins.
      const winnerPlayerId = finishOrder[0] ?? activeRemaining[0] ?? turnOrder[0] ?? null
      const winnerName = winnerPlayerId ? (names.get(winnerPlayerId) ?? 'Winner') : null
      update.phase = 'finished'
      update.winner_player_id = winnerPlayerId
      update.status_message = winnerName
        ? `${removedName} left — ${winnerName} wins!`
        : `${removedName} left — game over.`
      update.turn_deadline_at = null
    } else {
      // Only cancel a pending decision (choose/challenge/swap/roulette) when the REMOVED player owns
      // it, falling back to plain play. If someone else leaves while the current player is mid-decision
      // (e.g. A just played a Wild and must still pick a colour), the phase and its status stay
      // intact — resetting it to 'playing' would leave A unable to choose a colour.
      const decisionOwnerId =
        session.phase === 'team_leave_decision' ? session.team_decider_id : order[session.current_turn_index]
      const cancelsDecision = session.phase !== 'playing' && decisionOwnerId === playerId
      if (cancelsDecision) update.phase = 'playing'
      const nextPlayerId = turnOrder[currentTurnIndex]
      // The timer restarts only when play actually moves on; a pending decision owned by someone
      // else keeps its original deadline (the update simply omits turn_deadline_at).
      if (session.phase === 'playing' || cancelsDecision) {
        update.status_message = `${removedName} left. ${names.get(nextPlayerId) ?? 'Next player'}'s turn`
        update.turn_deadline_at = unoTurnDeadline(timerSeconds)
      }
    }

    if (finishing) {
      // Fewer than two active seats remain: the round ends and the leaver's rows go in the same transaction.
      const finished = await finishUnoRound(supabase, gameId, session, { patch: update, removePlayerId: playerId })
      // An old deal under a game that never activated (`waiting`) has no live round to finish: the seat is a lobby seat.
      if (finished.waiting) return removeUnoLobbySeat(supabase, gameId, playerId)
      if (finished.error) return { error: finished.error }
      if (finished.won) return { error: null }
      return 'retry' // another request finished first: decide the seat again from the locked rows (remove_uno_lobby_seat)
    }

    return leaveUnoSeat(supabase, gameId, playerId, session.updated_at, update)
  }

  // Not a live-round leave: the locked lobby decision (live / retained / removed).
  return removeUnoLobbySeat(supabase, gameId, playerId)
}

/**
 * Not a live-round leave (no session yet, a spectator, a seat outside the turn order, a reopened lobby): the rows go in
 * ONE transaction under the games lock (remove_uno_lobby_seat). A round that is live and lists the player (a start that
 * landed after the lookup) answers `live`: nothing was deleted and the retry takes the live path; a published result
 * keeps its seat.
 */
async function removeUnoLobbySeat(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error: string | null; retained?: boolean } | 'retry'> {
  const { data: removed, error: removeError } = await supabase.rpc('remove_uno_lobby_seat', {
    p_game_id: gameId,
    p_player_id: playerId,
  })
  if (removeError) return { error: internalErrorMessage('uno', removeError) }
  const outcome = (removed ?? {}) as { status?: string; reason?: string }
  if (outcome.status === 'live') return 'retry'
  if (outcome.status === 'retained') return { error: null, retained: true }
  if (outcome.status !== 'removed') {
    return {
      error: internalErrorMessage(
        'uno',
        `remove_uno_lobby_seat rejected the call: ${outcome.reason ?? outcome.status}`
      ),
    }
  }
  return { error: null }
}

// ── Team-Up mid-round leave: the remaining teammate's decision ─────────────────
/**
 * The teammate of a player who left mid-round chooses to continue solo (1v2) or forfeit.
 * Only valid while `phase === 'team_leave_decision'` and only for `team_decider_id`.
 * - continue → resume play, skipping the departed seat.
 * - forfeit  → the round ends; the opposing team wins.
 */
export async function processUnoTeamLeaveDecision(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  decision: 'continue' | 'forfeit'
): Promise<{ error?: string; skipped?: boolean }> {
  const { error: loadError, session, hands, timerSeconds, playerNames } = await loadGameState(supabase, gameId)
  if (loadError) return { error: loadError }
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { error: 'The round has already ended' }
  if (session.phase !== 'team_leave_decision') return { error: 'No teammate-leave decision pending' }
  if (session.team_decider_id !== playerId) return { error: 'Not your decision' }

  const order = session.turn_order ?? []
  const leftIds = unoLeftPlayerIds(session)
  const deciderName = playerName(playerNames, playerId)
  const decIdx = order.indexOf(playerId)

  if (decision === 'forfeit') {
    // The remaining teammate concedes — the opposing team takes the round.
    const opponents = order.filter((id, i) => decIdx >= 0 && i % 2 !== decIdx % 2 && !leftIds.includes(id))
    const winnerId = opponents[0] ?? null
    const winnerMate = winnerId ? unoTeammateId(order, winnerId) : null
    const winNames = [winnerId, winnerMate]
      .filter((id): id is string => !!id && !leftIds.includes(id))
      .map((id) => playerName(playerNames, id))
    const finished = await finishUnoRound(supabase, gameId, session, {
      patch: {
        team_decider_id: null,
        winner_player_id: winnerId,
        status_message: winNames.length
          ? `${deciderName} forfeited — ${winNames.join(' & ')} win!`
          : `${deciderName} forfeited — game over.`,
      },
    })
    return finishOutcome(finished)
  }

  // Continue solo: resume play. The departed teammate's hand is already gone, so the turn
  // engine skips their seat; advance off it if the paused turn landed there.
  const direction = session.direction < 0 ? -1 : 1
  const len = order.length
  const currentId = len > 0 ? order[((session.current_turn_index % len) + len) % len] : null
  const currentGone = !currentId || leftIds.includes(currentId) || unoHandCount(hands, currentId) === 0
  const nextIndex = currentGone
    ? unoNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
    : session.current_turn_index
  const nextId = order[nextIndex]

  const patch: Partial<UnoSession> = {
    phase: 'playing',
    team_decider_id: null,
    current_turn_index: nextIndex,
    turn_deadline_at: unoTurnDeadline(timerSeconds),
    // A pause invalidates any half-made decision by/about the departed seat.
    pending_wild: null,
    challenge_prev_color: null,
    wd4_player_id: null,
    drawn_card_id: null,
    status_message: `${deciderName} plays on — 1 vs 2! ${playerName(playerNames, nextId ?? '')}'s turn`,
  }
  // A draw penalty owed by the departed seat leaves with them.
  if (currentGone) {
    patch.draw_penalty = 0
    patch.draw_penalty_kind = null
  }
  const persisted = await persistSession(supabase, gameId, patch, timerSeconds, session.updated_at)
  // A lost CAS means another writer moved the session on: the decision did NOT commit, so say so.
  if (!persisted.won) return persisted.error ? { error: persisted.error } : { skipped: true }
  return {}
}
