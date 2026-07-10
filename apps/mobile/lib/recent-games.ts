import * as SecureStore from 'expo-secure-store'

const RECENT_KEY = 'fateround_recent_games'
const MAX_RECENT = 8

export type RecentGame = {
  code: string
  title?: string
  gameType?: string
  lastJoinedAt: string
}

export async function getRecentGames(): Promise<RecentGame[]> {
  try {
    const raw = await SecureStore.getItemAsync(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentGame[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function recordRecentGame(entry: Omit<RecentGame, 'lastJoinedAt'>): Promise<void> {
  const code = entry.code.toUpperCase()
  const existing = await getRecentGames()
  const next: RecentGame[] = [
    { ...entry, code, lastJoinedAt: new Date().toISOString() },
    ...existing.filter((g) => g.code.toUpperCase() !== code),
  ].slice(0, MAX_RECENT)
  await SecureStore.setItemAsync(RECENT_KEY, JSON.stringify(next))
}
