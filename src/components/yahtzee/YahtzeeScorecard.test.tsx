// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { YahtzeeScorecard } from './YahtzeeScorecard'
import { emptyCategoryPoints } from '@/lib/yahtzee'
import type { YahtzeePlayerScore } from '@/types'

const players = [
  { id: 'p1', name: 'Ana' },
  { id: 'p2', name: 'Ben' },
]

const row = (playerId: string, scores: unknown, order: number) =>
  ({
    id: `row-${playerId}`,
    game_id: 'ABCD',
    player_id: playerId,
    scores,
    player_order: order,
  }) as unknown as YahtzeePlayerScore

describe('YahtzeeScorecard problem notice', () => {
  it('stays quiet when every card has categories', () => {
    const scores = [
      row('p1', { categories: emptyCategoryPoints() }, 0),
      row('p2', { categories: emptyCategoryPoints() }, 1),
    ]
    render(<YahtzeeScorecard players={players} scores={scores} activePlayerId="p1" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it("explains a stalled turn when the active player's row has no categories", () => {
    const scores = [row('p1', {}, 0), row('p2', { categories: emptyCategoryPoints() }, 1)]
    render(<YahtzeeScorecard players={players} scores={scores} activePlayerId="p1" />)
    expect(screen.getByRole('alert').textContent).toContain("Ana's scorecard data is missing")
  })

  it('does not warn about a non-active player without data', () => {
    const scores = [row('p1', { categories: emptyCategoryPoints() }, 0), row('p2', {}, 1)]
    render(<YahtzeeScorecard players={players} scores={scores} activePlayerId="p1" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the timer error when the card itself is fine', () => {
    const scores = [
      row('p1', { categories: emptyCategoryPoints() }, 0),
      row('p2', { categories: emptyCategoryPoints() }, 1),
    ]
    render(
      <YahtzeeScorecard players={players} scores={scores} activePlayerId="p1" timerError="Player scores not found" />
    )
    expect(screen.getByRole('alert').textContent).toContain('Player scores not found')
  })
})
