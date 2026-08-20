import { describe, expect, it } from 'vitest'
import { formatTradeMessageForPlayer, monopolyDeclineReasonClause } from './monopoly-trade-messages'
import type { MonopolyLastTradeEvent } from '@/types'

const PLAYERS = [
  { id: 'human', name: 'Ada' },
  { id: 'bot', name: 'Bot Chidi' },
]

function declineEvent(overrides: Partial<MonopolyLastTradeEvent> = {}): MonopolyLastTradeEvent {
  return { seq: 1, from_player_id: 'human', to_player_id: 'bot', outcome: 'declined', ...overrides }
}

describe('bot decline reasons', () => {
  it('shows the reason to the player who made the offer', () => {
    const msg = formatTradeMessageForPlayer(declineEvent({ decline_reason: 'protects_my_monopoly' }), 'human', PLAYERS)
    expect(msg).toContain('Bot Chidi declined your trade offer.')
    expect(msg).toContain('completed monopoly')
  })

  it('omits the reason for onlookers and for the decliner', () => {
    const forBot = formatTradeMessageForPlayer(declineEvent({ decline_reason: 'offer_too_low' }), 'bot', PLAYERS)
    const forWatcher = formatTradeMessageForPlayer(declineEvent({ decline_reason: 'offer_too_low' }), 'other', PLAYERS)
    expect(forBot).not.toContain('try offering more')
    expect(forWatcher).not.toContain('try offering more')
  })

  it('falls back to the plain line for a human decline (no reason recorded)', () => {
    expect(formatTradeMessageForPlayer(declineEvent(), 'human', PLAYERS)).toBe('Bot Chidi declined your trade offer.')
  })

  it('themes the reason text like every other trade message', () => {
    // Naija edition swaps the currency symbol and words via formatThemedText —
    // the appended clause must go through the same pass, not bypass it.
    const msg = formatTradeMessageForPlayer(
      declineEvent({ decline_reason: 'offer_too_low' }),
      'human',
      PLAYERS,
      'naija'
    )
    expect(msg).toContain('try offering more')
  })

  it('tells the player a bigger offer can still win a set-completing card', () => {
    // Wording matters: the bot prices these, it no longer vetoes them, so the
    // clause must not read as a flat refusal.
    const clause = monopolyDeclineReasonClause('completes_your_set')
    expect(clause).toContain('steep premium')
    expect(clause).toContain('bigger offer')
    expect(clause).not.toMatch(/never|no amount/i)
  })
})
