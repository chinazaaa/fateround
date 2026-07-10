import { describe, expect, it } from 'vitest'
import {
  battleVoteOptions,
  canPlayerVoteInBattle,
  canPlayerVoteInRound,
  countVotesForBattle,
  countVotesForRound,
  effectiveQuiplashVoteTimer,
  eligibleRoundVoters,
  eligibleVotersForBattle,
  isNoVoterDrawBattle,
  isSoloRoundBattle,
  maxBattlesPerRound,
  partitionBattles,
  quiplashPairCount,
  quiplashRoundVotingHint,
  roundAnswersVisibleToPlayer,
  roundVoteOptions,
  soloRoundPoints,
  tallyQuiplashScores,
  tallyQuiplashScoresFromRoundVotes,
} from '@/lib/quiplash'
import type { Player, QuiplashAnswer, QuiplashBattle, QuiplashVote } from '@/types'

describe('partitionBattles', () => {
  it('creates every unique pair for three answers', () => {
    const ids = ['a', 'b', 'c']
    const { pairs, byeId } = partitionBattles(ids)
    expect(byeId).toBeNull()
    expect(pairs).toHaveLength(3)
    const keys = pairs.map((p) => [p.aId, p.bId].sort().join(':')).sort()
    expect(keys).toEqual(['a:b', 'a:c', 'b:c'])
  })
})

describe('countVotesForBattle', () => {
  const battle: QuiplashBattle = {
    id: 'battle-1',
    game_id: 'GAME',
    round_id: 'round-1',
    battle_number: 1,
    answer_a_id: 'ans-a',
    answer_b_id: 'ans-b',
    winner_answer_id: null,
    points_awarded: 0,
    status: 'active',
    started_at: null,
    ended_at: null,
  }

  it('awards points to the answer with more votes', () => {
    const votes: QuiplashVote[] = [
      {
        id: '1',
        game_id: 'GAME',
        battle_id: 'battle-1',
        round_id: null,
        player_id: 'p1',
        chosen_answer_id: 'ans-a',
        voted_at: '',
      },
      {
        id: '2',
        game_id: 'GAME',
        battle_id: 'battle-1',
        round_id: null,
        player_id: 'p2',
        chosen_answer_id: 'ans-a',
        voted_at: '',
      },
      {
        id: '3',
        game_id: 'GAME',
        battle_id: 'battle-1',
        round_id: null,
        player_id: 'p3',
        chosen_answer_id: 'ans-b',
        voted_at: '',
      },
    ]
    const result = countVotesForBattle(battle, votes)
    expect(result.winnerId).toBe('ans-a')
    expect(result.points).toBe(2)
  })
})

describe('round voting', () => {
  const roundId = 'round-1'
  const roundAnswers: QuiplashAnswer[] = [
    { id: 'ans-a', game_id: 'GAME', round_id: roundId, player_id: 'p1', text: 'a', is_bye: false, submitted_at: '' },
    { id: 'ans-b', game_id: 'GAME', round_id: roundId, player_id: 'p2', text: 'b', is_bye: false, submitted_at: '' },
    { id: 'ans-c', game_id: 'GAME', round_id: roundId, player_id: 'p3', text: 'c', is_bye: false, submitted_at: '' },
  ]

  it('shows other players answers as vote options', () => {
    const options = roundVoteOptions(roundAnswers, 'p1')
    expect(options).toHaveLength(2)
    expect(options.every((a) => a.player_id !== 'p1')).toBe(true)
  })

  it('blocks voting for your own answer', () => {
    expect(canPlayerVoteInRound(roundAnswers, 'p1')).toBe(true)
    expect(canPlayerVoteInRound([roundAnswers[0]!], 'p1')).toBe(false)
  })

  it('counts votes per answer in a round', () => {
    const votes: QuiplashVote[] = [
      {
        id: '1',
        game_id: 'GAME',
        battle_id: null,
        round_id: roundId,
        player_id: 'p1',
        chosen_answer_id: 'ans-b',
        voted_at: '',
      },
      {
        id: '2',
        game_id: 'GAME',
        battle_id: null,
        round_id: roundId,
        player_id: 'p2',
        chosen_answer_id: 'ans-c',
        voted_at: '',
      },
      {
        id: '3',
        game_id: 'GAME',
        battle_id: null,
        round_id: roundId,
        player_id: 'p3',
        chosen_answer_id: 'ans-b',
        voted_at: '',
      },
    ]
    const tally = countVotesForRound(roundId, votes)
    expect(tally.find((row) => row.answerId === 'ans-b')?.votes).toBe(2)
    expect(tally.find((row) => row.answerId === 'ans-c')?.votes).toBe(1)
  })

  it('expects every player to vote when multiple answers exist', () => {
    expect(eligibleRoundVoters(roundAnswers, 3)).toBe(3)
    expect(eligibleRoundVoters([roundAnswers[0]!], 3)).toBe(2)
  })

  it('explains round voting in plain language', () => {
    expect(
      quiplashRoundVotingHint({ canVote: true, hasVoted: false, cannotParticipate: false, answerCount: 3 })
    ).toMatch(/funniest/)
  })
})

describe('tallyQuiplashScoresFromRoundVotes', () => {
  const players: Player[] = [
    {
      id: 'p1',
      game_id: 'GAME',
      name: 'A',
      gender: 'both',
      identity_gender: null,
      participant_id: null,
      joined_at: '',
      spectator: false,
      is_eliminated: false,
    },
    {
      id: 'p2',
      game_id: 'GAME',
      name: 'B',
      gender: 'both',
      identity_gender: null,
      participant_id: null,
      joined_at: '',
      spectator: false,
      is_eliminated: false,
    },
    {
      id: 'p3',
      game_id: 'GAME',
      name: 'C',
      gender: 'both',
      identity_gender: null,
      participant_id: null,
      joined_at: '',
      spectator: false,
      is_eliminated: false,
    },
  ]

  const answers: QuiplashAnswer[] = [
    { id: 'ans-a', game_id: 'GAME', round_id: 'round-1', player_id: 'p1', text: 'a', is_bye: false, submitted_at: '' },
    { id: 'ans-b', game_id: 'GAME', round_id: 'round-1', player_id: 'p2', text: 'b', is_bye: false, submitted_at: '' },
  ]

  it('awards one point per vote received', () => {
    const votes: QuiplashVote[] = [
      {
        id: '1',
        game_id: 'GAME',
        battle_id: null,
        round_id: 'round-1',
        player_id: 'p1',
        chosen_answer_id: 'ans-b',
        voted_at: '',
      },
      {
        id: '2',
        game_id: 'GAME',
        battle_id: null,
        round_id: 'round-1',
        player_id: 'p3',
        chosen_answer_id: 'ans-b',
        voted_at: '',
      },
    ]
    const rows = tallyQuiplashScoresFromRoundVotes(votes, answers, players)
    expect(rows.find((r) => r.id === 'p2')?.score).toBe(2)
    expect(rows.find((r) => r.id === 'p1')?.score).toBe(0)
  })

  it('prefers round votes over legacy battles when present', () => {
    const votes: QuiplashVote[] = [
      {
        id: '1',
        game_id: 'GAME',
        battle_id: null,
        round_id: 'round-1',
        player_id: 'p3',
        chosen_answer_id: 'ans-a',
        voted_at: '',
      },
    ]
    const battles: QuiplashBattle[] = [
      {
        id: 'battle-1',
        game_id: 'GAME',
        round_id: 'round-1',
        battle_number: 1,
        answer_a_id: 'ans-a',
        answer_b_id: 'ans-b',
        winner_answer_id: 'ans-b',
        points_awarded: 5,
        status: 'finished',
        started_at: null,
        ended_at: '2026-01-01T00:00:00Z',
      },
    ]
    const rows = tallyQuiplashScores(battles, answers, players, votes)
    expect(rows.find((r) => r.id === 'p1')?.score).toBe(1)
    expect(rows.find((r) => r.id === 'p2')?.score).toBe(0)
  })
})

describe('solo and legacy battle helpers', () => {
  it('detects solo rounds and awards fallback points', () => {
    const solo: QuiplashBattle = {
      id: 'battle-solo',
      game_id: 'GAME',
      round_id: 'round-1',
      battle_number: 1,
      answer_a_id: 'ans-a',
      answer_b_id: 'ans-a',
      winner_answer_id: 'ans-a',
      points_awarded: 2,
      status: 'finished',
      started_at: null,
      ended_at: null,
    }
    expect(isSoloRoundBattle(solo)).toBe(true)
    expect(soloRoundPoints(3)).toBe(2)
  })
})

describe('battle caps and vote timer', () => {
  it('keeps full round-robin for small groups', () => {
    expect(maxBattlesPerRound(3)).toBe(3)
    expect(maxBattlesPerRound(4)).toBe(6)
    expect(quiplashPairCount(6)).toBe(15)
  })

  it('uses configured vote timer', () => {
    expect(effectiveQuiplashVoteTimer(15, 4)).toBe(15)
  })
})

describe('battleVoteOptions and roundAnswersVisibleToPlayer', () => {
  const battle: QuiplashBattle = {
    id: 'battle-1',
    game_id: 'GAME',
    round_id: 'round-1',
    battle_number: 1,
    answer_a_id: 'ans-a',
    answer_b_id: 'ans-b',
    winner_answer_id: null,
    points_awarded: 0,
    status: 'active',
    started_at: null,
    ended_at: null,
  }
  const roundAnswers: QuiplashAnswer[] = [
    { id: 'ans-a', game_id: 'GAME', round_id: 'round-1', player_id: 'p1', text: 'a', is_bye: false, submitted_at: '' },
    { id: 'ans-b', game_id: 'GAME', round_id: 'round-1', player_id: 'p2', text: 'b', is_bye: false, submitted_at: '' },
    { id: 'ans-c', game_id: 'GAME', round_id: 'round-1', player_id: 'p3', text: 'c', is_bye: false, submitted_at: '' },
  ]

  it('returns both battle answers for legacy battles', () => {
    expect(battleVoteOptions(battle, roundAnswers)).toHaveLength(2)
  })

  it('shows every other submitter to a player and everyone to spectators', () => {
    expect(roundAnswersVisibleToPlayer(roundAnswers, { playerId: 'p1' })).toHaveLength(2)
    expect(roundAnswersVisibleToPlayer(roundAnswers, { playerId: 'p1', spectator: true })).toHaveLength(3)
  })
})
