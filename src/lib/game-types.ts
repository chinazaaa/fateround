import type {
  Game,
  GameType,
  VoteAssignment,
  PairFlag,
  PairAssignmentMap,
  PairVoteMode,
  ParticipantMode,
} from '@/types'
import { GAME_ACHIEVEMENTS } from '@/lib/community-achievements'

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
    tagline: 'Smash, marry, or kill — one each',
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
        textColor: 'var(--slot-marry-text)',
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
    tagline: 'Rate each person green or red',
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
    tagline: 'Smash or pass on each person',
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
  parent_approval: {
    id: 'parent_approval',
    label: 'Date My Kid',
    tagline: 'Would you let your kid date them?',
    headerEmoji: '👨‍👩‍👧💍',
    card: {
      accent: '#ec4899',
      accentSoft: 'rgba(236, 72, 153, 0.15)',
      emoji: '👨‍👩‍👧',
      players: '3+ players',
      vibe: 'Parental judgment',
    },
    slots: {
      kiss: {
        emoji: '✅',
        label: 'Yes',
        color: '#22c55e',
        leaderboardLabel: 'Most Approved',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#86efac',
      },
      marry: {
        emoji: '⚪',
        label: 'Pass',
        color: '#94a3b8',
        leaderboardLabel: 'Most Passed',
        activeClass: 'chip-active',
        borderClass: 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
        textColor: '#cbd5e1',
      },
      kill: {
        emoji: '❌',
        label: 'No',
        color: '#ef4444',
        leaderboardLabel: 'Most Rejected',
        activeClass: 'bg-red-500/20 text-red-200 border-red-400',
        borderClass: 'border-red-500/50 bg-red-500/10',
        textColor: '#fca5a5',
      },
    },
  },
  never_have_i_ever: {
    id: 'never_have_i_ever',
    label: 'Never Have I Ever',
    tagline: 'Confess — see who else has too',
    headerEmoji: '🙈🍷',
    card: {
      accent: '#e879f9',
      accentSoft: 'rgba(232, 121, 249, 0.15)',
      emoji: '🙈',
      players: '2+ players',
      vibe: 'Spicy confessions',
    },
    slots: {
      kiss: {
        emoji: '✋',
        label: 'I have',
        color: '#e879f9',
        leaderboardLabel: 'I have',
        activeClass: 'bg-fuchsia-500/20 text-fuchsia-100 border-fuchsia-400',
        borderClass: 'border-fuchsia-500/50 bg-fuchsia-500/10',
        textColor: '#f0abfc',
      },
      marry: {
        emoji: '🙅',
        label: "I haven't",
        color: '#94a3b8',
        leaderboardLabel: "I haven't",
        activeClass: 'chip-active',
        borderClass: 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
        textColor: '#cbd5e1',
      },
      kill: {
        emoji: '🙅',
        label: "I haven't",
        color: '#94a3b8',
        leaderboardLabel: "I haven't",
        activeClass: 'chip-active',
        borderClass: 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
        textColor: '#cbd5e1',
      },
    },
  },
  pick_a_number: {
    id: 'pick_a_number',
    label: 'Pick a Number',
    tagline: 'Pick a number, answer its hidden question',
    headerEmoji: '🔢❓',
    card: {
      accent: '#8b5cf6',
      accentSoft: 'rgba(139, 92, 246, 0.15)',
      emoji: '🔢',
      players: '2+ players',
      vibe: 'Mystery questions',
    },
    slots: {
      kiss: {
        emoji: '🔢',
        label: 'Pick',
        color: '#8b5cf6',
        leaderboardLabel: 'Picks',
        activeClass: 'bg-violet-500/20 text-violet-100 border-violet-400',
        borderClass: 'border-violet-500/50 bg-violet-500/10',
        textColor: '#c4b5fd',
      },
      marry: {
        emoji: '❓',
        label: 'Question',
        color: '#94a3b8',
        leaderboardLabel: 'Questions',
        activeClass: 'chip-active',
        borderClass: 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
        textColor: '#cbd5e1',
      },
      kill: {
        emoji: '❓',
        label: 'Question',
        color: '#94a3b8',
        leaderboardLabel: 'Questions',
        activeClass: 'chip-active',
        borderClass: 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
        textColor: '#cbd5e1',
      },
    },
  },
  would_you_rather: {
    id: 'would_you_rather',
    label: 'Would You Rather',
    tagline: 'Pick between two — votes stay anonymous',
    headerEmoji: '🤔⚖️',
    card: {
      accent: '#a78bfa',
      accentSoft: 'rgba(167, 139, 250, 0.15)',
      emoji: '🤔',
      players: '2+ players',
      vibe: 'Anonymous fun',
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
    tagline: 'Two options — bring your own prompts',
    headerEmoji: '↔️🎯',
    card: {
      accent: '#f472b6',
      accentSoft: 'rgba(244, 114, 182, 0.15)',
      emoji: '↔️',
      players: '2+ players',
      vibe: 'Quick picks',
      featured: true,
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
    tagline: 'Vote the friend who fits — anonymous',
    headerEmoji: '🎯👥',
    card: {
      accent: '#fbbf24',
      accentSoft: 'rgba(251, 191, 36, 0.15)',
      emoji: '🎯',
      players: '3+ players',
      vibe: 'Call out friends',
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
    tagline: 'Guess who said each quote',
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
    tagline: 'One in the spotlight, everyone weighs in',
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
    tagline: 'Make your own voting categories',
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
  anonymous_messages: {
    id: 'anonymous_messages',
    label: 'Anonymous Room',
    tagline: 'Drop anonymous messages — just vibes',
    headerEmoji: '🎭💬',
    card: {
      accent: '#8b5cf6',
      accentSoft: 'rgba(139, 92, 246, 0.15)',
      emoji: '🎭',
      players: '2+ players',
      vibe: 'Anonymous chat',
    },
    slots: {
      kiss: {
        emoji: '💬',
        label: 'Message',
        color: '#8b5cf6',
        leaderboardLabel: 'Messages',
        activeClass: 'bg-violet-500/20 text-violet-100 border-violet-400',
        borderClass: 'border-violet-500/50 bg-violet-500/10',
        textColor: '#c4b5fd',
      },
      marry: {
        emoji: '💬',
        label: 'Message',
        color: '#8b5cf6',
        leaderboardLabel: 'Messages',
        activeClass: 'bg-violet-500/20 text-violet-100 border-violet-400',
        borderClass: 'border-violet-500/50 bg-violet-500/10',
        textColor: '#c4b5fd',
      },
      kill: {
        emoji: '💬',
        label: 'Message',
        color: '#8b5cf6',
        leaderboardLabel: 'Messages',
        activeClass: 'bg-violet-500/20 text-violet-100 border-violet-400',
        borderClass: 'border-violet-500/50 bg-violet-500/10',
        textColor: '#c4b5fd',
      },
    },
  },
  secret_message: {
    id: 'secret_message',
    label: 'Secret Message',
    tagline: 'Share a link — only you see replies',
    headerEmoji: '💌✨',
    card: {
      accent: '#ec4899',
      accentSoft: 'rgba(236, 72, 153, 0.15)',
      emoji: '💌',
      players: 'Unlimited senders',
      vibe: 'Private inbox',
    },
    slots: {
      kiss: {
        emoji: '💌',
        label: 'Message',
        color: '#ec4899',
        leaderboardLabel: 'Messages',
        activeClass: 'bg-pink-500/20 text-pink-100 border-pink-400',
        borderClass: 'border-pink-500/50 bg-pink-500/10',
        textColor: '#f9a8d4',
      },
      marry: {
        emoji: '💌',
        label: 'Message',
        color: '#ec4899',
        leaderboardLabel: 'Messages',
        activeClass: 'bg-pink-500/20 text-pink-100 border-pink-400',
        borderClass: 'border-pink-500/50 bg-pink-500/10',
        textColor: '#f9a8d4',
      },
      kill: {
        emoji: '💌',
        label: 'Message',
        color: '#ec4899',
        leaderboardLabel: 'Messages',
        activeClass: 'bg-pink-500/20 text-pink-100 border-pink-400',
        borderClass: 'border-pink-500/50 bg-pink-500/10',
        textColor: '#f9a8d4',
      },
    },
  },
  bingo: {
    id: 'bingo',
    label: 'Bingo',
    tagline: 'Host calls, players mark their cards',
    headerEmoji: '🎱🔢',
    card: {
      accent: '#3b82f6',
      accentSoft: 'rgba(59, 130, 246, 0.15)',
      emoji: '🎱',
      players: '2–30 players',
      vibe: 'Party classic',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🎱',
        label: 'Called',
        color: '#3b82f6',
        leaderboardLabel: 'Numbers Called',
        activeClass: 'bg-blue-500/20 text-blue-100 border-blue-400',
        borderClass: 'border-blue-500/50 bg-blue-500/10',
        textColor: '#93c5fd',
      },
      marry: {
        emoji: '✓',
        label: 'Marked',
        color: '#22c55e',
        leaderboardLabel: 'Marked',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#86efac',
      },
      kill: {
        emoji: '🏆',
        label: 'Bingo',
        color: '#fbbf24',
        leaderboardLabel: 'Winners',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
    },
  },
  codewords: {
    id: 'codewords',
    label: 'Codewords',
    tagline: 'Spymasters give clues, teams guess words',
    headerEmoji: '🕵️🔤',
    card: {
      accent: '#dc2626',
      accentSoft: 'rgba(220, 38, 38, 0.12)',
      emoji: '🕵️',
      players: '4–12 players',
      vibe: 'Word spy game',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🔴',
        label: 'Red',
        color: '#ef4444',
        leaderboardLabel: 'Red team',
        activeClass: 'bg-red-500/20 text-red-100 border-red-400',
        borderClass: 'border-red-500/50 bg-red-500/10',
        textColor: '#fca5a5',
      },
      marry: {
        emoji: '🔵',
        label: 'Blue',
        color: '#3b82f6',
        leaderboardLabel: 'Blue team',
        activeClass: 'bg-blue-500/20 text-blue-100 border-blue-400',
        borderClass: 'border-blue-500/50 bg-blue-500/10',
        textColor: '#93c5fd',
      },
      kill: {
        emoji: '💀',
        label: 'Assassin',
        color: '#171717',
        leaderboardLabel: 'Assassin',
        activeClass: 'bg-neutral-800/30 text-neutral-200 border-neutral-600',
        borderClass: 'border-neutral-600/50 bg-neutral-800/20',
        textColor: '#a3a3a3',
      },
    },
  },
  trivia: {
    id: 'trivia',
    label: 'Trivia',
    tagline: 'Fast-finger trivia quiz — speed wins',
    headerEmoji: '🧠⚡',
    card: {
      accent: '#f43f5e',
      accentSoft: 'rgba(244, 63, 94, 0.15)',
      emoji: '🧠',
      players: '2–40 players',
      vibe: 'Quiz showdown',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '✓',
        label: 'Correct',
        color: '#22c55e',
        leaderboardLabel: 'Correct answers',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#86efac',
      },
      marry: {
        emoji: '⚡',
        label: 'Speed',
        color: '#f59e0b',
        leaderboardLabel: 'Fastest fingers',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
      kill: {
        emoji: '🏆',
        label: 'Points',
        color: '#f43f5e',
        leaderboardLabel: 'Top scorers',
        activeClass: 'bg-rose-500/20 text-rose-900 border-rose-400 dark:text-rose-100',
        borderClass: 'border-rose-500/50 bg-rose-500/10',
        textColor: '#fb7185',
      },
    },
  },
  two_truths: {
    id: 'two_truths',
    label: 'Two Truths & a Lie',
    tagline: 'Two truths and a lie — spot the fib',
    headerEmoji: '🎭🤥',
    card: {
      accent: '#8b5cf6',
      accentSoft: 'rgba(139, 92, 246, 0.15)',
      emoji: '🎭',
      players: '3–40 players',
      vibe: 'Social deduction',
    },
    slots: {
      kiss: {
        emoji: '✓',
        label: 'Truth',
        color: '#22c55e',
        leaderboardLabel: 'Correct guesses',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#86efac',
      },
      marry: {
        emoji: '✓',
        label: 'Truth',
        color: '#3b82f6',
        leaderboardLabel: 'Truths',
        activeClass: 'bg-blue-500/20 text-blue-100 border-blue-400',
        borderClass: 'border-blue-500/50 bg-blue-500/10',
        textColor: '#93c5fd',
      },
      kill: {
        emoji: '🤥',
        label: 'Lie',
        color: '#a855f7',
        leaderboardLabel: 'Lies spotted',
        activeClass: 'bg-violet-500/20 text-violet-100 border-violet-400',
        borderClass: 'border-violet-500/50 bg-violet-500/10',
        textColor: '#c4b5fd',
      },
    },
  },
  monopoly: {
    id: 'monopoly',
    label: 'Monopoly',
    tagline: 'Buy, build, bankrupt your friends',
    headerEmoji: '🎲🏠',
    card: {
      accent: '#16a34a',
      accentSoft: 'rgba(22, 163, 74, 0.15)',
      emoji: '🎩',
      players: '2–6 players',
      vibe: 'Board game night',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '💵',
        label: 'Cash',
        color: '#22c55e',
        leaderboardLabel: 'Most cash',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#86efac',
      },
      marry: {
        emoji: '🏠',
        label: 'Property',
        color: '#3b82f6',
        leaderboardLabel: 'Most properties',
        activeClass: 'bg-blue-500/20 text-blue-100 border-blue-400',
        borderClass: 'border-blue-500/50 bg-blue-500/10',
        textColor: '#93c5fd',
      },
      kill: {
        emoji: '🏆',
        label: 'Winner',
        color: '#fbbf24',
        leaderboardLabel: 'Winner',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
    },
  },
  yahtzee: {
    id: 'yahtzee',
    label: 'Yahtzee',
    tagline: 'Roll, hold, and score the combos',
    headerEmoji: '🎲🧠',
    card: {
      accent: '#f59e0b',
      accentSoft: 'rgba(245, 158, 11, 0.15)',
      emoji: '🎲',
      players: '1–6 players',
      vibe: 'Dice strategy',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '6️⃣',
        label: 'Upper total',
        color: '#f59e0b',
        leaderboardLabel: 'Top upper total',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
      marry: {
        emoji: '🧩',
        label: 'Lower total',
        color: '#8b5cf6',
        leaderboardLabel: 'Top lower total',
        activeClass: 'bg-violet-500/20 text-violet-100 border-violet-400',
        borderClass: 'border-violet-500/50 bg-violet-500/10',
        textColor: '#ddd6fe',
      },
      kill: {
        emoji: '🏆',
        label: 'Total score',
        color: '#ef4444',
        leaderboardLabel: 'Best total score',
        activeClass: 'bg-red-500/20 text-red-100 border-red-400',
        borderClass: 'border-red-500/50 bg-red-500/10',
        textColor: '#fca5a5',
      },
    },
  },
  whot: {
    id: 'whot',
    label: 'Whot',
    tagline: 'Match shape or number to win',
    headerEmoji: '🃏🇳🇬',
    card: {
      accent: '#059669',
      accentSoft: 'rgba(5, 150, 105, 0.15)',
      emoji: '🃏',
      players: '2–6 players',
      vibe: 'Naija card night',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🃏',
        label: 'Cards left',
        color: '#059669',
        leaderboardLabel: 'Fewest cards',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#6ee7b7',
      },
      marry: {
        emoji: '2️⃣',
        label: 'Pick 2',
        color: '#f97316',
        leaderboardLabel: 'Pick 2 plays',
        activeClass: 'bg-orange-500/20 text-orange-100 border-orange-400',
        borderClass: 'border-orange-500/50 bg-orange-500/10',
        textColor: '#fdba74',
      },
      kill: {
        emoji: '🏆',
        label: 'Winner',
        color: '#fbbf24',
        leaderboardLabel: 'Winner',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
    },
  },
  crazy_eights: {
    id: 'crazy_eights',
    label: 'Crazy Eights',
    tagline: 'Match rank or suit — 8s are wild',
    headerEmoji: '🎴8️⃣',
    card: {
      accent: '#7c3aed',
      accentSoft: 'rgba(124, 58, 237, 0.15)',
      emoji: '🎴',
      players: '2–6 players',
      vibe: 'Card night classic',
      featured: false,
    },
    slots: {
      kiss: {
        emoji: '🎴',
        label: 'Cards left',
        color: '#7c3aed',
        leaderboardLabel: 'Fewest cards',
        activeClass: 'bg-violet-500/20 text-violet-100 border-violet-400',
        borderClass: 'border-violet-500/50 bg-violet-500/10',
        textColor: '#c4b5fd',
      },
      marry: {
        emoji: '8️⃣',
        label: 'Crazy 8',
        color: '#f97316',
        leaderboardLabel: 'Wild 8 plays',
        activeClass: 'bg-orange-500/20 text-orange-100 border-orange-400',
        borderClass: 'border-orange-500/50 bg-orange-500/10',
        textColor: '#fdba74',
      },
      kill: {
        emoji: '🏆',
        label: 'Winner',
        color: '#fbbf24',
        leaderboardLabel: 'Winner',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
    },
  },
  ludo: {
    id: 'ludo',
    label: 'Ludo',
    tagline: 'Roll, race home, capture rivals',
    headerEmoji: '🎲🔴',
    card: {
      accent: '#dc2626',
      accentSoft: 'rgba(220, 38, 38, 0.12)',
      emoji: '🔴',
      players: '2–4 players',
      vibe: 'Board game classic',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🏠',
        label: 'Pieces home',
        color: '#22c55e',
        leaderboardLabel: 'Most pieces home',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#86efac',
      },
      marry: {
        emoji: '🎯',
        label: 'Captures',
        color: '#f97316',
        leaderboardLabel: 'Captures',
        activeClass: 'bg-orange-500/20 text-orange-100 border-orange-400',
        borderClass: 'border-orange-500/50 bg-orange-500/10',
        textColor: '#fdba74',
      },
      kill: {
        emoji: '🏆',
        label: 'Winner',
        color: '#fbbf24',
        leaderboardLabel: 'Winner',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
    },
  },
  mahjong: {
    id: 'mahjong',
    label: 'Mahjong',
    tagline: 'Four-player Mahjong — claims, kongs, riichi',
    headerEmoji: '🀄',
    card: {
      accent: '#0f766e',
      accentSoft: 'rgba(15, 118, 110, 0.13)',
      emoji: '🀄',
      players: '4 players',
      vibe: 'Strategic tile play',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🀄',
        label: 'Hand',
        color: '#14b8a6',
        leaderboardLabel: 'Winning hands',
        activeClass: 'bg-teal-500/20 text-teal-100 border-teal-400',
        borderClass: 'border-teal-500/50 bg-teal-500/10',
        textColor: '#5eead4',
      },
      marry: {
        emoji: '🎴',
        label: 'Calls',
        color: '#f59e0b',
        leaderboardLabel: 'Calls',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
      kill: {
        emoji: '🏆',
        label: 'Winner',
        color: '#fbbf24',
        leaderboardLabel: 'Winner',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
    },
  },
  snake_and_ladder: {
    id: 'snake_and_ladder',
    label: 'Snake & Ladder',
    tagline: 'Climb ladders, dodge snakes, reach 100',
    headerEmoji: '🐍🪜',
    card: {
      accent: '#16a34a',
      accentSoft: 'rgba(22, 163, 74, 0.12)',
      emoji: '🐍',
      players: '2–6 players',
      vibe: 'Board game classic',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🪜',
        label: 'Position',
        color: '#22c55e',
        leaderboardLabel: 'Furthest along',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#86efac',
      },
      marry: {
        emoji: '🎲',
        label: 'Last roll',
        color: '#0ea5e9',
        leaderboardLabel: 'Last roll',
        activeClass: 'bg-sky-500/20 text-sky-100 border-sky-400',
        borderClass: 'border-sky-500/50 bg-sky-500/10',
        textColor: '#7dd3fc',
      },
      kill: {
        emoji: '🏆',
        label: 'Winner',
        color: '#fbbf24',
        leaderboardLabel: 'Winner',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
    },
  },
  tic_tac_toe: {
    id: 'tic_tac_toe',
    label: 'Tic-Tac-Toe',
    tagline: 'Nine boards in one — win three to win',
    headerEmoji: '⭕❌',
    card: {
      accent: '#0ea5e9',
      accentSoft: 'rgba(14, 165, 233, 0.15)',
      emoji: '⭕',
      players: '2 players',
      vibe: 'Quick head-to-head',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '❌',
        label: 'X',
        color: '#0ea5e9',
        leaderboardLabel: 'X wins',
        activeClass: 'bg-sky-500/20 text-sky-100 border-sky-400',
        borderClass: 'border-sky-500/50 bg-sky-500/10',
        textColor: '#7dd3fc',
      },
      marry: {
        emoji: '⭕',
        label: 'O',
        color: '#f97316',
        leaderboardLabel: 'O wins',
        activeClass: 'bg-orange-500/20 text-orange-100 border-orange-400',
        borderClass: 'border-orange-500/50 bg-orange-500/10',
        textColor: '#fdba74',
      },
      kill: {
        emoji: '🏆',
        label: 'Winner',
        color: '#fbbf24',
        leaderboardLabel: 'Winner',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
    },
  },
  i_call_on: {
    id: 'i_call_on',
    label: 'I Call On',
    tagline: 'Call a letter, fill the categories',
    headerEmoji: '🔤🌍',
    card: {
      accent: '#0ea5e9',
      accentSoft: 'rgba(14, 165, 233, 0.15)',
      emoji: '🔤',
      players: '3–20 players',
      vibe: 'Classic word rush',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '✓',
        label: 'Unique',
        color: '#22c55e',
        leaderboardLabel: 'Top scorers',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#86efac',
      },
      marry: {
        emoji: '🔤',
        label: 'Letter',
        color: '#0ea5e9',
        leaderboardLabel: 'Letters called',
        activeClass: 'bg-sky-500/20 text-sky-100 border-sky-400',
        borderClass: 'border-sky-500/50 bg-sky-500/10',
        textColor: '#7dd3fc',
      },
      kill: {
        emoji: '0',
        label: 'Duplicate',
        color: '#ef4444',
        leaderboardLabel: 'Duplicates',
        activeClass: 'bg-red-500/20 text-red-100 border-red-400',
        borderClass: 'border-red-500/50 bg-red-500/10',
        textColor: '#fca5a5',
      },
    },
  },
  sudoku: {
    id: 'sudoku',
    label: 'Sudoku',
    tagline: 'Race to claim cells — first to solve wins',
    headerEmoji: '🔢🧩',
    card: {
      accent: '#8b5cf6',
      accentSoft: 'rgba(139, 92, 246, 0.15)',
      emoji: '🔢',
      players: '2–20 players',
      vibe: 'Puzzle race',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🥇',
        label: '1st',
        color: '#22c55e',
        leaderboardLabel: '1st claims',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#86efac',
      },
      marry: {
        emoji: '🔢',
        label: 'Points',
        color: '#8b5cf6',
        leaderboardLabel: 'Total points',
        activeClass: 'bg-violet-500/20 text-violet-100 border-violet-400',
        borderClass: 'border-violet-500/50 bg-violet-500/10',
        textColor: '#c4b5fd',
      },
      kill: {
        emoji: '✗',
        label: 'Wrong',
        color: '#ef4444',
        leaderboardLabel: 'Wrong guesses',
        activeClass: 'bg-red-500/20 text-red-100 border-red-400',
        borderClass: 'border-red-500/50 bg-red-500/10',
        textColor: '#fca5a5',
      },
    },
  },
  matching_pairs: {
    id: 'matching_pairs',
    label: 'Matching Pairs',
    tagline: 'Flip and match icons — streaks and speed score big',
    headerEmoji: '🃏✨',
    card: {
      accent: '#f59e0b',
      accentSoft: 'rgba(245, 158, 11, 0.15)',
      emoji: '🃏',
      players: '1–20 players',
      vibe: 'Memory race',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '✅',
        label: 'Pairs',
        color: '#22c55e',
        leaderboardLabel: 'Pairs matched',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#86efac',
      },
      marry: {
        emoji: '⭐',
        label: 'Points',
        color: '#f59e0b',
        leaderboardLabel: 'Total points',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
      kill: {
        emoji: '✗',
        label: 'Misses',
        color: '#ef4444',
        leaderboardLabel: 'Wrong attempts',
        activeClass: 'bg-red-500/20 text-red-100 border-red-400',
        borderClass: 'border-red-500/50 bg-red-500/10',
        textColor: '#fca5a5',
      },
    },
  },

  quiplash: {
    id: 'quiplash',
    label: 'Quiplash',
    tagline: 'Fill in the blank — vote for the funniest answer',
    headerEmoji: '✍️😂',
    card: {
      accent: '#ec4899',
      accentSoft: 'rgba(236, 72, 153, 0.15)',
      emoji: '✍️',
      players: '3–6 players',
      vibe: 'Funny answers',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🏆',
        label: 'Points',
        color: '#f59e0b',
        leaderboardLabel: 'Total points',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
      marry: {
        emoji: '😂',
        label: 'Wins',
        color: '#ec4899',
        leaderboardLabel: 'Battle wins',
        activeClass: 'bg-pink-500/20 text-pink-100 border-pink-400',
        borderClass: 'border-pink-500/50 bg-pink-500/10',
        textColor: '#f9a8d4',
      },
      kill: {
        emoji: '✍️',
        label: 'Answers',
        color: '#a855f7',
        leaderboardLabel: 'Answers submitted',
        activeClass: 'bg-violet-500/20 text-violet-100 border-violet-400',
        borderClass: 'border-violet-500/50 bg-violet-500/10',
        textColor: '#c4b5fd',
      },
    },
  },

  quick_draw: {
    id: 'quick_draw',
    label: 'Quick Draw',
    tagline: 'Draw weird prompts — fool everyone or race to guess',
    headerEmoji: '🎨😂',
    card: {
      accent: '#8b5cf6',
      accentSoft: 'rgba(139, 92, 246, 0.15)',
      emoji: '🎨',
      players: '3–10 players',
      vibe: 'Drawing chaos',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🏆',
        label: 'Points',
        color: '#f59e0b',
        leaderboardLabel: 'Total points',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
      marry: {
        emoji: '😈',
        label: 'Fooled',
        color: '#8b5cf6',
        leaderboardLabel: 'Players fooled',
        activeClass: 'bg-violet-500/20 text-violet-100 border-violet-400',
        borderClass: 'border-violet-500/50 bg-violet-500/10',
        textColor: '#c4b5fd',
      },
      kill: {
        emoji: '🎨',
        label: 'Drawings',
        color: '#ec4899',
        leaderboardLabel: 'Drawings submitted',
        activeClass: 'bg-pink-500/20 text-pink-100 border-pink-400',
        borderClass: 'border-pink-500/50 bg-pink-500/10',
        textColor: '#f9a8d4',
      },
    },
  },

  word_hunt: {
    id: 'word_hunt',
    label: 'Word Hunt',
    tagline: 'Find words in the grid before time runs out',
    headerEmoji: '🔤⏱️',
    card: {
      accent: '#22c55e',
      accentSoft: 'rgba(34, 197, 94, 0.15)',
      emoji: '🔤',
      players: '2–20 players',
      vibe: 'Boggle-style rush',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🔤',
        label: 'Words',
        color: '#22c55e',
        leaderboardLabel: 'Words found',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#86efac',
      },
      marry: {
        emoji: '⭐',
        label: 'Points',
        color: '#fbbf24',
        leaderboardLabel: 'Total points',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
      kill: {
        emoji: '⏱️',
        label: 'Timer',
        color: '#0ea5e9',
        leaderboardLabel: 'Race against time',
        activeClass: 'bg-sky-500/20 text-sky-100 border-sky-400',
        borderClass: 'border-sky-500/50 bg-sky-500/10',
        textColor: '#7dd3fc',
      },
    },
  },
  chess: {
    id: 'chess',
    label: 'Chess',
    tagline: 'Classic chess — checkmate to win',
    headerEmoji: '♚♛',
    card: {
      accent: '#6366f1',
      accentSoft: 'rgba(99, 102, 241, 0.15)',
      emoji: '♟️',
      players: '2 players',
      vibe: 'Battle of wits',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '♔',
        label: 'White',
        color: '#e2e8f0',
        leaderboardLabel: 'White wins',
        activeClass: 'bg-slate-200/20 text-slate-100 border-slate-300',
        borderClass: 'border-slate-300/50 bg-slate-200/10',
        textColor: '#e2e8f0',
      },
      marry: {
        emoji: '♚',
        label: 'Black',
        color: '#475569',
        leaderboardLabel: 'Black wins',
        activeClass: 'bg-slate-700/30 text-slate-100 border-slate-500',
        borderClass: 'border-slate-600/50 bg-slate-700/20',
        textColor: '#cbd5e1',
      },
      kill: {
        emoji: '🏆',
        label: 'Winner',
        color: '#fbbf24',
        leaderboardLabel: 'Winner',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
    },
  },
  checkers: {
    id: 'checkers',
    label: 'Checkers',
    tagline: 'Classic draughts — capture all pieces to win',
    headerEmoji: '⛀⛂',
    card: {
      accent: '#dc2626',
      accentSoft: 'rgba(220, 38, 38, 0.15)',
      emoji: '⛀',
      players: '2 players',
      vibe: 'Jump to win',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🔴',
        label: 'Red',
        color: '#ef4444',
        leaderboardLabel: 'Red wins',
        activeClass: 'bg-red-500/20 text-red-100 border-red-400',
        borderClass: 'border-red-500/50 bg-red-500/10',
        textColor: '#fca5a5',
      },
      marry: {
        emoji: '⚫',
        label: 'Black',
        color: '#475569',
        leaderboardLabel: 'Black wins',
        activeClass: 'bg-slate-700/30 text-slate-100 border-slate-500',
        borderClass: 'border-slate-600/50 bg-slate-700/20',
        textColor: '#cbd5e1',
      },
      kill: {
        emoji: '🏆',
        label: 'Winner',
        color: '#fbbf24',
        leaderboardLabel: 'Winner',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
    },
  },
  ayo: {
    id: 'ayo',
    label: 'Ayo',
    tagline: 'Yoruba seed game — sow, capture twos and threes, crown Ọta',
    headerEmoji: '🌰🎯',
    card: {
      accent: '#b45309',
      accentSoft: 'rgba(180, 83, 9, 0.15)',
      emoji: '🌰',
      players: '2 players',
      vibe: 'Sow & capture',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🌰',
        label: 'Player A',
        color: '#d97706',
        leaderboardLabel: 'Ọta',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
      marry: {
        emoji: '🎯',
        label: 'Player B',
        color: '#92400e',
        leaderboardLabel: 'Ọpẹ',
        activeClass: 'bg-orange-900/30 text-orange-100 border-orange-700',
        borderClass: 'border-orange-800/50 bg-orange-900/20',
        textColor: '#fdba74',
      },
      kill: {
        emoji: '🏆',
        label: 'Ọta champion',
        color: '#fbbf24',
        leaderboardLabel: 'Champion',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
    },
  },
  describe_it: {
    id: 'describe_it',
    label: 'Text Charades',
    tagline: 'Describe the word, teammates guess',
    headerEmoji: '🗣️💬',
    card: {
      accent: '#14b8a6',
      accentSoft: 'rgba(20, 184, 166, 0.15)',
      emoji: '🗣️',
      players: '4–20 players',
      vibe: 'Team word race',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🗣️',
        label: 'Describer',
        color: '#14b8a6',
        leaderboardLabel: 'Clues given',
        activeClass: 'bg-teal-500/20 text-teal-100 border-teal-400',
        borderClass: 'border-teal-500/50 bg-teal-500/10',
        textColor: '#5eead4',
      },
      marry: {
        emoji: '💬',
        label: 'Guessers',
        color: '#6366f1',
        leaderboardLabel: 'Words guessed',
        activeClass: 'bg-indigo-500/20 text-indigo-100 border-indigo-400',
        borderClass: 'border-indigo-500/50 bg-indigo-500/10',
        textColor: '#a5b4fc',
      },
      kill: {
        emoji: '🏆',
        label: 'Winning team',
        color: '#fbbf24',
        leaderboardLabel: 'Winning team',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
    },
  },
  word_rush: {
    id: 'word_rush',
    label: 'Word Rush',
    tagline: 'Name words that start and end with the letters',
    headerEmoji: '🔤⚡',
    card: {
      accent: '#f97316',
      accentSoft: 'rgba(249, 115, 22, 0.15)',
      emoji: '🔤',
      players: '2–20 players',
      vibe: 'Letter rush',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '✓',
        label: 'Correct',
        color: '#22c55e',
        leaderboardLabel: 'Words scored',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#86efac',
      },
      marry: {
        emoji: '🔤',
        label: 'Prompt',
        color: '#f97316',
        leaderboardLabel: 'Prompts cleared',
        activeClass: 'bg-orange-500/20 text-orange-100 border-orange-400',
        borderClass: 'border-orange-500/50 bg-orange-500/10',
        textColor: '#fdba74',
      },
      kill: {
        emoji: '🏆',
        label: 'Winner',
        color: '#fbbf24',
        leaderboardLabel: 'Winner',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
    },
  },
  scrabble: {
    id: 'scrabble',
    label: 'Scrabble',
    tagline: 'Spell words, rack up points, outscore all',
    headerEmoji: '🔠',
    card: {
      accent: '#10b981',
      accentSoft: 'rgba(16, 185, 129, 0.15)',
      emoji: '🔡',
      players: '2–4 players',
      vibe: 'Word duel',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🔠',
        label: 'Letters',
        color: '#10b981',
        leaderboardLabel: 'Tiles played',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#6ee7b7',
      },
      marry: {
        emoji: '📖',
        label: 'Words',
        color: '#3b82f6',
        leaderboardLabel: 'Words played',
        activeClass: 'bg-blue-500/20 text-blue-100 border-blue-400',
        borderClass: 'border-blue-500/50 bg-blue-500/10',
        textColor: '#93c5fd',
      },
      kill: {
        emoji: '🏆',
        label: 'Winner',
        color: '#fbbf24',
        leaderboardLabel: 'Winner',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
    },
  },
  mafia: {
    id: 'mafia',
    label: 'Mafia',
    tagline: 'Uncover the secret killers before it is too late',
    headerEmoji: '🐺🔪',
    card: {
      accent: '#7c3aed',
      accentSoft: 'rgba(124, 58, 237, 0.15)',
      emoji: '🐺',
      players: '5–16 players',
      vibe: 'Social deduction',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🏘️',
        label: 'Villager',
        color: '#10b981',
        leaderboardLabel: 'Village wins',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#86efac',
      },
      marry: {
        emoji: '🔪',
        label: 'Mafia',
        color: '#ef4444',
        leaderboardLabel: 'Mafia wins',
        activeClass: 'bg-red-500/20 text-red-100 border-red-400',
        borderClass: 'border-red-500/50 bg-red-500/10',
        textColor: '#fca5a5',
      },
      kill: {
        emoji: '🏆',
        label: 'Winner',
        color: '#fbbf24',
        leaderboardLabel: 'Winner',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
    },
  },
  crossword: {
    id: 'crossword',
    label: 'Crossword',
    tagline: 'Race to fill the grid — first to solve wins',
    headerEmoji: '🧩✏️',
    card: {
      accent: '#0ea5e9',
      accentSoft: 'rgba(14, 165, 233, 0.15)',
      emoji: '🧩',
      players: '1–20 players',
      vibe: 'Word race',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🏆',
        label: 'Points',
        color: '#0ea5e9',
        leaderboardLabel: 'Total points',
        activeClass: 'bg-sky-500/20 text-sky-100 border-sky-400',
        borderClass: 'border-sky-500/50 bg-sky-500/10',
        textColor: '#7dd3fc',
      },
      marry: {
        emoji: '🔤',
        label: 'Words',
        color: '#22c55e',
        leaderboardLabel: 'Words solved',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#86efac',
      },
      kill: {
        emoji: '⚡',
        label: 'Speed',
        color: '#f59e0b',
        leaderboardLabel: 'First finishes',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
    },
  },
  word_search: {
    id: 'word_search',
    label: 'Word Search',
    tagline: 'Find the listed words hidden in the grid',
    headerEmoji: '🔎🔤',
    card: {
      accent: '#8b5cf6',
      accentSoft: 'rgba(139, 92, 246, 0.15)',
      emoji: '🔎',
      players: '1–20 players',
      vibe: 'Word hunt race',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🏆',
        label: 'Points',
        color: '#8b5cf6',
        leaderboardLabel: 'Total points',
        activeClass: 'bg-violet-500/20 text-violet-100 border-violet-400',
        borderClass: 'border-violet-500/50 bg-violet-500/10',
        textColor: '#c4b5fd',
      },
      marry: {
        emoji: '🔤',
        label: 'Words',
        color: '#22c55e',
        leaderboardLabel: 'Words found',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#86efac',
      },
      kill: {
        emoji: '⚡',
        label: 'Speed',
        color: '#f59e0b',
        leaderboardLabel: 'First finds',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
    },
  },
  word_scramble: {
    id: 'word_scramble',
    label: 'Word Scramble',
    tagline: 'Unscramble the jumbled word before everyone else',
    headerEmoji: '🔀🔤',
    card: {
      accent: '#f59e0b',
      accentSoft: 'rgba(245, 158, 11, 0.15)',
      emoji: '🔀',
      players: '1–20 players',
      vibe: 'Quick-fire race',
      featured: true,
    },
    slots: {
      kiss: {
        emoji: '🏆',
        label: 'Points',
        color: '#f59e0b',
        leaderboardLabel: 'Total points',
        activeClass: 'bg-amber-500/20 text-amber-100 border-amber-400',
        borderClass: 'border-amber-500/50 bg-amber-500/10',
        textColor: '#fcd34d',
      },
      marry: {
        emoji: '🔤',
        label: 'Solved',
        color: '#22c55e',
        leaderboardLabel: 'Words solved',
        activeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400',
        borderClass: 'border-emerald-500/50 bg-emerald-500/10',
        textColor: '#86efac',
      },
      kill: {
        emoji: '⚡',
        label: 'Speed',
        color: '#8b5cf6',
        leaderboardLabel: 'First solves',
        activeClass: 'bg-violet-500/20 text-violet-100 border-violet-400',
        borderClass: 'border-violet-500/50 bg-violet-500/10',
        textColor: '#c4b5fd',
      },
    },
  },
}

/** Home page “Popular games” grid — order is display order. */
export const HOMEPAGE_FEATURED_GAMES: GameType[] = [
  'yahtzee',
  'whot',
  'monopoly',
  'codewords',
  'ludo',
  'describe_it',
  'bingo',
  'trivia',
]

export const GAME_TYPE_OPTIONS: GameType[] = [
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'parent_approval',
  'would_you_rather',
  'never_have_i_ever',
  'pick_a_number',
  'this_or_that',
  'most_likely_to',
  'who_said_this',
  'hot_seat',
  'custom',
  'anonymous_messages',
  'secret_message',
  'bingo',
  'codewords',
  'trivia',
  'two_truths',
  'monopoly',
  'yahtzee',
  'whot',
  'ludo',
  'mahjong',
  'i_call_on',
  'sudoku',
  'tic_tac_toe',
  'word_hunt',
  'chess',
  'describe_it',
  'word_rush',
  'scrabble',
  'snake_and_ladder',
  'crazy_eights',
  'checkers',
  'mafia',
  'matching_pairs',
  'quiplash',
  'quick_draw',
  'ayo',
  'crossword',
  'word_search',
  'word_scramble',
]

// Games pinned to the top of the picker / games list, in this exact order.
// Anything not listed here follows in GAME_TYPE_OPTIONS order.
const PINNED_GAME_TYPES: GameType[] = [
  'monopoly',
  'yahtzee',
  'codewords',
  'trivia',
  'whot',
  'ludo',
  'mahjong',
  'snake_and_ladder',
  'tic_tac_toe',
  'sudoku',
  'chess',
  'checkers',
  'scrabble',
  'word_hunt',
  'describe_it',
  'word_rush',
  'i_call_on',
  'smash_marry_kill',
  'bingo',
  'this_or_that',
  'two_truths',
  'mafia',
  'matching_pairs',
  'quiplash',
  'quick_draw',
]

// Display order: pinned games first, then the remaining games in their default order.
export const GAME_TYPE_DISPLAY_ORDER: GameType[] = [
  ...PINNED_GAME_TYPES,
  ...GAME_TYPE_OPTIONS.filter((type) => !PINNED_GAME_TYPES.includes(type)),
]

export function parseGameType(raw: unknown): GameType {
  if (raw === 'red_flag_green_flag') return 'red_flag_green_flag'
  if (raw === 'smash_or_pass') return 'smash_or_pass'
  if (raw === 'parent_approval') return 'parent_approval'
  if (raw === 'would_you_rather') return 'would_you_rather'
  if (raw === 'never_have_i_ever') return 'never_have_i_ever'
  if (raw === 'pick_a_number') return 'pick_a_number'
  if (raw === 'this_or_that') return 'this_or_that'
  if (raw === 'most_likely_to') return 'most_likely_to'
  if (raw === 'who_said_this') return 'who_said_this'
  if (raw === 'hot_seat') return 'hot_seat'
  if (raw === 'custom') return 'custom'
  if (raw === 'anonymous_messages') return 'anonymous_messages'
  if (raw === 'secret_message') return 'secret_message'
  if (raw === 'bingo') return 'bingo'
  if (raw === 'codewords') return 'codewords'
  if (raw === 'trivia') return 'trivia'
  if (raw === 'two_truths') return 'two_truths'
  if (raw === 'monopoly') return 'monopoly'
  if (raw === 'yahtzee') return 'yahtzee'
  if (raw === 'whot') return 'whot'
  if (raw === 'ludo') return 'ludo'
  if (raw === 'mahjong') return 'mahjong'
  if (raw === 'i_call_on') return 'i_call_on'
  if (raw === 'sudoku') return 'sudoku'
  if (raw === 'tic_tac_toe') return 'tic_tac_toe'
  if (raw === 'word_hunt') return 'word_hunt'
  if (raw === 'chess') return 'chess'
  if (raw === 'describe_it' || raw === 'text-charades') return 'describe_it'
  if (raw === 'word_rush' || raw === 'word-rush') return 'word_rush'
  if (raw === 'scrabble') return 'scrabble'
  if (raw === 'snake_and_ladder' || raw === 'snakes-and-ladders') return 'snake_and_ladder'
  if (raw === 'crazy_eights' || raw === 'crazy-eights') return 'crazy_eights'
  if (raw === 'checkers' || raw === 'draughts') return 'checkers'
  if (raw === 'mafia' || raw === 'werewolf') return 'mafia'
  if (raw === 'matching_pairs') return 'matching_pairs'
  if (raw === 'quiplash') return 'quiplash'
  if (raw === 'quick_draw' || raw === 'quick-draw') return 'quick_draw'
  if (raw === 'ayo' || raw === 'awale' || raw === 'ayo-olopon') return 'ayo'
  if (raw === 'crossword' || raw === 'crosswords') return 'crossword'
  if (raw === 'word_search' || raw === 'word-search' || raw === 'wordsearch') return 'word_search'
  if (raw === 'word_scramble' || raw === 'word-scramble' || raw === 'wordscramble') return 'word_scramble'
  return 'smash_marry_kill'
}

/**
 * The `?type=` value to use in /create links. Text Charades uses its public
 * slug so the URL reads `text-charades` instead of the internal `describe_it`.
 */
export function gameTypeCreateParam(gameType: GameType): string {
  return gameType === 'describe_it' ? 'text-charades' : gameType === 'quick_draw' ? 'quick-draw' : gameType
}

export function gameTypeConfig(gameType: GameType | string | undefined): GameTypeConfig {
  return GAME_TYPE_CONFIG[parseGameType(gameType)]
}

/**
 * Games that render the design-system voice rail inline in their own room chrome
 * (the top header). These already have a Join-voice control, so the shared
 * floating `AudioChat` pill must NOT be mounted for them (it would double up).
 * Every other game still relies on the floating pill until the header rolls out.
 */
const HEADER_VOICE_GAME_TYPES = new Set<GameType>(['whot'])

export function gameHasHeaderVoice(gameType: GameType | string | undefined): boolean {
  return HEADER_VOICE_GAME_TYPES.has(parseGameType(gameType))
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
      return "Upload everyone's names on the next step. Players claim their name when joining, then submit quotes and who said each one in the lobby. You can add host quotes too — each quote in the pool becomes a round."
    case 'would_you_rather':
      return 'Players join with any name — no list to set up. Each round shows two options and everyone picks A or B. Votes stay anonymous.'
    case 'never_have_i_ever':
      return 'Players join with any name — no list to set up. Each round shows a "Never have I ever…" prompt. Tap I have or I haven\'t — votes stay anonymous until reveal.'
    case 'pick_a_number':
      return 'Players join with any name. Set how many picking turns you want — pickers rotate through the group, independent of headcount. Pick a number from the hidden list and answer the question it reveals.'
    case 'this_or_that':
      return 'Upload your own “Coffee or Tea?” style prompts. Players join with any name — each round shows two options and everyone picks A or B. Votes stay anonymous.'
    case 'hot_seat':
      return joiners
        ? 'Players join with any name — no list to upload. One round per player who joins; you set a max cap and the host lobby shows the final count.'
        : "Upload everyone's names on the next step. Players claim their name when joining. One round per player who joins — you set a max cap; the host lobby shows the final count."
    case 'anonymous_messages':
      return 'Players join with an auto-assigned name — no sign-up. When the host starts, everyone posts anonymous messages that appear live for the whole room.'
    case 'secret_message':
      return 'Create your link and share it anywhere. Anyone who opens it can send you a message — senders never see each other’s messages, and only you can read your inbox.'
    case 'bingo':
      return 'Players join with their name and get a random bingo card when you start — they do not pick their own numbers. Call numbers B1–O75; players tap called squares on their card and hit BINGO when they complete a line.'
    case 'codewords':
      return 'Players join, pick Red or Blue and a role (spymaster or operative). You start when each team has 1 spymaster and at least 1 operative. Spymasters see the secret key and give one-word clues; operatives guess words on the 5×5 grid. Avoid the assassin!'
    case 'trivia':
      return 'Players join with their name. Each round shows a multiple-choice question — fastest correct answers score the most. Pick Tech or General Knowledge, or upload your own CSV. Live leaderboard tracks who is winning.'
    case 'two_truths':
      return 'Everyone joins with their name and submits two truths plus one lie in the lobby. Each round features one player — everyone else guesses which statement is the lie. Spot the fib for points; fool the room for bonus points.'
    case 'monopoly':
      return 'Players join with their name. Everyone starts on GO with £1,500. UK board — roll, buy or auction, build houses, mortgage, trade, and draw full Chance & Community Chest decks. Last player standing wins!'
    case 'yahtzee':
      return 'Players roll, hold dice, and choose a score category each turn. Build the best total across all combos.'
    case 'whot':
      return 'Players join with their name. Match the top card by shape or number — WHOT lets you call the next match. Pick 2 and Pick 3 stacks are separate. First to empty their hand wins — or lowest hand total when the game clock runs out.'
    case 'ludo':
      return 'Players join with their name. Roll two dice each turn and use each die separately — a 6 brings pieces out; doubles earn another roll after both dice are played. Capture opponents, block with pairs — first to finish all four pieces wins!'
    case 'mahjong':
      return 'Four players join with their name. Draw and discard tiles, call Chow/Pung/Kong/Ron when available, and build a complete winning hand. Hosts can choose Simple Mahjong for learners, or Hong Kong, Riichi, and MCR rules for advanced tables.'
    case 'snake_and_ladder':
      return 'Players join with their name — 2 to 6 play. Take turns rolling one die and racing up the 1–100 board. Land on a ladder to climb, a snake to slide down. Roll a 6 to go again. You must land on 100 exactly to win!'
    case 'tic_tac_toe':
      return 'Two players join with their name. The host can play too. Ultimate Tic-Tac-Toe is nine small 3x3 boards in one big grid — the cell you play sends your opponent to the matching board. Win a small board with three in a row, and win the game by taking three boards in a row.'
    case 'word_hunt':
      return 'Players join with their name. Everyone gets the same 4×4 letter grid — connect adjacent letters to spell valid words (3+ letters) before the timer runs out. Longer words score more points.'
    case 'matching_pairs':
      return 'Players join with their name. Everyone gets their own board with the same set of icons — flip two cards per turn; a match keeps them face-up and scores +1000 pts. Hit 3 in a row with no miss for a +500 streak bonus. Match every pair with zero misses for a +2000 perfect-game bonus. Fastest to finish scores a placement bonus. Most points when everyone is done wins.'
    case 'quiplash':
      return 'Players join with their name. Each round shows a fill-in-the-blank prompt — everyone writes one funny answer. Answers are paired head-to-head and the group votes for the funniest. You earn one point per vote your answer gets. Most points after all rounds wins.'
    case 'quick_draw':
      return 'Players join with their name. Lie mode: draw a weird prompt, others write fake titles, vote on the real one. Guess mode: take turns drawing a secret word while teammates or the room race to guess. Most points wins.'
    case 'chess':
      return 'Two players join with their name. The host can play too. One player is White, the other Black — White moves first. Move pieces by the standard rules; checkmate your opponent to win. Optional chess clock — each player gets their own time bank that only ticks on their turn, and the first to run out loses.'
    case 'checkers':
      return 'Two players join with their name. The host can play too. American 8×8 checkers on dark squares only — 12 pieces each. Black moves first. Men move diagonally forward one square; jump an adjacent opponent to capture — captures are forced, and you must keep jumping with the same piece while more jumps are available. Crown a king on the far row (moves one square any direction). Win by capturing all enemy pieces or blocking every legal move. Draws: threefold repetition or the 40-move rule. Optional per-player clock.'
    case 'ayo':
      return 'Two players join with their name. The host can play too. Choose Traditional Ayo (complete fours on your houses to win them; on opponent houses, last seed wins for you, earlier seeds win for them) or Oware rules (2/3 capture with linkage, seed scoring). Winner is Ọta; three straight round wins makes an Ọta champion. Optional per-player clock.'
    case 'mafia':
      return 'Players join with their name (5 to 16 players). Each player is secretly assigned a role: Villager, Mafia, Doctor, or Detective. The game alternates between Night (when the Mafia kills, the Doctor heals, and the Detective investigates) and Day (when the village discusses and votes to eliminate a suspect). Eliminate the Mafia to win, or parity wins for the Mafia.'
    case 'describe_it':
      return 'Players join with their name and split into teams (you pick how many). Each round, one team is on the clock — a describer sees a secret word and types clues without saying it, while teammates race to type the word. Every correct guess scores a point. Most words across all rounds wins.'
    case 'word_rush':
      return 'Players join with their name. Race to name valid words that start and end with the given letters — team mode races the clock for as many words as possible, individual mode scores everyone each round.'
    case 'crossword':
      return 'Players join with their name — everyone gets the same crossword grid. Read the Across and Down clues, tap a cell, and type the answer. Each word you complete correctly scores points, with a speed bonus for finishing a word first. First to fill the whole grid correctly wins — or the highest score when the timer runs out.'
    case 'word_search':
      return 'Players join with their name — everyone gets the same letter grid and word list. Drag from the first letter to the last to select a hidden word (across, down, or diagonal, sometimes backwards). Each word you find scores points, with a speed bonus for finding it first. First to find every word wins — or the highest score when the timer runs out.'
    case 'word_scramble':
      return 'Players join with their name — everyone gets the same jumbled words. Type the unscrambled answer; correct answers lock in and score, with a speed bonus for solving each scramble first and a bonus for longer words. First to unscramble them all wins — or the highest score when the timer runs out.'
    case 'i_call_on':
      return "Players join with their name. Set a game timer (or play all 26 letters). Each letter cycle someone calls A–Z, everyone fills Name, Animal, Place, Thing, and Food, then marks the next player's sheet. Duplicates score 5 automatically; unique valid answers score 10. Everyone sees all marks live."
    case 'most_likely_to':
      return joiners
        ? 'Players add their name to the poll when joining. Each round shows a "most likely to…" prompt — vote for who fits best. Votes stay anonymous.'
        : 'Upload everyone\'s names on the next step. Players join with their own name to vote. Each round shows a "most likely to…" prompt — vote for who fits best. Votes stay anonymous.'
    case 'red_flag_green_flag':
      return joiners
        ? 'Players add their name to the poll when joining. Each round, two names appear — everyone rates each person green flag or red flag.'
        : participantMode === 'voters'
          ? 'Add names on the next step (celebrities, characters, anyone). Players join with their own name to vote. Each round, two names appear — everyone rates each person green flag or red flag.'
          : "Add everyone's names on the next step. Players claim their name when joining. Each round, two names appear — everyone rates each person green flag or red flag."
    case 'smash_or_pass':
      return joiners
        ? 'Players add their name to the poll when joining. Each round, two names appear — everyone picks smash or pass for each.'
        : participantMode === 'voters'
          ? 'Add names on the next step (celebrities, characters, anyone). Players join with their own name to vote. Each round, two names appear — everyone picks smash or pass for each.'
          : "Add everyone's names on the next step. Players claim their name when joining. Each round, two names appear — everyone picks smash or pass for each."
    case 'parent_approval':
      return joiners
        ? 'Players add their name to the poll when joining. Each round, one name appears — everyone votes yes or no on whether they would let their kid date or marry them.'
        : participantMode === 'voters'
          ? 'Add names on the next step (celebrities, characters, anyone). Players join with their own name to vote. Each round, one name appears — would you let your son or daughter date or marry them?'
          : "Add everyone's names on the next step. Players claim their name when joining. Each round, one name appears — would you let your son or daughter date or marry them?"
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

/** One name per round — yes or no vote. */
export function isUnaryPollGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'parent_approval'
}

/** Pair or unary people polls — binary vote per person via pair_assignments. */
export function isBinaryPeoplePollGame(gameType: GameType | string | undefined): boolean {
  return isPairGame(gameType) || isUnaryPollGame(gameType)
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

export function isNeverHaveIEver(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'never_have_i_ever'
}

export function isPickANumber(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'pick_a_number'
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

// Join-style / poll-family membership as exhaustive Record<GameType, boolean> maps rather
// than hand-written OR-lists: adding a GameType is now a compile error until it's
// classified here, so a new game can't be silently forgotten from a group. Kept
// behaviour-identical to the previous OR-lists — verified per game in game-flags.test.ts.
//
// NOTE: scrabble + snake_and_ladder are fixed here (flipped to true). They're board games
// that were wrongly omitted from the original isNameOnlyPlayerJoin OR-list, which sent their
// players down the gender-required participant join path instead of the clean self-join-by-
// name every other board game uses (monopoly/chess/…). bingo + codewords stay `false` — they
// aren't board games and have their own join flows.
const NAME_ONLY_PLAYER_JOIN_GAMES: Record<GameType, boolean> = {
  smash_marry_kill: false,
  red_flag_green_flag: false,
  smash_or_pass: false,
  would_you_rather: true,
  never_have_i_ever: true,
  pick_a_number: true,
  this_or_that: true,
  most_likely_to: true,
  who_said_this: false,
  hot_seat: false,
  custom: false,
  anonymous_messages: false,
  secret_message: false,
  bingo: false,
  codewords: false,
  trivia: true,
  two_truths: true,
  parent_approval: false,
  monopoly: true,
  yahtzee: true,
  whot: true,
  ludo: true,
  mahjong: true,
  i_call_on: true,
  sudoku: true,
  tic_tac_toe: true,
  word_hunt: true,
  chess: true,
  describe_it: true,
  word_rush: true,
  scrabble: true,
  snake_and_ladder: true,
  crazy_eights: true,
  checkers: true,
  matching_pairs: true,
  quiplash: true,
  quick_draw: true,
  ayo: true,
  crossword: true,
  word_search: true,
  word_scramble: true,
  mafia: false,
}

const LOBBY_GAMES: Record<GameType, boolean> = {
  smash_marry_kill: false,
  red_flag_green_flag: false,
  smash_or_pass: false,
  would_you_rather: true,
  never_have_i_ever: true,
  pick_a_number: true,
  this_or_that: true,
  most_likely_to: false,
  who_said_this: false,
  hot_seat: false,
  custom: false,
  anonymous_messages: true,
  secret_message: true,
  bingo: false,
  codewords: false,
  trivia: false,
  two_truths: false,
  parent_approval: false,
  monopoly: false,
  yahtzee: false,
  whot: false,
  ludo: false,
  mahjong: false,
  i_call_on: false,
  sudoku: false,
  tic_tac_toe: false,
  word_hunt: false,
  chess: false,
  describe_it: false,
  word_rush: false,
  scrabble: false,
  snake_and_ladder: false,
  crazy_eights: false,
  checkers: false,
  matching_pairs: false,
  quiplash: false,
  quick_draw: false,
  ayo: false,
  crossword: false,
  word_search: false,
  word_scramble: false,
  mafia: false,
}

/** WYR + MLT + This or That player join: free name entry, no list. Hot Seat uses import + name claim (see isImportNameClaimGame). */
export function isNameOnlyPlayerJoin(gameType: GameType | string | undefined): boolean {
  return NAME_ONLY_PLAYER_JOIN_GAMES[parseGameType(gameType)]
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
  return LOBBY_GAMES[parseGameType(gameType)]
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

export function isAnonymousMessagesGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'anonymous_messages'
}

export function isSecretMessageGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'secret_message'
}

export function isBingoGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'bingo'
}

export function isCodewordsGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'codewords'
}

export function isTriviaGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'trivia'
}

export function isTwoTruthsGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'two_truths'
}

export function isMonopolyGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'monopoly'
}

export function isYahtzeeGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'yahtzee'
}

export function isWhotGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'whot'
}

export function isCrazyEightsGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'crazy_eights'
}

export function isLudoGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'ludo'
}

export function isMahjongGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'mahjong'
}

export function isTicTacToeGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'tic_tac_toe'
}

export function isChessGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'chess'
}

export function isCheckersGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'checkers'
}

export function isAyoGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'ayo'
}

export function isMafiaGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'mafia'
}

export function isDescribeItGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'describe_it'
}

export function isWordRushGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'word_rush'
}

export function isScrabbleGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'scrabble'
}

export function isSnakeAndLadderGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'snake_and_ladder'
}

export function isICallOnGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'i_call_on'
}

export function isSudokuGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'sudoku'
}

export function isWordHuntGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'word_hunt'
}

export function isMatchingPairsGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'matching_pairs'
}

export function isQuiplashGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'quiplash'
}

export function isQuickDrawGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'quick_draw'
}

export function isCrosswordGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'crossword'
}

export function isWordSearchGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'word_search'
}

export function isWordScrambleGame(gameType: GameType | string | undefined): boolean {
  return parseGameType(gameType) === 'word_scramble'
}

/** Anonymous room or host-only secret message inbox — shared message storage. */
export function isMessageInboxGame(gameType: GameType | string | undefined): boolean {
  const type = parseGameType(gameType)
  return type === 'anonymous_messages' || type === 'secret_message'
}

/** Auto-assigned display name on join — no name input. */
export function isAutoNameJoinGame(gameType: GameType | string | undefined): boolean {
  return isAnonymousMessagesGame(gameType) || isSecretMessageGame(gameType)
}

export function roundPoolSize(gameType: GameType | string | undefined): 1 | 2 | 3 {
  if (isUnaryPollGame(gameType)) return 1
  if (isNeverHaveIEver(gameType)) return 2
  if (isPickANumber(gameType)) return 2
  if (isBinaryChoiceGame(gameType) || isMostLikelyTo(gameType) || isWhoSaidThis(gameType)) return 2
  return isPairGame(gameType) ? 2 : 3
}

export function voteSlots(gameType?: GameType | string): VoteSlot[] {
  return isBinaryPeoplePollGame(gameType) ? ['kiss', 'kill'] : ['kiss', 'marry', 'kill']
}

export function voteCategories(gameType?: GameType | string): VoteCategory[] {
  return isBinaryPeoplePollGame(gameType) ? ['kiss', 'smash'] : ['kiss', 'marry', 'smash']
}

export function assignmentTargetCount(gameType?: GameType | string, participantCount?: number): number {
  if (isBinaryPeoplePollGame(gameType) && participantCount !== undefined) return participantCount
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

// Options for the admin "add game to community leaderboard" dropdown: every game
// type with its display label and accent, sorted alphabetically by label.
export function communityGameTypeOptions(): { id: string; label: string; accent: string }[] {
  const base = Object.values(GAME_TYPE_CONFIG)
    .map((cfg) => ({ id: cfg.id as string, label: cfg.label, accent: cfg.card.accent }))
    .sort((a, b) => a.label.localeCompare(b.label))

  // Achievement entries (e.g. "Codewords — Best Spymaster") let the admin add a
  // role-based leaderboard row. The dropdown label is prefixed with the base game
  // so it reads clearly alongside the normal games.
  const achievements = GAME_ACHIEVEMENTS.map((a) => ({
    id: a.key,
    label: `${GAME_TYPE_CONFIG[a.baseGameType as GameType]?.label ?? a.baseGameType} — ${a.label}`,
    accent: a.accent,
  })).sort((a, b) => a.label.localeCompare(b.label))

  return [...base, ...achievements]
}

// Resolve the leaderboard-row defaults (name/accent) for a community game_type,
// whether it's a real in-app game type or a synthetic achievement key. Used by the
// admin add-game route so both kinds resolve through one place.
export function communityGameTypeMeta(rawType: string): { id: string; name: string; accent: string | null } | null {
  const cfg = GAME_TYPE_CONFIG[rawType as GameType]
  if (cfg) return { id: cfg.id, name: cfg.label, accent: cfg.card.accent }
  const achievement = GAME_ACHIEVEMENTS.find((a) => a.key === rawType)
  if (achievement) return { id: achievement.key, name: achievement.label, accent: achievement.accent }
  return null
}

// Display label for a game type id (falls back to the raw id if unknown).
export function gameTypeLabel(gameType: string | null | undefined): string | null {
  if (!gameType) return null
  return GAME_TYPE_CONFIG[gameType as GameType]?.label ?? gameType
}
