import type { Game, GameType, VoteAssignment, PairFlag, PairAssignmentMap, PairVoteMode, ParticipantMode } from '@/types'

export type VoteSlot = 'kiss' | 'marry' | 'kill'
/** Tally keys — `smash` counts the kill slot (Red Flag / Kill). */
export type VoteCategory = 'kiss' | 'marry' | 'smash'

export interface SlotMeta {
  emoji: string
  label: string
  color: string
  leaderboardLabel: string
  activeClass: string
  borderClass: string
  textColor: string
}

export interface GameTypeCardMeta {
  accent: string
  accentSoft: string
  emoji: string
  players: string
  vibe: string
  featured?: boolean
}

export interface GameTypeConfig {
  id: GameType
  label: string
  tagline: string
  headerEmoji: string
  card: GameTypeCardMeta
  slots: Record<VoteSlot, SlotMeta>
}

export const GAME_TYPE_CONFIG: Record<GameType, GameTypeConfig> = {
  smash_marry_kill: {
    id: 'smash_marry_kill',
    label: 'Smash Marry Kill',
    tagline: 'Pick one to smash, one to marry, one to kill',
    headerEmoji: '🔥💍💀',
    card: {
      accent: '#f43f5e',
      accentSoft: 'rgba(244, 63, 94, 0.15)',
      emoji: '🔥',
      players: '3+ players',
      vibe: 'Classic chaos',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🔥',
        label: 'Smash',
        color: '#f97316',
        leaderboardLabel: 'Most Smashed',
        activeClass: 'bg-orange-500/20 text-orange-800 border-orange-500 dark:text-orange-200',
        borderClass: 'border-orange-500/55 bg-orange-500/12',
        textColor: 'var(--slot-kiss-text)',
      },
      marry: {
        emoji: '💍',
        label: 'Marry',
        color: '#fbbf24',
        leaderboardLabel: 'Most Married',
        activeClass: 'bg-[var(--marry)]/20 text-amber-800 border-[var(--marry)] dark:text-amber-100',
        borderClass: 'border-[var(--marry)]/50 bg-[var(--marry)]/10',
        textColor: '#b45309',
      },
      kill: {
        emoji: '💀',
        label: 'Kill',
        color: '#991b1b',
        leaderboardLabel: 'Most Killed',
        activeClass:
          'bg-red-950/15 text-red-900 border-red-900 dark:bg-red-900/30 dark:text-red-200 dark:border-red-500',
        borderClass: 'border-red-900/50 bg-red-950/10 dark:border-red-500/45 dark:bg-red-900/15',
        textColor: 'var(--slot-kill-text)',
      },
    },
  },
  red_flag_green_flag: {
    id: 'red_flag_green_flag',
    label: 'Red Flag / Green Flag',
    tagline: 'Two names — rate each person green or red on their own',
    headerEmoji: '💚🚩',
    card: {
      accent: '#22c55e',
      accentSoft: 'rgba(34, 197, 94, 0.15)',
      emoji: '🚩',
      players: '4+ players',
      vibe: 'Spicy takes',
    },
    slots: {
      kiss: {
        emoji: '💚',
        label: 'Green Flag',
        color: '#4ade80',
        leaderboardLabel: 'Most Green Flags',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#86efac',
      },
      marry: {
        emoji: '⚪',
        label: 'Pass',
        color: '#94a3b8',
        leaderboardLabel: 'Most Passes',
        activeClass: 'chip-active',
        borderClass: 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
        textColor: '#cbd5e1',
      },
      kill: {
        emoji: '🚩',
        label: 'Red Flag',
        color: '#ef4444',
        leaderboardLabel: 'Most Red Flags',
        activeClass: 'bg-red-500/20 text-red-200 border-red-400',
        borderClass: 'border-red-500/50 bg-red-500/10',
        textColor: '#fca5a5',
      },
    },
  },
  smash_or_pass: {
    id: 'smash_or_pass',
    label: 'Smash or Pass',
    tagline: 'Two names — smash or pass on each person separately',
    headerEmoji: '🔥👎',
    card: {
      accent: '#fb923c',
      accentSoft: 'rgba(251, 146, 60, 0.15)',
      emoji: '🔥',
      players: '4+ players',
      vibe: 'Quick & bold',
    },
    slots: {
      kiss: {
        emoji: '🔥',
        label: 'Smash',
        color: '#f97316',
        leaderboardLabel: 'Most Smashed',
        activeClass: 'bg-orange-500/20 text-orange-800 border-orange-500 dark:text-orange-200',
        borderClass: 'border-orange-500/55 bg-orange-500/12',
        textColor: 'var(--slot-kiss-text)',
      },
      marry: {
        emoji: '👎',
        label: 'Pass',
        color: '#64748b',
        leaderboardLabel: 'Most Passed',
        activeClass: 'bg-slate-500/15 text-slate-800 border-slate-500 dark:text-slate-200',
        borderClass: 'border-slate-400/55 bg-slate-500/10',
        textColor: 'var(--slot-pass-text)',
      },
      kill: {
        emoji: '👎',
        label: 'Pass',
        color: '#64748b',
        leaderboardLabel: 'Most Passed',
        activeClass: 'bg-slate-500/15 text-slate-800 border-slate-500 dark:text-slate-200',
        borderClass: 'border-slate-400/55 bg-slate-500/10',
        textColor: 'var(--slot-pass-text)',
      },
    },
  },
  would_you_rather: {
    id: 'would_you_rather',
    label: 'Would You Rather',
    tagline: 'Pick between two options — votes stay anonymous',
    headerEmoji: '🤔⚖️',
    card: {
      accent: '#a78bfa',
      accentSoft: 'rgba(167, 139, 250, 0.15)',
      emoji: '🤔',
      players: '2+ players',
      vibe: 'Anonymous fun',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: 'A',
        label: 'Option A',
        color: '#a78bfa',
        leaderboardLabel: 'Option A',
        activeClass: 'bg-violet-500/20 text-violet-100 border-violet-400',
        borderClass: 'border-violet-500/50 bg-violet-500/10',
        textColor: '#c4b5fd',
      },
      marry: {
        emoji: 'B',
        label: 'Option B',
        color: '#38bdf8',
        leaderboardLabel: 'Option B',
        activeClass: 'bg-sky-500/20 text-sky-100 border-sky-400',
        borderClass: 'border-sky-500/50 bg-sky-500/10',
        textColor: '#7dd3fc',
      },
      kill: {
        emoji: 'B',
        label: 'Option B',
        color: '#38bdf8',
        leaderboardLabel: 'Option B',
        activeClass: 'bg-sky-500/20 text-sky-100 border-sky-400',
        borderClass: 'border-sky-500/50 bg-sky-500/10',
        textColor: '#7dd3fc',
      },
    },
  },
  this_or_that: {
    id: 'this_or_that',
    label: 'This or That',
    tagline: 'Pick between two options — upload your own prompts',
    headerEmoji: '↔️🎯',
    card: {
      accent: '#f472b6',
      accentSoft: 'rgba(244, 114, 182, 0.15)',
      emoji: '↔️',
      players: '2+ players',
      vibe: 'Quick picks',
    },
    slots: {
      kiss: {
        emoji: 'A',
        label: 'Option A',
        color: '#f472b6',
        leaderboardLabel: 'Option A',
        activeClass: 'bg-pink-500/20 text-pink-100 border-pink-400',
        borderClass: 'border-pink-500/50 bg-pink-500/10',
        textColor: '#f9a8d4',
      },
      marry: {
        emoji: 'B',
        label: 'Option B',
        color: '#38bdf8',
        leaderboardLabel: 'Option B',
        activeClass: 'bg-sky-500/20 text-sky-100 border-sky-400',
        borderClass: 'border-sky-500/50 bg-sky-500/10',
        textColor: '#7dd3fc',
      },
      kill: {
        emoji: 'B',
        label: 'Option B',
        color: '#38bdf8',
        leaderboardLabel: 'Option B',
        activeClass: 'bg-sky-500/20 text-sky-100 border-sky-400',
        borderClass: 'border-sky-500/50 bg-sky-500/10',
        textColor: '#7dd3fc',
      },
    },
  },
  most_likely_to: {
    id: 'most_likely_to',
    label: 'Most Likely To',
    tagline: 'Vote for the friend who fits each prompt — anonymous',
    headerEmoji: '🎯👥',
    card: {
      accent: '#fbbf24',
      accentSoft: 'rgba(251, 191, 36, 0.15)',
      emoji: '🎯',
      players: '3+ players',
      vibe: 'Call out friends',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🏆',
        label: 'Winner',
        color: '#fbbf24',
        leaderboardLabel: 'Most Votes',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
      marry: {
        emoji: '👤',
        label: 'Pick',
        color: '#94a3b8',
        leaderboardLabel: 'Pick',
        activeClass: 'chip-active',
        borderClass: 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
        textColor: '#cbd5e1',
      },
      kill: {
        emoji: '👤',
        label: 'Pick',
        color: '#94a3b8',
        leaderboardLabel: 'Pick',
        activeClass: 'chip-active',
        borderClass: 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
        textColor: '#cbd5e1',
      },
    },
  },
  who_said_this: {
    id: 'who_said_this',
    label: 'Who Said This',
    tagline: 'Submit quotes in the lobby — everyone guesses who said it',
    headerEmoji: '💬🕵️',
    card: {
      accent: '#14b8a6',
      accentSoft: 'rgba(20, 184, 166, 0.15)',
      emoji: '💬',
      players: '3+ players',
      vibe: 'Guess the author',
    },
    slots: {
      kiss: {
        emoji: '✓',
        label: 'Correct',
        color: '#2dd4bf',
        leaderboardLabel: 'Best Guesses',
        activeClass: 'bg-teal-500/20 text-teal-100 border-teal-400',
        borderClass: 'border-teal-500/50 bg-teal-500/10',
        textColor: '#5eead4',
      },
      marry: {
        emoji: '💬',
        label: 'Quote',
        color: '#94a3b8',
        leaderboardLabel: 'Quote',
        activeClass: 'chip-active',
        borderClass: 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
        textColor: '#cbd5e1',
      },
      kill: {
        emoji: '👤',
        label: 'Guess',
        color: '#94a3b8',
        leaderboardLabel: 'Guess',
        activeClass: 'chip-active',
        borderClass: 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
        textColor: '#cbd5e1',
      },
    },
  },
  hot_seat: {
    id: 'hot_seat',
    label: 'Hot Seat',
    tagline: 'Take turns in the spotlight — everyone says one thing about you',
    headerEmoji: '🪑🔥',
    card: {
      accent: '#f59e0b',
      accentSoft: 'rgba(245, 158, 11, 0.15)',
      emoji: '🪑',
      players: '3+ players',
      vibe: 'Brutally honest',
    },
    slots: {
      kiss: {
        emoji: '💛',
        label: 'Compliment',
        color: '#fbbf24',
        leaderboardLabel: 'Compliments',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
      marry: {
        emoji: '👀',
        label: 'Observation',
        color: '#94a3b8',
        leaderboardLabel: 'Observations',
        activeClass: 'chip-active',
        borderClass: 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
        textColor: '#cbd5e1',
      },
      kill: {
        emoji: '🔥',
        label: 'Roast',
        color: '#ef4444',
        leaderboardLabel: 'Roasts',
        activeClass: 'bg-red-500/20 text-red-200 border-red-400',
        borderClass: 'border-red-500/50 bg-red-500/10',
        textColor: '#fca5a5',
      },
    },
  },
  custom: {
    id: 'custom',
    label: 'Custom Game',
    tagline: 'Create your own voting categories',
    headerEmoji: '✏️',
    card: {
      accent: '#a855f7',
      accentSoft: 'rgba(168,85,247,0.15)',
      emoji: '✏️',
      players: '2+ players',
      vibe: 'Your rules',
    },
    slots: {
      kiss: {
        emoji: '✏️',
        label: 'Slot 1',
        color: '#a855f7',
        leaderboardLabel: 'Most Slot 1',
        activeClass: 'border-purple-400 bg-purple-500/20 text-purple-100',
        borderClass: 'border-purple-500/40',
        textColor: '#a855f7',
      },
      marry: {
        emoji: '✏️',
        label: 'Slot 2',
        color: '#64748b',
        leaderboardLabel: 'Most Slot 2',
        activeClass: 'border-slate-400 bg-slate-500/20 text-slate-100',
        borderClass: 'border-slate-500/40',
        textColor: '#64748b',
      },
      kill: {
        emoji: '✏️',
        label: 'Slot 3',
        color: '#ef4444',
        leaderboardLabel: 'Most Slot 3',
        activeClass: 'border-red-400 bg-red-500/20 text-red-100',
        borderClass: 'border-red-500/40',
        textColor: '#ef4444',
      },
    },
  },
}

export const GAME_TYPE_OPTIONS: GameType[] = [
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'would_you_rather',
  'this_or_that',
  'most_likely_to',
  'who_said_this',
  'hot_seat',
  'custom',
]

export function parseGameType(raw: unknown): GameType {
  if (raw === 'red_flag_green_flag') return 'red_flag_green_flag'
  if (raw === 'smash_or_pass') return 'smash_or_pass'
  if (raw === 'would_you_rather') return 'would_you_rather'
  if (raw === 'this_or_that') return 'this_or_that'
  if (raw === 'most_likely_to') return 'most_likely_to'
  if (raw === 'who_said_this') return 'who_said_this'
  if (raw === 'hot_seat') return 'hot_seat'
  if (raw === 'custom') return 'custom'
  return 'smash_marry_kill'
}

export function gameTypeConfig(gameType: GameType | string | undefined): GameTypeConfig {
  return GAME_TYPE_CONFIG[parseGameType(gameType)]
}

/** Short setup blurb for the create-game screen. */
export function gameHowItWorks(
  gameType: GameType | string | undefined,
  participantMode: ParticipantMode = 'import'
): string {
  const type = parseGameType(gameType)
  const joiners = participantMode === 'joiners'

  switch (type) {
    case 'who_said_this':
      return "Upload everyone's names on the next step. Players claim their name when joining, then submit a quote and who said it in the lobby. Only quotes in the pool become rounds — if 5 of 10 submit, that's 5 rounds."
    case 'would_you_rather':
      return 'Players join with any name — no list to set up. Each round shows two options and everyone picks A or B. Votes stay anonymous.'
    case 'this_or_that':
      return 'Upload your own “Coffee or Tea?” style prompts. Players join with any name — each round shows two options and everyone picks A or B. Votes stay anonymous.'
    case 'hot_seat':
      return joiners
        ? 'Players join with any name — no list to upload. One round per player who joins; you set a max cap and the host lobby shows the final count.'
        : "Upload everyone's names on the next step. Players claim their name when joining. One round per player who joins — you set a max cap; the host lobby shows the final count."
    case 'most_likely_to':
      return joiners
        ? 'Players add their name to the poll when joining. Each round shows a "most likely to…" prompt — vote for who fits best. Votes stay anonymous.'
        : 'Upload everyone\'s names on the next step. Players join with their own name to vote. Each round shows a "most likely to…" prompt — vote for who fits best. Votes stay anonymous.'
    case 'red_flag_green_flag':
      return joiners
        ? 'Players add their name to the poll when joining. Each round, two names appear — everyone rates each person green flag or red flag.'
        : participantMode === 'voters'
          ? "Add names on the next step (celebrities, characters, anyone). Players join with their own name to vote. Each round, two names appear — everyone rates each person green flag or red flag."
          : "Add everyone's names on the next step. Players claim their name when joining. Each round, two names appear — everyone rates each person green flag or red flag."
    case 'smash_or_pass':
      return joiners
        ? 'Players add their name to the poll when joining. Each round, two names appear — everyone picks smash or pass for each.'
        : participantMode === 'voters'
          ? "Add names on the next step (celebrities, characters, anyone). Players join with their own name to vote. Each round, two names appear — everyone picks smash or pass for each."
          : "Add everyone's names on the next step. Players claim their name when joining. Each round, two names appear — everyone picks smash or pass for each."
    case 'smash_marry_kill':
    default:
      if (isCustomGame(gameType)) {
        return joiners
          ? 'Players add their name to the poll when joining. Each round shows a group — everyone assigns one person to each custom category.'
          : participantMode === 'voters'
            ? 'Add names on the next step. Players join with their own name to vote. Each round shows a group — everyone assigns one person to each custom category.'
            : "Add everyone's names on the next step. Players claim their name when joining. Each round shows a group — everyone assigns one person to each custom category."
      }
      return joiners
        ? 'Players add their name to the poll when joining. Each round, three names appear — everyone picks one to smash, one to marry, and one to kill.'
        : participantMode === 'voters'
          ? 'Add names on the next step. Players join with their own name to vote. Each round, three names appear — everyone picks one to smash, one to marry, and one to kill.'
          : "Add everyone's names on the next step. Players claim their name when joining. Each round, three names appear — everyone picks one to smash, one to marry, and one to kill."
  }
}

/** Two names per round, two vote buttons (no middle slot). */
export function isPairGame(gameType: GameType | string | undefined): boolean {
  const type = parseGameType(gameType)
  return type === 'red_flag_green_flag' || type === 'smash_or_pass'
}

export function parsePairVoteMode(raw: unknown): PairVoteMode {
  return raw === 'any' ? 'any' : 'one_each'
}

export function isPairOneEachMode(game: {
  game_type?: GameType | string
  pair_vote_mode?: PairVoteMode | string | null
}): boolean {
  return isPairGame(game.game_type) && parsePairVoteMode(game.pair_vote_mode) === 'one_each'
}

export function pairVoteModeOptions(gameType: GameType | string): {
  value: PairVoteMode
  label: string
  hint: string
}[] {
  const type = parseGameType(gameType)
  const positive = type === 'smash_or_pass' ? 'Smash' : 'Green'
  const negative = type === 'smash_or_pass' ? 'Pass' : 'Red'
  return [
    {
      value: 'one_each',
      label: 'One each',
      hint: `Must pick one ${positive} and one ${negative} every round.`,
    },
    {
      value: 'any',
      label: 'Any combo',
      hint: `Players can pick 2 ${positive}, 2 ${negative}, or 1 of each.`,
    },
  ]
}

export function isPairAssignmentValid(
  pairAssignment: PairAssignmentMap,
  participantIds: string[],
  mode: PairVoteMode
): boolean {
  if (!isPairAssignmentComplete(pairAssignment, participantIds)) return false
  if (mode !== 'one_each' || participantIds.length !== 2) return true
  const [a, b] = participantIds.map((id) => pairAssignment[id])
  return (a === 'kiss' && b === 'kill') || (a === 'kill' && b === 'kiss')
}

export function pairDisabledSlots(
  _pairAssignment: PairAssignmentMap,
  _participantId: string,
  _participantIds: string[],
  _mode: PairVoteMode
): VoteSlot[] {
  // Slots are never disabled — one-each uses tap-to-swap instead.
  return []
}

/** Assign a pair flag; one-each with 2 people swaps with the other voter. */
export function assignPairSlot(
  prev: PairAssignmentMap,
  participantId: string,
  action: PairFlag,
  participantIds: string[],
  mode: PairVoteMode
): PairAssignmentMap {
  if (prev[participantId] === action) {
    const next = { ...prev }
    delete next[participantId]
    return next
  }

  if (mode === 'any') {
    return { ...prev, [participantId]: action }
  }

  const next = { ...prev }
  const myCurrent = prev[participantId]
  const holderId = Object.entries(prev).find(([id, flag]) => flag === action && id !== participantId)?.[0]

  if (holderId) {
    if (myCurrent) next[holderId] = myCurrent
    else delete next[holderId]
  }

  next[participantId] = action
  return next
}

export function fillRandomPairAssignment(participantIds: string[], mode: PairVoteMode): PairAssignmentMap {
  const result = emptyPairAssignment(participantIds)
  if (participantIds.length === 0) return result
  if (mode === 'one_each' && participantIds.length === 2) {
    const first = Math.random() < 0.5 ? 'kiss' : 'kill'
    result[participantIds[0]] = first
    result[participantIds[1]] = first === 'kiss' ? 'kill' : 'kiss'
    return result
  }
  for (const id of participantIds) {
    result[id] = Math.random() < 0.5 ? 'kiss' : 'kill'
  }
  return result
}

/** Fill missing pair picks; respects one-each when mode requires it. */
export function completeRandomPairAssignment(
  pairAssignment: PairAssignmentMap,
  participantIds: string[],
  mode: PairVoteMode
): PairAssignmentMap {
  const result = { ...pairAssignment }
  if (mode === 'one_each' && participantIds.length === 2) {
    const [a, b] = participantIds
    const va = result[a]
    const vb = result[b]
    if (va && !vb) {
      result[b] = va === 'kiss' ? 'kill' : 'kiss'
    } else if (vb && !va) {
      result[a] = vb === 'kiss' ? 'kill' : 'kiss'
    } else if (!va && !vb) {
      return fillRandomPairAssignment(participantIds, mode)
    }
    return result
  }
  for (const id of participantIds) {
    if (!result[id]) result[id] = Math.random() < 0.5 ? 'kiss' : 'kill'
  }
  return result
}

export function isWouldYouRather(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'would_you_rather'
}

export function isThisOrThat(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'this_or_that'
}

/** WYR + This or That — pick option A or B each round. */
export function isBinaryChoiceGame(gameType: GameType | string | undefined): boolean {
  return isWouldYouRather(gameType) || isThisOrThat(gameType)
}

export function isMostLikelyTo(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'most_likely_to'
}

export function isWhoSaidThis(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'who_said_this'
}

export function isHotSeat(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'hot_seat'
}

type LobbyCounts = { participantMode?: string; participantCount: number }

/** WYR + MLT + This or That player join: free name entry, no list. Hot Seat uses import + name claim (see isImportNameClaimGame). */
export function isNameOnlyPlayerJoin(gameType: GameType | string | undefined): boolean {
  const type = parseGameType(gameType)
  return type === 'would_you_rather' || type === 'this_or_that' || type === 'most_likely_to'
}

/** Import list + claim your name when joining (no gender) — Who Said This & Hot Seat (import mode). */
export function isImportNameClaimGame(gameType: GameType | string | undefined): boolean {
  return isWhoSaidThis(gameType) || isHotSeat(gameType)
}

/** Hot Seat — players join with any name, no host list. */
export function isHotSeatJoinersGame(game: Pick<Game, 'game_type' | 'participant_mode'>): boolean {
  return isHotSeat(game.game_type) && (game.participant_mode ?? 'import') === 'joiners'
}

/**
 * Hot Seat host lobby — import list + claim, or joiners (free name entry).
 */
export function isHotSeatLobbyGame(gameType: GameType | string | undefined, _opts?: LobbyCounts): boolean {
  return isHotSeat(gameType)
}

/** Host lobby where players join by name only — no participant rows from a host list. */
export function isPlayerOnlyJoinLobby(gameType: GameType | string | undefined, opts: LobbyCounts): boolean {
  if (isHotSeat(gameType) && opts.participantMode === 'joiners') return true
  if (isNameOnlyPlayerJoin(gameType)) return true
  return false
}

/** WYR + This or That — forced joiners, no gender, always anonymous. */
export function isLobbyGame(gameType: GameType | string | undefined): boolean {
  const type = parseGameType(gameType)
  return type === 'would_you_rather' || type === 'this_or_that'
}

export function isAnonymousGame(gameType: GameType | string | undefined): boolean {
  return isNameOnlyPlayerJoin(gameType) || isWhoSaidThis(gameType) || isHotSeat(gameType)
}

export function isThreeChoiceGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'smash_marry_kill'
}

export function isCustomGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'custom'
}

export function roundPoolSize(gameType: GameType | string | undefined): 2 | 3 {
  if (isBinaryChoiceGame(gameType) || isMostLikelyTo(gameType) || isWhoSaidThis(gameType)) return 2
  return isPairGame(gameType) ? 2 : 3
}

export function voteSlots(gameType?: GameType | string): VoteSlot[] {
  return isPairGame(gameType) ? ['kiss', 'kill'] : ['kiss', 'marry', 'kill']
}

export function voteCategories(gameType?: GameType | string): VoteCategory[] {
  return isPairGame(gameType) ? ['kiss', 'smash'] : ['kiss', 'marry', 'smash']
}

export function assignmentTargetCount(gameType?: GameType | string, participantCount?: number): number {
  if (isPairGame(gameType) && participantCount !== undefined) return participantCount
  return voteSlots(gameType).length
}

export function emptyPairAssignment(participantIds: string[]): PairAssignmentMap {
  return Object.fromEntries(participantIds.map((id) => [id, null]))
}

export function isPairAssignmentComplete(pairAssignment: PairAssignmentMap, participantIds: string[]): boolean {
  return participantIds.every((id) => pairAssignment[id] === 'kiss' || pairAssignment[id] === 'kill')
}

export function pairAssignedCount(pairAssignment: PairAssignmentMap, participantIds: string[]): number {
  return participantIds.filter((id) => pairAssignment[id] === 'kiss' || pairAssignment[id] === 'kill').length
}

export function pairAssignmentFromVote(
  vote: {
    pair_assignments?: Record<string, PairFlag> | null
    kiss_participant_id?: string | null
    kill_participant_id?: string | null
  },
  participantIds: string[]
): PairAssignmentMap {
  const result = emptyPairAssignment(participantIds)
  for (const id of participantIds) {
    const stored = vote.pair_assignments?.[id]
    if (stored === 'kiss' || stored === 'kill') {
      result[id] = stored
    } else if (vote.kiss_participant_id === id) {
      result[id] = 'kiss'
    } else if (vote.kill_participant_id === id) {
      result[id] = 'kill'
    }
  }
  return result
}

export function categoryToSlot(category: VoteCategory): VoteSlot {
  return category === 'smash' ? 'kill' : category
}

export function slotMeta(gameType: GameType | string | undefined, slot: VoteSlot): SlotMeta {
  return gameTypeConfig(gameType).slots[slot]
}

export function categoryMeta(gameType: GameType | string | undefined, category: VoteCategory) {
  const meta = slotMeta(gameType, categoryToSlot(category))
  return {
    emoji: meta.emoji,
    label: meta.label,
    color: meta.color,
    leaderboardLabel: meta.leaderboardLabel,
  }
}

export function assignmentEmoji(gameType: GameType | string | undefined, slot: VoteSlot): string {
  return slotMeta(gameType, slot).emoji
}

export function emptyAssignment(): VoteAssignment {
  return { kiss: null, marry: null, kill: null }
}

export function isAssignmentComplete(assignment: VoteAssignment, gameType?: GameType | string): boolean {
  return voteSlots(gameType).every((slot) => assignment[slot])
}

export function assignedCount(assignment: VoteAssignment, gameType?: GameType | string): number {
  return voteSlots(gameType).filter((slot) => assignment[slot]).length
}
