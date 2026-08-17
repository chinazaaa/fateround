import {
  AbacusIcon,
  BalanceScaleIcon,
  GroupLayersIcon,
  BombIcon,
  Calendar01Icon,
  CardExchange01Icon,
  Cards01Icon,
  Cards02Icon,
  Chair01Icon,
  ChampionIcon,
  ChessPawnIcon,
  Coins01Icon,
  Copy01Icon,
  CrownIcon,
  DicesIcon,
  DominoIcon,
  EyeClosedIcon,
  FireIcon,
  Flag02Icon,
  GameController01Icon,
  GlobeIcon,
  Grid2X2XIcon,
  Grid3X3Icon,
  GridViewIcon,
  HashIcon,
  HatIcon,
  HeartHandshakeIcon,
  HeartbreakIcon,
  Home01Icon,
  IncognitoIcon,
  LetterSpacingIcon,
  LockPasswordIcon,
  Mail01Icon,
  MaskIcon,
  Medal01Icon,
  Medal02Icon,
  Megaphone01Icon,
  PaintBrush01Icon,
  Pen01Icon,
  PencilEdit02Icon,
  PuzzleIcon,
  QuestionIcon,
  Quiz01Icon,
  QuotesIcon,
  RankingIcon,
  SearchAreaIcon,
  SearchFocusIcon,
  ShuffleIcon,
  SparklesIcon,
  SpeechIcon,
  Stairs01Icon,
  StopWatchIcon,
  TableTennisBatIcon,
  Target02Icon,
  Ticket01Icon,
  TokenCircleIcon,
  ToggleOnIcon,
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import type { GameType } from '@/types'
import type { DailyChallengeGameType } from '@/lib/daily-challenge'

/**
 * Maps every game to an icon from the free Hugeicons set.
 *
 * `gameTypeConfig().card.emoji` stays the source of truth inside gameplay (board
 * pieces, share images, the mobile app) — this map covers the marketing surfaces,
 * where icons inherit each game's `--accent` and render identically across
 * platforms instead of relying on per-OS emoji fonts.
 *
 * The three checkers variants intentionally share one icon: they are the same
 * game at different board sizes.
 */
const GAME_ICONS: Record<GameType, IconSvgElement> = {
  smash_marry_kill: HeartbreakIcon,
  red_flag_green_flag: Flag02Icon,
  smash_or_pass: FireIcon,
  would_you_rather: QuestionIcon,
  never_have_i_ever: EyeClosedIcon,
  pick_a_number: HashIcon,
  this_or_that: ToggleOnIcon,
  most_likely_to: Target02Icon,
  who_said_this: QuotesIcon,
  hot_seat: Chair01Icon,
  custom: PencilEdit02Icon,
  anonymous_messages: IncognitoIcon,
  secret_message: Mail01Icon,
  bingo: Ticket01Icon,
  codewords: LockPasswordIcon,
  trivia: Quiz01Icon,
  two_truths: BalanceScaleIcon,
  parent_approval: HeartHandshakeIcon,
  monopoly: HatIcon,
  yahtzee: DicesIcon,
  whot: Cards02Icon,
  ludo: TokenCircleIcon,
  mahjong: DominoIcon,
  i_call_on: Megaphone01Icon,
  sudoku: Grid3X3Icon,
  tic_tac_toe: Grid2X2XIcon,
  word_hunt: SearchFocusIcon,
  chess: ChessPawnIcon,
  describe_it: SpeechIcon,
  scrabble: LetterSpacingIcon,
  snake_and_ladder: Stairs01Icon,
  crazy_eights: Cards01Icon,
  checkers: Coins01Icon,
  checkers_international: Coins01Icon,
  checkers_nigeria: Coins01Icon,
  mafia: MaskIcon,
  matching_pairs: Copy01Icon,
  quiplash: Pen01Icon,
  word_rush: StopWatchIcon,
  quick_draw: PaintBrush01Icon,
  ayo: AbacusIcon,
  crossword: PuzzleIcon,
  word_search: SearchAreaIcon,
  word_scramble: ShuffleIcon,
  word_grouping: GroupLayersIcon,
  landmine: BombIcon,
  ping_pong: TableTennisBatIcon,
  uno: CardExchange01Icon,
  wordle_room: GridViewIcon,
}

export function gameIcon(type: GameType): IconSvgElement {
  return GAME_ICONS[type]
}

/** Daily challenge variants that borrow the icon of the full game they derive from. */
const DAILY_ICON_FALLBACK: Partial<Record<DailyChallengeGameType, GameType>> = {
  whot_puzzle: 'whot',
  word_grouping: 'tic_tac_toe',
  chess_mate: 'chess',
  codenames_codeword: 'codewords',
  mini_crossword: 'crossword',
  ludo_puzzle: 'ludo',
  wordle: 'scrabble',
}

export function dailyChallengeIcon(gameType: DailyChallengeGameType): IconSvgElement {
  return gameIcon(DAILY_ICON_FALLBACK[gameType] ?? (gameType as GameType))
}

/** Icons for chrome that isn't tied to a specific game (nav, footer, tiles). */
export const UI_ICONS = {
  home: Home01Icon,
  games: GameController01Icon,
  tournament: ChampionIcon,
  leaderboard: RankingIcon,
  dailyChallenges: Calendar01Icon,
  whatsNew: SparklesIcon,
  browse: GlobeIcon,
} satisfies Record<string, IconSvgElement>

/**
 * Trophy tier artwork, replacing the 🥉🥈🥇🏆 medals the trophy surfaces used to
 * inline. Each tier gets a distinct shape so the rank is legible without reading
 * the label — a medal for the two lower tiers, then a crown and a cup.
 *
 * Ordering matches `TIER_RANK` in `lib/trophies/tier-rank.ts`; that module stays
 * icon-free because it is imported by API routes, which have no use for artwork.
 */
const TIER_ICONS: Record<string, IconSvgElement> = {
  bronze: Medal02Icon,
  silver: Medal01Icon,
  gold: CrownIcon,
  platinum: ChampionIcon,
}

/** Icon for a trophy tier. Unknown tiers fall back to the cup rather than rendering nothing. */
export function tierIcon(tier: string): IconSvgElement {
  return TIER_ICONS[tier] ?? ChampionIcon
}

/**
 * Metal colours for a tier, used where a tier needs to be identifiable at a glance
 * (the medal plate on a public profile). Deliberately literal rather than tokenised:
 * bronze and gold have no equivalent in the rose-based palette, and they must read
 * the same in both themes.
 */
export const TIER_COLORS: Record<string, string> = {
  bronze: '#cd7f32',
  silver: '#a8a8b8',
  gold: '#f0b429',
  platinum: '#c4b5fd',
}
