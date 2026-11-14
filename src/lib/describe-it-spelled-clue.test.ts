import { describe, it, expect } from 'vitest'
import { clueContainsWord } from './describe-it'

describe('clueContainsWord — spelled-out words', () => {
  it('catches letters separated by spaces, dots or dashes', () => {
    expect(clueContainsWord('e l e p h a n t', 'elephant')).toBe(true)
    expect(clueContainsWord('e.l.e.p.h.a.n.t', 'elephant')).toBe(true)
    expect(clueContainsWord('E-L-E-P-H-A-N-T', 'elephant')).toBe(true)
    expect(clueContainsWord('it is an e l e p h a n t!', 'elephant')).toBe(true)
  })

  it('catches spelled-out multi-word answers', () => {
    expect(clueContainsWord('i c e c r e a m', 'ice cream')).toBe(true)
  })

  it('keeps the existing checks', () => {
    expect(clueContainsWord('a firewall', 'fire')).toBe(true)
    expect(clueContainsWord('icecream cone', 'ice cream')).toBe(true)
    expect(clueContainsWord('they are dancing', 'dance')).toBe(true)
  })

  it('does not flag legitimate clues', () => {
    expect(clueContainsWord('big grey animal with a trunk', 'elephant')).toBe(false)
    expect(clueContainsWord('e l e', 'elephant')).toBe(false)
  })

  it('does not apply the squashed check to short words', () => {
    expect(clueContainsWord('i can', 'ant')).toBe(false)
    expect(clueContainsWord('a nice at', 'cat')).toBe(false)
  })
})
