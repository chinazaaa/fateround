import { describe, it, expect } from 'vitest'
import { isValidWordRushWord, pickRandomLetterPair, countWordsForPair } from '@/lib/word-rush-dictionary'
import {
  clampWordRushMode,
  clampWordRushPromptMode,
  computeWordRushTeamScores,
  normalizeWordRushWord,
  promptSetterForIndividualRound,
  teamForTurnIndex,
  wordMatchesLetters,
  wordRushLobbyReady,
  rebalanceWordRushTeams,
  shuffleWordRushTeams,
  wordRushIndividualGuessPoints,
  wordRushIndividualGuessPointsAt,
  allWordRushIndividualPlayersSubmitted,
  wordRushIndividualAnswerers,
  isWordRushResultsPhase,
  WORD_RUSH_INDIVIDUAL_BASE_POINTS,
  WORD_RUSH_INDIVIDUAL_SPEED_BONUS,
} from '@/lib/word-rush'

describe('word-rush-dictionary', () => {
  it('validates dictionary words with letter constraints', () => {
    expect(isValidWordRushWord('monkey', 'm', 'y')).toBe(true)
    expect(isValidWordRushWord('boat', 'b', 't')).toBe(true)
    expect(isValidWordRushWord('monkey', 'b', 't')).toBe(false)
    expect(isValidWordRushWord('notaword', 'n', 'd')).toBe(false)
  })

  it('normalizes input', () => {
    expect(normalizeWordRushWord('  Monkey! ')).toBe('monkey')
  })

  it('matches letters', () => {
    expect(wordMatchesLetters('rabbit', 'r', 't')).toBe(true)
    expect(wordMatchesLetters('cat', 'c', 't')).toBe(true)
  })

  it('picks random pairs with words', () => {
    const pair = pickRandomLetterPair()
    expect(pair).toBeTruthy()
    expect(countWordsForPair(pair!.start, pair!.end)).toBeGreaterThan(0)
  })

  it('avoids used pairs when possible', () => {
    const first = pickRandomLetterPair()!
    const second = pickRandomLetterPair([`${first.start}-${first.end}`])
    expect(second).toBeTruthy()
  })
})

describe('word-rush helpers', () => {
  it('clamps modes', () => {
    expect(clampWordRushMode('individual')).toBe('individual')
    expect(clampWordRushMode('team')).toBe('team')
    expect(clampWordRushMode('x')).toBe('team')
    expect(clampWordRushPromptMode('manual')).toBe('manual')
    expect(clampWordRushPromptMode('automatic')).toBe('automatic')
  })

  it('computes team scores from correct answers', () => {
    const scores = computeWordRushTeamScores(
      [
        { team: 1, correct: true, team_turn_index: 0 },
        { team: 1, correct: true, team_turn_index: 0 },
        { team: 2, correct: true, team_turn_index: 1 },
        { team: 1, correct: false, team_turn_index: 0 },
      ],
      2
    )
    expect(scores.find((s) => s.team === 1)?.score).toBe(2)
    expect(scores.find((s) => s.team === 2)?.score).toBe(1)
  })

  it('rotates prompt setter in individual manual mode', () => {
    const roster = ['a', 'b', 'c']
    expect(promptSetterForIndividualRound(roster, 0)).toBe('a')
    expect(promptSetterForIndividualRound(roster, 1)).toBe('b')
    expect(promptSetterForIndividualRound(roster, 3)).toBe('a')
  })

  it('team turn index maps to teams', () => {
    expect(teamForTurnIndex(0, 2)).toBe(1)
    expect(teamForTurnIndex(1, 2)).toBe(2)
    expect(teamForTurnIndex(2, 2)).toBe(1)
  })

  it('lobby ready requires players on each team', () => {
    expect(wordRushLobbyReady([{ player_id: 'a', team: 1 }], 2, 'team').ok).toBe(false)
    expect(
      wordRushLobbyReady(
        [
          { player_id: 'a', team: 1 },
          { player_id: 'b', team: 2 },
        ],
        2,
        'team'
      ).ok
    ).toBe(true)
    expect(wordRushLobbyReady([], 2, 'individual').ok).toBe(true)
  })

  it('rebalances uneven teams', () => {
    const assignment = rebalanceWordRushTeams(
      ['a', 'b', 'c', 'd', 'e'],
      [
        { player_id: 'a', team: 1 },
        { player_id: 'b', team: 1 },
        { player_id: 'c', team: 1 },
        { player_id: 'd', team: 2 },
        { player_id: 'e', team: 2 },
      ],
      2
    )
    const counts = [0, 0]
    for (const team of assignment.values()) counts[team - 1] += 1
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
    expect(assignment.size).toBe(5)
  })

  it('shuffles every player onto a team', () => {
    const assignment = shuffleWordRushTeams(['a', 'b', 'c', 'd'], 2)
    expect(assignment.size).toBe(4)
    for (const team of assignment.values()) {
      expect(team).toBeGreaterThanOrEqual(1)
      expect(team).toBeLessThanOrEqual(2)
    }
  })

  it('awards more points for faster individual answers', () => {
    const fast = wordRushIndividualGuessPoints(new Date(Date.now() + 120_000).toISOString(), 120, 3)
    const slow = wordRushIndividualGuessPoints(new Date(Date.now() + 2_000).toISOString(), 120, 3)
    expect(fast).toBeGreaterThanOrEqual(WORD_RUSH_INDIVIDUAL_BASE_POINTS + WORD_RUSH_INDIVIDUAL_SPEED_BONUS - 1)
    expect(slow).toBeGreaterThanOrEqual(WORD_RUSH_INDIVIDUAL_BASE_POINTS)
    expect(fast).toBeGreaterThan(slow)
  })

  it('awards more points for longer individual words', () => {
    const deadline = new Date(Date.now() + 60_000).toISOString()
    const at = Date.now()
    const short = wordRushIndividualGuessPointsAt(deadline, 120, at, 3)
    const long = wordRushIndividualGuessPointsAt(deadline, 120, at, 8)
    expect(long).toBeGreaterThan(short)
    expect(long - short).toBe(10)
  })

  it('detects when every individual player has answered', () => {
    const session = {
      roster: ['a', 'b', 'c'],
      prompt_setter_player_id: 'a',
      turn_index: 0,
    }
    expect(allWordRushIndividualPlayersSubmitted(session, [{ player_id: 'b', turn_index: 0, correct: true }])).toBe(
      false
    )
    expect(
      allWordRushIndividualPlayersSubmitted(session, [
        { player_id: 'b', turn_index: 0, correct: true },
        { player_id: 'c', turn_index: 0, correct: true },
      ])
    ).toBe(true)
    expect(
      allWordRushIndividualPlayersSubmitted(session, [
        { player_id: 'b', turn_index: 0, correct: false },
        { player_id: 'c', turn_index: 0, correct: true },
      ])
    ).toBe(false)
    expect(wordRushIndividualAnswerers({ roster: ['a', 'b', 'c'], prompt_setter_player_id: 'a' })).toEqual(['b', 'c'])
  })

  it('shows results when the game is finished', () => {
    expect(isWordRushResultsPhase('finished', { status: 'active', phase: 'playing' })).toBe(true)
    expect(isWordRushResultsPhase('active', { status: 'finished', phase: 'finished' })).toBe(true)
    expect(isWordRushResultsPhase('waiting', { status: 'finished', phase: 'finished' })).toBe(false)
    expect(isWordRushResultsPhase('active', { status: 'active', phase: 'playing' })).toBe(false)
  })
})
