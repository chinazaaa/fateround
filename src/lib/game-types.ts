import type { GameType, VoteAssignment } from '@/types'

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

export interface GameTypeConfig {
  id: GameType
  label: string
  tagline: string
  headerEmoji: string
  slots: Record<VoteSlot, SlotMeta>
}

export const GAME_TYPE_CONFIG: Record<GameType, GameTypeConfig> = {
  smash_marry_kill: {
    id: 'smash_marry_kill',
    label: 'Smash Marry Kill',
    tagline: 'Pick one to smash, one to marry, one to kill',
    headerEmoji: '🔥💍💀',
    slots: {
      kiss: {
        emoji: '🔥',
        label: 'Smash',
        color: '#fb923c',
        leaderboardLabel: 'Most Smashed',
        activeClass: 'bg-[var(--kiss)]/20 text-orange-200 border-[var(--kiss)]',
        borderClass: 'border-[var(--kiss)]/50 bg-[var(--kiss)]/10',
        textColor: '#fdba74',
      },
      marry: {
        emoji: '💍',
        label: 'Marry',
        color: '#fbbf24',
        leaderboardLabel: 'Most Married',
        activeClass: 'bg-[var(--marry)]/20 text-amber-100 border-[var(--marry)]',
        borderClass: 'border-[var(--marry)]/50 bg-[var(--marry)]/10',
        textColor: '#fcd34d',
      },
      kill: {
        emoji: '💀',
        label: 'Kill',
        color: '#f87171',
        leaderboardLabel: 'Most Killed',
        activeClass: 'bg-[var(--kill)]/20 text-red-200 border-[var(--kill)]',
        borderClass: 'border-[var(--kill)]/50 bg-[var(--kill)]/10',
        textColor: '#fca5a5',
      },
    },
  },
  red_flag_green_flag: {
    id: 'red_flag_green_flag',
    label: 'Red Flag / Green Flag',
    tagline: 'Green flag, red flag, and pass — one per person',
    headerEmoji: '💚🚩',
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
        activeClass: 'bg-white/10 text-white/80 border-white/30',
        borderClass: 'border-white/25 bg-white/5',
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
}

export const GAME_TYPE_OPTIONS: GameType[] = ['smash_marry_kill', 'red_flag_green_flag']

export function parseGameType(raw: unknown): GameType {
  if (raw === 'red_flag_green_flag') return 'red_flag_green_flag'
  return 'smash_marry_kill'
}

export function gameTypeConfig(gameType: GameType | string | undefined): GameTypeConfig {
  return GAME_TYPE_CONFIG[parseGameType(gameType)]
}

export function voteSlots(): VoteSlot[] {
  return ['kiss', 'marry', 'kill']
}

export function voteCategories(): VoteCategory[] {
  return ['kiss', 'marry', 'smash']
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

export function assignmentEmoji(
  gameType: GameType | string | undefined,
  slot: VoteSlot
): string {
  return slotMeta(gameType, slot).emoji
}

export function emptyAssignment(): VoteAssignment {
  return { kiss: null, marry: null, kill: null }
}

export function isAssignmentComplete(assignment: VoteAssignment): boolean {
  return !!(assignment.kiss && assignment.marry && assignment.kill)
}

export function assignedCount(assignment: VoteAssignment): number {
  return voteSlots().filter((s) => assignment[s]).length
}
