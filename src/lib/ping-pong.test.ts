import { describe, it, expect, vi } from 'vitest'
import {
  initializePingPongGame,
  processPingPongPoint,
  removePingPongPlayer,
  canPingPongPlayAgain,
  isPingPongResultsPhase,
  pingPongServingSide,
  PING_PONG_MIN_PLAYERS,
} from './ping-pong'
import type { SupabaseClient } from '@supabase/supabase-js'

function createMockSupabase(initialStorage?: {
  games?: Record<string, any>
  players?: any[]
  ping_pong_sessions?: Record<string, any>
}) {
  const games = { ...initialStorage?.games }
  const players = [...(initialStorage?.players ?? [])]
  const sessions = { ...initialStorage?.ping_pong_sessions }

  const makeQueryBuilder = (tableName: string) => {
    const filters: Record<string, any> = {}
    const builder: any = {
      select: vi.fn().mockImplementation(() => builder),
      order: vi.fn().mockImplementation(() => builder),
      eq: vi.fn().mockImplementation((col: string, val: any) => {
        filters[col] = val
        return builder
      }),
      maybeSingle: vi.fn().mockImplementation(async () => {
        if (tableName === 'games') {
          const row = games[filters.id]
          return { data: row || null, error: null }
        }
        if (tableName === 'ping_pong_sessions') {
          const row = sessions[filters.game_id]
          if (!row) return { data: null, error: null }
          if (filters.updated_at && row.updated_at !== filters.updated_at) {
            return { data: null, error: null }
          }
          return { data: row, error: null }
        }
        return { data: null, error: null }
      }),
      insert: vi.fn().mockImplementation(async (row: any) => {
        if (tableName === 'ping_pong_sessions') {
          sessions[row.game_id] = { id: 'sess_1', ...row }
        }
        return { data: [row], error: null }
      }),
      update: vi.fn().mockImplementation((patch: any) => {
        const updateBuilder: any = {
          eq: vi.fn().mockImplementation((col: string, val: any) => {
            filters[col] = val
            return updateBuilder
          }),
          select: vi.fn().mockImplementation(() => updateBuilder),
          then: (resolve: any) => {
            if (tableName === 'ping_pong_sessions') {
              const row = sessions[filters.game_id || filters.id]
              if (row) {
                if (filters.updated_at && row.updated_at !== filters.updated_at) {
                  resolve({ data: [], error: null })
                  return
                }
                Object.assign(row, patch, { updated_at: '2026-07-17T12:01:00.000Z' })
                resolve({ data: [row], error: null })
                return
              }
            }
            if (tableName === 'games') {
              const row = games[filters.id]
              if (row) Object.assign(row, patch)
              resolve({ data: row ? [row] : [], error: null })
              return
            }
            resolve({ data: [], error: null })
          },
        }
        return updateBuilder
      }),
      delete: vi.fn().mockImplementation(() => {
        return {
          eq: vi.fn().mockImplementation((col1: string, val1: any) => {
            return {
              eq: vi.fn().mockImplementation(async (col2: string, val2: any) => {
                const idx = players.findIndex((p) => p.id === val1 && p.game_id === val2)
                if (idx !== -1) players.splice(idx, 1)
                return { error: null }
              }),
            }
          }),
        }
      }),
      then: (resolve: any) => {
        if (tableName === 'players') {
          const matching = players.filter((p) => {
            return Object.entries(filters).every(([k, v]) => p[k] === v)
          })
          resolve({ data: matching, error: null })
        } else {
          resolve({ data: null, error: null })
        }
      },
    }
    return builder
  }

  const supabase = {
    from: vi.fn().mockImplementation((table: string) => makeQueryBuilder(table)),
  } as unknown as SupabaseClient

  return { supabase, sessions, games, players }
}

describe('Ping Pong functional requirements', () => {
  describe('initializePingPongGame', () => {
    it('rejects starting if not exactly 2 players are provided', async () => {
      const { supabase } = createMockSupabase()
      const res = await initializePingPongGame(supabase, 'game_1', ['p1'])
      expect(res.error).toBe(`Need exactly ${PING_PONG_MIN_PLAYERS} players to start`)
    })

    it('initializes a fresh game with 0-0 score and uses lobby points_to_win setting', async () => {
      const { supabase, sessions } = createMockSupabase({
        games: { game_1: { id: 'game_1', ping_pong_points_to_win: 11 } },
        players: [
          { id: 'p1', name: 'Alice', game_id: 'game_1' },
          { id: 'p2', name: 'Bob', game_id: 'game_1' },
        ],
      })

      const res = await initializePingPongGame(supabase, 'game_1', ['p1', 'p2'])
      expect(res.error).toBeUndefined()

      const sess = sessions['game_1']
      expect(sess).toBeDefined()
      expect([sess.player_x_id, sess.player_o_id].sort()).toEqual(['p1', 'p2'])
      expect(sess.score_x).toBe(0)
      expect(sess.score_o).toBe(0)
      expect(sess.points_to_win).toBe(11)
      expect(sess.status).toBe('active')
    })
  })

  describe('processPingPongPoint & win-by-2 rules', () => {
    it('increments score when a point is scored', async () => {
      const { supabase, sessions } = createMockSupabase({
        games: { game_1: { id: 'game_1', ping_pong_points_to_win: 7 } },
        players: [
          { id: 'p1', name: 'Alice', game_id: 'game_1' },
          { id: 'p2', name: 'Bob', game_id: 'game_1' },
        ],
        ping_pong_sessions: {
          game_1: {
            id: 'sess_1',
            game_id: 'game_1',
            player_x_id: 'p1',
            player_o_id: 'p2',
            score_x: 3,
            score_o: 2,
            points_to_win: 7,
            status: 'active',
            updated_at: '2026-07-17T12:00:00.000Z',
          },
        },
      })

      const res = await processPingPongPoint(supabase, 'game_1', 'p1', 'X')
      expect(res.error).toBeUndefined()
      expect(sessions['game_1'].score_x).toBe(4)
      expect(sessions['game_1'].score_o).toBe(2)
      expect(sessions['game_1'].status).toBe('active')
    })

    it('requires a 2 point lead to win when reaching points_to_win', async () => {
      const { supabase, sessions } = createMockSupabase({
        games: { game_1: { id: 'game_1', ping_pong_points_to_win: 7 } },
        players: [
          { id: 'p1', name: 'Alice', game_id: 'game_1' },
          { id: 'p2', name: 'Bob', game_id: 'game_1' },
        ],
        ping_pong_sessions: {
          game_1: {
            id: 'sess_1',
            game_id: 'game_1',
            player_x_id: 'p1',
            player_o_id: 'p2',
            score_x: 6,
            score_o: 6, // deuce scenario
            points_to_win: 7,
            status: 'active',
            updated_at: '2026-07-17T12:00:00.000Z',
          },
        },
      })

      // Player X scores to make it 7-6. Even though points_to_win is 7, no 2-point lead!
      await processPingPongPoint(supabase, 'game_1', 'p1', 'X')
      expect(sessions['game_1'].score_x).toBe(7)
      expect(sessions['game_1'].score_o).toBe(6)
      expect(sessions['game_1'].status).toBe('active')
      expect(sessions['game_1'].winner_player_id).toBeNull()

      // Player X scores again to make it 8-6 (2 point lead). Now they win!
      await processPingPongPoint(supabase, 'game_1', 'p1', 'X')
      expect(sessions['game_1'].score_x).toBe(8)
      expect(sessions['game_1'].score_o).toBe(6)
      expect(sessions['game_1'].status).toBe('finished')
      expect(sessions['game_1'].winner_player_id).toBe('p1')
    })
  })

  describe('removePingPongPlayer (forfeit rule)', () => {
    it('awards opponent forfeit victory when an active player leaves', async () => {
      const { supabase, sessions, players } = createMockSupabase({
        games: { game_1: { id: 'game_1', status: 'active' } },
        players: [
          { id: 'p1', name: 'Alice', game_id: 'game_1' },
          { id: 'p2', name: 'Bob', game_id: 'game_1' },
        ],
        ping_pong_sessions: {
          game_1: {
            id: 'sess_1',
            game_id: 'game_1',
            player_x_id: 'p1',
            player_o_id: 'p2',
            score_x: 2,
            score_o: 4,
            points_to_win: 7,
            status: 'active',
            updated_at: '2026-07-17T12:00:00.000Z',
          },
        },
      })

      const res = await removePingPongPlayer(supabase, 'game_1', 'p1', 'Alice')
      expect(res.error).toBeNull()
      expect(sessions['game_1'].status).toBe('finished')
      expect(sessions['game_1'].winner_player_id).toBe('p2')
      expect(sessions['game_1'].status_message).toContain('Alice left')
      expect(players.length).toBe(1)
      expect(players[0].id).toBe('p2')
    })
  })

  describe('canPingPongPlayAgain & isPingPongResultsPhase', () => {
    it('can play again if status is waiting/finished or session finished', async () => {
      const { supabase } = createMockSupabase({
        ping_pong_sessions: { game_1: { status: 'finished' } },
      })
      expect(await canPingPongPlayAgain(supabase, 'game_1', 'waiting')).toBe(true)
      expect(await canPingPongPlayAgain(supabase, 'game_1', 'finished')).toBe(true)
      expect(await canPingPongPlayAgain(supabase, 'game_1', 'active')).toBe(true)
    })

    it('identifies results phase when session is finished or winner exists', () => {
      expect(isPingPongResultsPhase('active', { status: 'finished', winner_player_id: null })).toBe(true)
      expect(isPingPongResultsPhase('active', { status: 'active', winner_player_id: 'p1' })).toBe(true)
      expect(isPingPongResultsPhase('active', { status: 'active', winner_player_id: null })).toBe(false)
    })
  })

  describe('pingPongServingSide', () => {
    it('uses 2-point rotation before deuce', () => {
      expect(pingPongServingSide(0, 0, 11)).toBe('X')
      expect(pingPongServingSide(1, 0, 11)).toBe('X')
      expect(pingPongServingSide(1, 1, 11)).toBe('O')
      expect(pingPongServingSide(2, 1, 11)).toBe('O')
      expect(pingPongServingSide(2, 2, 11)).toBe('X')
    })

    it('alternates every single point once deuce is reached', () => {
      // For 11 points to win, deuce is reached at 10-10
      expect(pingPongServingSide(10, 10, 11)).toBe('X')
      expect(pingPongServingSide(11, 10, 11)).toBe('O')
      expect(pingPongServingSide(11, 11, 11)).toBe('X')
      expect(pingPongServingSide(12, 11, 11)).toBe('O')
    })
  })
})
