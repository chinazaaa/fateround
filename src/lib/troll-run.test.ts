import { describe, it, expect } from 'vitest'
import {
  buildTrollRunChampionshipStandings,
  buildTrollRunRoundScores,
  buildTrollRunStandings,
  calculateTrollRunDnfScore,
  calculateTrollRunFinishScore,
  selectTrollRunRoundStates,
  trollRunElapsedMs,
} from './troll-run'
import type { TrollRunPlayerState } from '@/types'

function playerState(overrides: Partial<TrollRunPlayerState> & { id: string; player_id: string }): TrollRunPlayerState {
  return {
    game_id: 'GAME1',
    current_round: 1,
    current_level_index: 10,
    deaths: 0,
    levels_cleared: 10,
    total_time_ms: 40000,
    round_score: 0,
    total_score: 0,
    finish_position: null,
    round_finished: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('Troll Run Server Logic', () => {
  describe('calculateTrollRunFinishScore', () => {
    it('awards 1st place points with speed bonus and 0 deaths', () => {
      // 500 (1st) + 50 (inside the 50s par) - 0
      expect(calculateTrollRunFinishScore(1, 0, 35000, 50)).toBe(550)
    })

    it('deducts death penalty from placement points', () => {
      // 500 + 50 - 20 (4 deaths * 5)
      expect(calculateTrollRunFinishScore(1, 4, 35000, 50)).toBe(530)
    })

    it('awards 2nd and 3rd place scores correctly without speed bonus', () => {
      expect(calculateTrollRunFinishScore(2, 2, 65000, 50)).toBe(340) // 350 - 10
      expect(calculateTrollRunFinishScore(3, 1, 70000, 50)).toBe(245) // 250 - 5
    })

    it('never drops below the floor no matter how many deaths', () => {
      expect(calculateTrollRunFinishScore(6, 200, 300000, 50)).toBe(10)
    })

    it('gives no speed bonus when the round has no par time', () => {
      expect(calculateTrollRunFinishScore(1, 0, 1000, 0)).toBe(500)
    })

    it('treats placements past the points table as last place', () => {
      expect(calculateTrollRunFinishScore(99, 0, 300000, 50)).toBe(100)
    })
  })

  describe('calculateTrollRunDnfScore', () => {
    it('scores cleared levels and subtracts the death penalty', () => {
      // 4 levels * 10 = 40 - 15 (3 deaths * 5)
      expect(calculateTrollRunDnfScore(4, 3)).toBe(25)
    })

    it('clamps to 0 when deaths exceed cleared points', () => {
      expect(calculateTrollRunDnfScore(1, 10)).toBe(0)
    })

    it('caps below the last-place finish award so a DNF can never beat a finisher', () => {
      const dnf = calculateTrollRunDnfScore(10, 0)
      expect(dnf).toBe(90)
      expect(dnf).toBeLessThan(calculateTrollRunFinishScore(6, 0, 300000, 50))
    })
  })

  describe('buildTrollRunRoundScores', () => {
    it('ranks finishers by elapsed time regardless of row order', () => {
      const scores = buildTrollRunRoundScores(
        [
          playerState({ id: 'slow', player_id: 'p1', total_time_ms: 70000 }),
          playerState({ id: 'fast', player_id: 'p2', total_time_ms: 35000 }),
        ],
        50
      )

      const fast = scores.find((score) => score.stateId === 'fast')
      const slow = scores.find((score) => score.stateId === 'slow')
      expect(fast?.finishPosition).toBe(1)
      expect(slow?.finishPosition).toBe(2)
      expect(fast?.roundScore).toBe(550) // 500 + speed bonus
      expect(slow?.roundScore).toBe(350)
    })

    it('breaks a time tie on fewer deaths', () => {
      const scores = buildTrollRunRoundScores(
        [
          playerState({ id: 'sloppy', player_id: 'p1', total_time_ms: 60000, deaths: 6 }),
          playerState({ id: 'clean', player_id: 'p2', total_time_ms: 60000, deaths: 1 }),
        ],
        50
      )

      expect(scores.find((score) => score.stateId === 'clean')?.finishPosition).toBe(1)
      expect(scores.find((score) => score.stateId === 'sloppy')?.finishPosition).toBe(2)
    })

    it('gives everyone still running a DNF score with no placement', () => {
      const scores = buildTrollRunRoundScores(
        [
          playerState({ id: 'home', player_id: 'p1', total_time_ms: 35000 }),
          playerState({
            id: 'stranded',
            player_id: 'p2',
            round_finished: false,
            current_level_index: 4,
            levels_cleared: 4,
            deaths: 3,
          }),
        ],
        50
      )

      const stranded = scores.find((score) => score.stateId === 'stranded')
      expect(stranded?.finishPosition).toBeNull()
      expect(stranded?.roundScore).toBe(25)
    })

    it('adds the round score onto the running total it was given', () => {
      const scores = buildTrollRunRoundScores(
        [playerState({ id: 'only', player_id: 'p1', total_time_ms: 35000, total_score: 1200 })],
        50
      )

      expect(scores[0].roundScore).toBe(550)
      expect(scores[0].totalScore).toBe(1750)
    })

    it('scores every row exactly once', () => {
      const scores = buildTrollRunRoundScores(
        [
          playerState({ id: 'one', player_id: 'p1', total_time_ms: 35000 }),
          playerState({ id: 'two', player_id: 'p2', total_time_ms: 45000 }),
          playerState({ id: 'three', player_id: 'p3', round_finished: false, levels_cleared: 2 }),
        ],
        50
      )

      expect(scores).toHaveLength(3)
      expect(new Set(scores.map((score) => score.stateId)).size).toBe(3)
    })
  })

  describe('trollRunElapsedMs', () => {
    it('is 0 before the round clock has started', () => {
      expect(trollRunElapsedMs({ round_started_at: null, round_time_limit: 120 })).toBe(0)
    })

    it('caps at the round time limit', () => {
      const longAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      expect(trollRunElapsedMs({ round_started_at: longAgo, round_time_limit: 120 })).toBe(120000)
    })

    it('measures forward from the round start', () => {
      const startedAt = new Date(Date.now() - 5000).toISOString()
      const elapsed = trollRunElapsedMs({ round_started_at: startedAt, round_time_limit: 120 })
      expect(elapsed).toBeGreaterThanOrEqual(5000)
      expect(elapsed).toBeLessThan(7000)
    })
  })

  describe('selectTrollRunRoundStates', () => {
    it('keeps only the rows for the round being shown', () => {
      const states = [
        playerState({ id: 'r1', player_id: 'p1', current_round: 1 }),
        playerState({ id: 'r2', player_id: 'p1', current_round: 2 }),
      ]

      expect(selectTrollRunRoundStates(states, 2).map((state) => state.id)).toEqual(['r2'])
      expect(selectTrollRunRoundStates(states, undefined)).toHaveLength(2)
    })
  })

  describe('buildTrollRunStandings', () => {
    it('sorts players by total score descending, then deaths, then time', () => {
      const states = [
        playerState({
          id: '1',
          player_id: 'p1',
          deaths: 5,
          total_time_ms: 45000,
          round_score: 300,
          total_score: 300,
          finish_position: 2,
        }),
        playerState({
          id: '2',
          player_id: 'p2',
          deaths: 1,
          total_time_ms: 32000,
          round_score: 545,
          total_score: 545,
          finish_position: 1,
        }),
      ]

      const names = new Map([
        ['p1', 'Alice'],
        ['p2', 'Bob'],
      ])

      const standings = buildTrollRunStandings(states, names)
      expect(standings[0].playerId).toBe('p2')
      expect(standings[0].name).toBe('Bob')
      expect(standings[0].rank).toBe(1)
      expect(standings[1].playerId).toBe('p1')
      expect(standings[1].name).toBe('Alice')
      expect(standings[1].rank).toBe(2)
    })
  })

  describe('buildTrollRunChampionshipStandings', () => {
    it('aggregates deaths, cleared levels and completed rounds across multiple rounds', () => {
      const allStates = [
        // Round 1
        playerState({
          id: 'r1-p1',
          player_id: 'p1',
          current_round: 1,
          deaths: 4,
          levels_cleared: 10,
          round_finished: true,
          round_score: 500,
          total_score: 500,
          total_time_ms: 30000,
        }),
        playerState({
          id: 'r1-p2',
          player_id: 'p2',
          current_round: 1,
          deaths: 1,
          levels_cleared: 10,
          round_finished: true,
          round_score: 350,
          total_score: 350,
          total_time_ms: 35000,
        }),
        // Round 2
        playerState({
          id: 'r2-p1',
          player_id: 'p1',
          current_round: 2,
          deaths: 2,
          levels_cleared: 10,
          round_finished: true,
          round_score: 350,
          total_score: 850,
          total_time_ms: 32000,
        }),
        playerState({
          id: 'r2-p2',
          player_id: 'p2',
          current_round: 2,
          deaths: 3,
          levels_cleared: 8,
          round_finished: false,
          round_score: 70,
          total_score: 420,
          total_time_ms: 120000,
        }),
      ]

      const names = new Map([
        ['p1', 'Alice'],
        ['p2', 'Bob'],
      ])

      const standings = buildTrollRunChampionshipStandings(allStates, names)
      expect(standings).toHaveLength(2)

      expect(standings[0].name).toBe('Alice')
      expect(standings[0].rank).toBe(1)
      expect(standings[0].totalScore).toBe(850)
      expect(standings[0].totalDeaths).toBe(6) // 4 + 2
      expect(standings[0].totalLevelsCleared).toBe(20) // 10 + 10
      expect(standings[0].roundsFinishedCount).toBe(2)

      expect(standings[1].name).toBe('Bob')
      expect(standings[1].rank).toBe(2)
      expect(standings[1].totalScore).toBe(420)
      expect(standings[1].totalDeaths).toBe(4) // 1 + 3
      expect(standings[1].totalLevelsCleared).toBe(18) // 10 + 8
      expect(standings[1].roundsFinishedCount).toBe(1)
    })
  })
})
