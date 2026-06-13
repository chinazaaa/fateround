export const gameKeys = {
  all: ['games'] as const,
  detail: (code: string) => ['games', code] as const,
  participants: (code: string) => ['games', code, 'participants'] as const,
  players: (code: string) => ['games', code, 'players'] as const,
  rounds: {
    all: (code: string) => ['games', code, 'rounds'] as const,
    active: (code: string) => ['games', code, 'rounds', 'active'] as const,
    finished: (code: string) => ['games', code, 'rounds', 'finished'] as const,
    detail: (code: string, roundId: string) => ['games', code, 'rounds', roundId] as const,
  },
  votes: {
    all: (code: string) => ['games', code, 'votes'] as const,
    byRound: (code: string, roundId: string) => ['games', code, 'votes', roundId] as const,
    myVote: (code: string, roundId: string, playerId: string) => ['games', code, 'votes', roundId, playerId] as const,
  },
  confessions: {
    all: (code: string) => ['games', code, 'confessions'] as const,
    byRound: (code: string, roundId: string) => ['games', code, 'confessions', roundId] as const,
  },
  wstPool: (code: string) => ['games', code, 'wst-pool'] as const,
  animePool: (code: string) => ['games', code, 'anime-pool'] as const,
  hotSeat: (code: string, roundId: string) => ['games', code, 'hot-seat', roundId] as const,
  playerQuestions: (code: string) => ['games', code, 'player-questions'] as const,
  allResults: (code: string) => ['games', code, 'all-results'] as const,
  snapshots: (code: string) => ['games', code, 'snapshots'] as const,
}
