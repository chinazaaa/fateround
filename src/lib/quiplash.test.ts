import { describe, expect, it } from 'vitest'
import {
  battleVoteOptions,
  canPlayerVoteInBattle,
  countVotesForBattle,
  effectiveQuiplashVoteTimer,
  eligibleVotersForBattle,
  isNoVoterDrawBattle,
  isSoloRoundBattle,
  maxBattlesPerRound,
  partitionBattles,
  quiplashPairCount,
  roundAnswersVisibleToPlayer,
  soloRoundPoints,
  tallyQuiplashScores,
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

  it('creates every unique pair for four answers', () => {
    const ids = ['a', 'b', 'c', 'd']
    const { pairs, byeId } = partitionBattles(ids)
    expect(byeId).toBeNull()
    expect(pairs).toHaveLength(6)
    const used = pairs.flatMap((p) => [p.aId, p.bId])
    expect(new Set(used).size).toBe(4)
  })

  it('caps battles for eight answers while covering everyone', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    expect(quiplashPairCount(8)).toBe(28)
    expect(maxBattlesPerRound(8)).toBe(16)

    for (let run = 0; run < 20; run += 1) {
      const { pairs, byeId } = partitionBattles(ids)
      expect(byeId).toBeNull()
      expect(pairs.length).toBeGreaterThan(0)
      expect(pairs.length).toBeLessThanOrEqual(16)

      const keys = pairs.map((p) => [p.aId, p.bId].sort().join(':'))
      expect(new Set(keys).size).toBe(keys.length)

      const appearances = new Map<string, number>()
      for (const id of ids) appearances.set(id, 0)
      for (const pair of pairs) {
        appearances.set(pair.aId, (appearances.get(pair.aId) ?? 0) + 1)
        appearances.set(pair.bId, (appearances.get(pair.bId) ?? 0) + 1)
      }
      for (const count of appearances.values()) {
        expect(count).toBeGreaterThanOrEqual(1)
      }
    }
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
      { id: '1', game_id: 'GAME', battle_id: 'battle-1', player_id: 'p1', chosen_answer_id: 'ans-a', voted_at: '' },
      { id: '2', game_id: 'GAME', battle_id: 'battle-1', player_id: 'p2', chosen_answer_id: 'ans-a', voted_at: '' },
      { id: '3', game_id: 'GAME', battle_id: 'battle-1', player_id: 'p3', chosen_answer_id: 'ans-b', voted_at: '' },
    ]
    const result = countVotesForBattle(battle, votes)
    expect(result.winnerId).toBe('ans-a')
    expect(result.points).toBe(2)
  })

  it('returns no winner on a tie', () => {
    const votes: QuiplashVote[] = [
      { id: '1', game_id: 'GAME', battle_id: 'battle-1', player_id: 'p1', chosen_answer_id: 'ans-a', voted_at: '' },
      { id: '2', game_id: 'GAME', battle_id: 'battle-1', player_id: 'p2', chosen_answer_id: 'ans-b', voted_at: '' },
    ]
    const result = countVotesForBattle(battle, votes)
    expect(result.winnerId).toBeNull()
    expect(result.points).toBe(0)
  })
})

describe('eligibleVotersForBattle', () => {
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

  const answers: QuiplashAnswer[] = [
    { id: 'ans-a', game_id: 'GAME', round_id: 'round-1', player_id: 'p1', text: 'a', is_bye: false, submitted_at: '' },
    { id: 'ans-b', game_id: 'GAME', round_id: 'round-1', player_id: 'p2', text: 'b', is_bye: false, submitted_at: '' },
    { id: 'ans-c', game_id: 'GAME', round_id: 'round-1', player_id: 'p3', text: 'c', is_bye: false, submitted_at: '' },
  ]

  it('excludes battle contestants from the voter pool', () => {
    expect(eligibleVotersForBattle(battle, answers, 3)).toBe(1)
    expect(eligibleVotersForBattle(battle, answers, 4)).toBe(2)
  })
})

describe('tallyQuiplashScores', () => {
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

  it('adds finished battle points to the winner', () => {
    const battles: QuiplashBattle[] = [
      {
        id: 'battle-1',
        game_id: 'GAME',
        round_id: 'round-1',
        battle_number: 1,
        answer_a_id: 'ans-a',
        answer_b_id: 'ans-b',
        winner_answer_id: 'ans-b',
        points_awarded: 1,
        status: 'finished',
        started_at: null,
        ended_at: '2026-01-01T00:00:00Z',
      },
    ]
    const rows = tallyQuiplashScores(battles, answers, players)
    expect(rows.find((r) => r.id === 'p2')?.score).toBe(1)
    expect(rows.find((r) => r.id === 'p1')?.score).toBe(0)
  })
})

describe('canPlayerVoteInBattle', () => {
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
  const answers: QuiplashAnswer[] = [
    { id: 'ans-a', game_id: 'GAME', round_id: 'round-1', player_id: 'p1', text: 'a', is_bye: false, submitted_at: '' },
    { id: 'ans-b', game_id: 'GAME', round_id: 'round-1', player_id: 'p2', text: 'b', is_bye: false, submitted_at: '' },
  ]

  it('blocks spectators, read-only viewers, and battle contestants', () => {
    expect(canPlayerVoteInBattle(battle, answers, 'p3')).toBe(true)
    expect(canPlayerVoteInBattle(battle, answers, 'p1')).toBe(false)
    expect(canPlayerVoteInBattle(battle, answers, 'p3', { spectator: true })).toBe(false)
    expect(canPlayerVoteInBattle(battle, answers, 'p3', { readOnly: true })).toBe(false)
  })
})

describe('solo and no-voter battles', () => {
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
    expect(soloRoundPoints(1)).toBe(1)
  })

  it('detects no-voter draws', () => {
    const battle: QuiplashBattle = {
      id: 'battle-1',
      game_id: 'GAME',
      round_id: 'round-1',
      battle_number: 1,
      answer_a_id: 'ans-a',
      answer_b_id: 'ans-b',
      winner_answer_id: null,
      points_awarded: 0,
      status: 'finished',
      started_at: null,
      ended_at: null,
    }
    expect(isNoVoterDrawBattle(battle, [])).toBe(true)
    expect(
      isNoVoterDrawBattle(battle, [
        { id: 'v1', game_id: 'GAME', battle_id: 'battle-1', player_id: 'p3', chosen_answer_id: 'ans-a', voted_at: '' },
      ])
    ).toBe(false)
  })
})

describe('battle caps and vote timer', () => {
  it('keeps full round-robin for small groups', () => {
    expect(maxBattlesPerRound(3)).toBe(3)
    expect(maxBattlesPerRound(4)).toBe(6)
    expect(maxBattlesPerRound(5)).toBe(10)
  })

  it('shortens vote timer for larger lobbies', () => {
    expect(effectiveQuiplashVoteTimer(15, 4)).toBe(15)
    expect(effectiveQuiplashVoteTimer(15, 6)).toBe(12)
    expect(effectiveQuiplashVoteTimer(15, 8)).toBe(10)
    expect(effectiveQuiplashVoteTimer(20, 8)).toBe(10)
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

  it('returns both battle answers for voters', () => {
    expect(battleVoteOptions(battle, roundAnswers)).toHaveLength(2)
  })

  it('shows every other submitter to a player and everyone to spectators', () => {
    expect(roundAnswersVisibleToPlayer(roundAnswers, { playerId: 'p1' })).toHaveLength(2)
    expect(roundAnswersVisibleToPlayer(roundAnswers, { playerId: 'p1', spectator: true })).toHaveLength(3)
  })
})
