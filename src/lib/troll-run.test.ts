import { describe, it, expect } from 'vitest'
import { calculateTrollRunScore, buildTrollRunStandings } from './troll-run'
import type { TrollRunPlayerState } from '@/types'

describe('Troll Run Server Logic', () => {
  describe('calculateTrollRunScore', () => {
    it('awards 1st place points with speed bonus and 0 deaths', () => {
      const score = calculateTrollRunScore(1, 10, 0, 35000, 50)
      // 500 (1st) + 50 (speed bonus < 50s) - 0 = 550
      expect(score).toBe(550)
    })

    it('deducts death penalty from placement points', () => {
      const score = calculateTrollRunScore(1, 10, 4, 35000, 50)
      // 500 (1st) + 50 (speed bonus) - 20 (4 deaths * 5) = 530
      expect(score).toBe(530)
    })

    it('awards 2nd and 3rd place scores correctly without speed bonus', () => {
      const score2 = calculateTrollRunScore(2, 10, 2, 65000, 50)
      // 350 (2nd) + 0 - 10 = 340
      expect(score2).toBe(340)

      const score3 = calculateTrollRunScore(3, 10, 1, 70000, 50)
      // 250 (3rd) + 0 - 5 = 245
      expect(score3).toBe(245)
    })

    it('calculates DNF score based on cleared levels and death penalty', () => {
      const dnfScore = calculateTrollRunScore(null, 4, 3, 120000)
      // 4 levels * 20 = 80 - 15 (3 deaths * 5) = 65
      expect(dnfScore).toBe(65)
    })

    it('clamps DNF score to 0 when deaths exceed cleared points', () => {
      const dnfScore = calculateTrollRunScore(null, 1, 10, 120000)
      // 1 * 20 - 50 = -30 -> clamped to 0
      expect(dnfScore).toBe(0)
    })
  })

  describe('buildTrollRunStandings', () => {
    it('sorts players by total score descending, then deaths, then time', () => {
      const states: TrollRunPlayerState[] = [
        {
          id: '1',
          game_id: 'GAME1',
          player_id: 'p1',
          current_round: 1,
          current_level_index: 10,
          deaths: 5,
          levels_cleared: 10,
          total_time_ms: 45000,
          round_score: 300,
          total_score: 300,
          finish_position: 2,
          round_finished: true,
          created_at: '',
          updated_at: '',
        },
        {
          id: '2',
          game_id: 'GAME1',
          player_id: 'p2',
          current_round: 1,
          current_level_index: 10,
          deaths: 1,
          levels_cleared: 10,
          total_time_ms: 32000,
          round_score: 545,
          total_score: 545,
          finish_position: 1,
          round_finished: true,
          created_at: '',
          updated_at: '',
        },
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
})
