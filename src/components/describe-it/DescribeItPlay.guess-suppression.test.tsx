// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DescribeItPlayPanel } from './DescribeItPlay'
import { describeItTurnKey } from '@/lib/describe-it'
import type { DescribeItSession, Player } from '@/types'

const ME = 'player-me'

function session(over: Partial<DescribeItSession> = {}): DescribeItSession {
  return {
    id: 'session-1',
    game_id: 'ABCD',
    mode: 'individual',
    turn_index: 0,
    current_round: 1,
    total_rounds: 3,
    num_teams: 1,
    active_team: 1,
    describer_player_id: 'player-other',
    phase: 'turn',
    roster: [ME, 'player-other'],
    current_clues: ['a clue'],
    ...(over as object),
  } as DescribeItSession
}

const base = {
  players: [
    { id: ME, name: 'Me' },
    { id: 'player-other', name: 'Other' },
  ] as unknown as Player[],
  teamRows: [
    { player_id: ME, team: 1, score: 0 },
    { player_id: 'player-other', team: 1, score: 0 },
  ],
  words: [],
  guesses: [],
  myPlayerId: ME,
  secondsLeft: 30,
  breakLeft: 0,
  urgent: false,
  onGuess: () => {},
}

afterEach(cleanup)

describe('optimistic guess suppression', () => {
  it('suppresses the input for the turn the key was captured on', () => {
    const s = session()
    render(<DescribeItPlayPanel {...base} session={s} justGuessedTurnKey={describeItTurnKey(s)} />)
    expect(screen.getByText(/You got it/i)).toBeTruthy()
    expect(screen.queryByPlaceholderText('Type your guess…')).toBeNull()
  })

  it('does not suppress a later turn in the same session', () => {
    const captured = describeItTurnKey(session({ turn_index: 0 }))
    render(<DescribeItPlayPanel {...base} session={session({ turn_index: 1 })} justGuessedTurnKey={captured} />)
    expect(screen.queryByText(/You got it/i)).toBeNull()
    expect(screen.getByPlaceholderText('Type your guess…')).toBeTruthy()
  })

  it('does not suppress turn 0 of a rematch, which reuses turn_index 0', () => {
    // The bug this guards: a bare turn index matched across sessions, so a player who
    // scored on turn 0 was locked out of turn 0 of the next match entirely.
    const captured = describeItTurnKey(session({ id: 'session-1', turn_index: 0 }))
    render(
      <DescribeItPlayPanel
        {...base}
        session={session({ id: 'session-2', turn_index: 0 })}
        justGuessedTurnKey={captured}
      />
    )
    expect(screen.queryByText(/You got it/i)).toBeNull()
    expect(screen.getByPlaceholderText('Type your guess…')).toBeTruthy()
  })
})
