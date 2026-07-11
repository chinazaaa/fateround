export const TEAM_CHIP_COLORS = [
  { bg: '#0c4a6e33', border: '#38bdf8', badge: '#0284c7' },
  { bg: '#83184333', border: '#f472b6', badge: '#db2777' },
  { bg: '#064e3b33', border: '#34d399', badge: '#059669' },
  { bg: '#78350f33', border: '#fbbf24', badge: '#d97706' },
] as const

export function teamChipStyle(team: number) {
  return TEAM_CHIP_COLORS[(team - 1) % TEAM_CHIP_COLORS.length]!
}
