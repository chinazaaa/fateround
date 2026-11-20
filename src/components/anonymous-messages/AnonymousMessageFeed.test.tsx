// @vitest-environment jsdom
/** The feed scrolls to the newest message when it grows; scrollToLatestOnMount also covers a feed that
 *  mounts already holding its messages (the host inbox, held back until its first read). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { AnonymousMessage } from '@/types'
import { AnonymousMessageFeed } from './AnonymousMessageFeed'

const message = (id: string) =>
  ({
    id,
    game_id: 'ABCD',
    player_id: '',
    text: id,
    created_at: '2026-01-01T00:00:00Z',
  }) as unknown as AnonymousMessage

let scrollTo: ReturnType<typeof vi.fn>
beforeEach(() => {
  scrollTo = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: scrollTo, configurable: true, writable: true })
})
afterEach(() => {
  cleanup()
  // @ts-expect-error restore jsdom's lack of scrollTo
  delete HTMLElement.prototype.scrollTo
})

describe('AnonymousMessageFeed scrolling', () => {
  it('does not scroll a feed that mounts already holding messages by default', () => {
    render(<AnonymousMessageFeed messages={[message('a'), message('b')]} />)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('scrolls to the newest message on mount when asked to', () => {
    render(<AnonymousMessageFeed messages={[message('a'), message('b')]} scrollToLatestOnMount />)
    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }))
  })

  it('does not scroll an empty feed on mount, and still scrolls when messages arrive later', () => {
    const { rerender } = render(<AnonymousMessageFeed messages={[]} scrollToLatestOnMount />)
    expect(scrollTo).not.toHaveBeenCalled()
    rerender(<AnonymousMessageFeed messages={[message('a')]} scrollToLatestOnMount />)
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })
})
