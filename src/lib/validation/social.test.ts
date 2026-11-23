import { describe, expect, it } from 'vitest'
import { createAnonymousMessageSchema } from './social'

const base = { gameId: 'ABCD', resumeToken: 'TOKEN-1234' }

describe('createAnonymousMessageSchema text', () => {
  it('keeps ordinary text and emoji sequences', () => {
    expect(createAnonymousMessageSchema.parse({ ...base, text: 'hello' }).text).toBe('hello')
    expect(createAnonymousMessageSchema.parse({ ...base, text: '❤️' }).text).toBe('❤️')
  })

  it.each([
    ['U+206A inhibit symmetric swapping', '⁪'],
    ['U+206F nominal digit shapes', '⁯'],
    ['zero-width space', '​'],
    ['U+2065 (unassigned, default-ignorable)', '⁥'],
    ['Hangul filler', 'ㅤ'],
    ['variation selector', '️'],
    ['mix with spaces', ' ​ ⁪ '],
  ])('treats %s as an empty message', (_label, text) => {
    expect(createAnonymousMessageSchema.parse({ ...base, text }).text).toBe('')
  })
})

describe('createAnonymousMessageSchema mediaUrl', () => {
  const gif = (mediaUrl: string) => createAnonymousMessageSchema.safeParse({ ...base, messageType: 'gif', mediaUrl })

  it('accepts an @ in the path or query', () => {
    expect(gif('https://media.example/clip@2x.gif').success).toBe(true)
    expect(gif('https://media.example/clip.gif?v=a@b').success).toBe(true)
  })

  it.each([
    ['https://user@media.example/clip.gif'],
    ['https://user:pw@media.example/clip.gif'],
    ['https://:pw@media.example/clip.gif'],
    ['http://media.example/clip.gif'],
    ['javascript:alert(1)'],
  ])('rejects %s', (url) => {
    expect(gif(url).success).toBe(false)
  })
})
