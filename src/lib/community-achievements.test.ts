import { describe, expect, it } from 'vitest'
import { achievementByKey, GAME_ACHIEVEMENTS, isValidLeaderboardType } from '@/lib/community-achievements'

describe('community achievements', () => {
  it('resolves known achievement keys and rejects unknown ones', () => {
    expect(achievementByKey('codewords_spymaster')?.baseGameType).toBe('codewords')
    expect(achievementByKey('two_truths_guesser')?.baseGameType).toBe('two_truths')
    expect(achievementByKey('not_a_thing')).toBeNull()
  })

  it('every achievement has a unique key and a base game type', () => {
    const keys = GAME_ACHIEVEMENTS.map((a) => a.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const a of GAME_ACHIEVEMENTS) expect(a.baseGameType).toBeTruthy()
  })

  it('accepts the real game type as its own leaderboard target', () => {
    expect(isValidLeaderboardType('whot', 'whot')).toBe(true)
    expect(isValidLeaderboardType('codewords', 'codewords')).toBe(true)
  })

  it('accepts an achievement only for the game it belongs to', () => {
    expect(isValidLeaderboardType('codewords', 'codewords_spymaster')).toBe(true)
    expect(isValidLeaderboardType('codewords', 'codewords_operative')).toBe(true)
    expect(isValidLeaderboardType('two_truths', 'two_truths_guesser')).toBe(true)
    expect(isValidLeaderboardType('describe_it', 'describe_it_describer')).toBe(true)
    expect(isValidLeaderboardType('describe_it', 'describe_it_guesser')).toBe(true)
  })

  it('rejects an achievement steered onto an unrelated game', () => {
    // A whot match must not be able to post onto a codewords achievement board.
    expect(isValidLeaderboardType('whot', 'codewords_spymaster')).toBe(false)
    expect(isValidLeaderboardType('two_truths', 'codewords_operative')).toBe(false)
    expect(isValidLeaderboardType('codewords', 'two_truths_guesser')).toBe(false)
    expect(isValidLeaderboardType('describe_it', 'two_truths_guesser')).toBe(false)
    expect(isValidLeaderboardType('two_truths', 'describe_it_guesser')).toBe(false)
    expect(isValidLeaderboardType('whot', 'chess')).toBe(false)
  })
})
