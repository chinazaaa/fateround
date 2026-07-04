export type PollHostMode = 'spectator' | 'player'

const pollHostModeKey = (gameCode: string) => `poll_host_mode_${gameCode}`

export function getPollHostMode(gameCode: string): PollHostMode {
  if (typeof window === 'undefined') return 'player'
  return localStorage.getItem(pollHostModeKey(gameCode)) === 'spectator' ? 'spectator' : 'player'
}

export function setPollHostMode(gameCode: string, mode: PollHostMode): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(pollHostModeKey(gameCode), mode)
}
