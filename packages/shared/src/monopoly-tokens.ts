/** Classic Monopoly-style player tokens (pick one at join; max 6 players per game). */
export const MONOPOLY_PLAYER_TOKENS = [
  { id: 'car', emoji: '🚗', label: 'Car' },
  { id: 'hat', emoji: '🎩', label: 'Top hat' },
  { id: 'dog', emoji: '🐕', label: 'Dog' },
  { id: 'boot', emoji: '👢', label: 'Boot' },
  { id: 'ship', emoji: '🚢', label: 'Ship' },
  { id: 'cat', emoji: '🐈', label: 'Cat' },
  { id: 'penguin', emoji: '🐧', label: 'Penguin' },
  { id: 'duck', emoji: '🦆', label: 'Duck' },
  { id: 't_rex', emoji: '🦖', label: 'T-Rex' },
  { id: 'horse', emoji: '🐴', label: 'Horse' },
] as const

export type MonopolyTokenId = (typeof MONOPOLY_PLAYER_TOKENS)[number]['id']

export const MONOPOLY_TOKEN_ID_LIST = MONOPOLY_PLAYER_TOKENS.map((t) => t.id)

export function isMonopolyTokenId(value: string): value is MonopolyTokenId {
  return MONOPOLY_TOKEN_ID_LIST.includes(value as MonopolyTokenId)
}

export function monopolyTokenById(tokenId: string | null | undefined) {
  return MONOPOLY_PLAYER_TOKENS.find((t) => t.id === tokenId)
}

export function monopolyTokenEmoji(tokenId: string | null | undefined, fallbackOrder = 0): string {
  const found = monopolyTokenById(tokenId)
  if (found) return found.emoji
  return MONOPOLY_PLAYER_TOKENS[fallbackOrder % MONOPOLY_PLAYER_TOKENS.length]!.emoji
}

export function takenMonopolyTokens(players: { monopoly_token?: string | null; spectator?: boolean }[]): Set<string> {
  const taken = new Set<string>()
  for (const player of players) {
    if (player.spectator || !player.monopoly_token) continue
    taken.add(player.monopoly_token)
  }
  return taken
}

/** Map of token id → player name for tokens already claimed in the lobby. */
export function monopolyTokenOwners(
  players: { name: string; monopoly_token?: string | null; spectator?: boolean }[]
): Map<string, string> {
  const owners = new Map<string, string>()
  for (const player of players) {
    if (player.spectator || !player.monopoly_token) continue
    owners.set(player.monopoly_token, player.name)
  }
  return owners
}

export function firstAvailableMonopolyToken(
  players: { monopoly_token?: string | null; spectator?: boolean }[]
): MonopolyTokenId | null {
  const taken = takenMonopolyTokens(players)
  const free = MONOPOLY_PLAYER_TOKENS.find((t) => !taken.has(t.id))
  return free?.id ?? null
}
