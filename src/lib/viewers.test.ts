import { describe, expect, it } from 'vitest'
import { clampLateJoinPolicyForGameType, defaultLateJoinPolicyForGameType } from '@/lib/viewers'

describe('defaultLateJoinPolicyForGameType', () => {
  it('lets late joiners play Text Charades by default', () => {
    // Regression: describe_it games were created watch-only, so a late "Join as
    // player" was rejected and the joiner was forced into viewer mode.
    expect(defaultLateJoinPolicyForGameType('describe_it')).toBe('viewers_and_players')
  })

  it('keeps the conservative watch-only default for other games', () => {
    expect(defaultLateJoinPolicyForGameType('trivia')).toBe('viewers_only')
    expect(defaultLateJoinPolicyForGameType('chess')).toBe('viewers_only')
  })

  it('never defaults a board game to a policy it cannot support', () => {
    // A default must survive the same clamp the create form applies.
    const policy = defaultLateJoinPolicyForGameType('chess')
    expect(clampLateJoinPolicyForGameType(policy, 'chess')).toBe(policy)
  })
})
