import { describe, it, expect } from 'vitest'
import {
  buildQuickDrawAssignmentRows,
  canPlayerSubmitFakeTitle,
  canPlayerVoteOnDrawing,
  tallyQuickDrawScores,
  validateStrokeData,
} from '@/lib/quick-draw'
import type { QuickDrawDrawing, QuickDrawTitle, QuickDrawVote, Player } from '@/types'

describe('quick-draw', () => {
  it('builds per-player assignment rows', () => {
    const rows = buildQuickDrawAssignmentRows({
      gameId: 'ABC',
      rounds: [{ id: 'r1', round_number: 1 }],
      playerIds: ['p1', 'p2'],
      prompts: [{ prompt: 'A sad potato' }, { prompt: 'Two bees' }],
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ round_id: 'r1', player_id: 'p1', prompt: 'A sad potato' })
    expect(rows[1]).toMatchObject({ player_id: 'p2', prompt: 'Two bees' })
  })

  it('validates stroke data', () => {
    const valid = validateStrokeData({
      width: 400,
      height: 300,
      strokes: [
        {
          color: '#000',
          width: 3,
          points: [
            [0, 0],
            [10, 10],
            [20, 5],
          ],
        },
      ],
    })
    expect(valid?.strokes).toHaveLength(1)

    const eraser = validateStrokeData({
      width: 400,
      height: 300,
      strokes: [
        {
          color: '#fff',
          width: 16,
          tool: 'eraser',
          points: [
            [0, 0],
            [10, 10],
          ],
        },
      ],
    })
    expect(eraser?.strokes[0]?.tool).toBe('eraser')

    expect(validateStrokeData({ strokes: [] })).toBeNull()
    expect(validateStrokeData(null)).toBeNull()
  })

  it('blocks artist from titling and voting on own drawing', () => {
    const drawing = { player_id: 'artist' } as QuickDrawDrawing
    expect(canPlayerSubmitFakeTitle(drawing, 'artist')).toBe(false)
    expect(canPlayerSubmitFakeTitle(drawing, 'other')).toBe(true)
    expect(canPlayerVoteOnDrawing(drawing, 'artist')).toBe(false)
    expect(canPlayerVoteOnDrawing(drawing, 'other')).toBe(true)
  })

  it('tallies scores for artists, fakers, and correct voters', () => {
    const players: Player[] = [
      {
        id: 'a',
        name: 'Artist',
        game_id: 'G',
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        joined_at: '',
        spectator: false,
        monopoly_token: null,
      },
      {
        id: 'f',
        name: 'Faker',
        game_id: 'G',
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        joined_at: '',
        spectator: false,
        monopoly_token: null,
      },
      {
        id: 'v',
        name: 'Voter',
        game_id: 'G',
        gender: 'both',
        identity_gender: null,
        participant_id: null,
        joined_at: '',
        spectator: false,
        monopoly_token: null,
      },
    ]
    const drawings: QuickDrawDrawing[] = [
      {
        id: 'd1',
        game_id: 'G',
        round_id: 'r1',
        player_id: 'a',
        stroke_data: { width: 1, height: 1, strokes: [] },
        submitted_at: '',
      },
    ]
    const titles: QuickDrawTitle[] = [
      { id: 't-real', game_id: 'G', drawing_id: 'd1', player_id: null, text: 'Real', is_real: true, submitted_at: '' },
      { id: 't-fake', game_id: 'G', drawing_id: 'd1', player_id: 'f', text: 'Fake', is_real: false, submitted_at: '' },
    ]
    const votes: QuickDrawVote[] = [
      { id: 'v1', game_id: 'G', drawing_id: 'd1', player_id: 'v', chosen_title_id: 't-real', voted_at: '' },
      { id: 'v2', game_id: 'G', drawing_id: 'd1', player_id: 'f', chosen_title_id: 't-fake', voted_at: '' },
    ]

    const scores = tallyQuickDrawScores(titles, votes, drawings, players)
    const byId = Object.fromEntries(scores.map((s) => [s.id, s.score]))
    expect(byId.a).toBe(1)
    expect(byId.f).toBe(1)
    expect(byId.v).toBe(1)
  })
})
