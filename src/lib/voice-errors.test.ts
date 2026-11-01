import { describe, expect, it } from 'vitest'
import { micToggleErrorMessage } from './voice-errors'

function domError(name: string): Error {
  const e = new Error('x')
  e.name = name
  return e
}

describe('micToggleErrorMessage', () => {
  it('points at browser settings when the mic prompt is dismissed or denied (Sentry JAVASCRIPT-NEXTJS-16)', () => {
    expect(micToggleErrorMessage(domError('NotAllowedError'))).toMatch(/allow the prompt/)
    expect(micToggleErrorMessage(domError('SecurityError'))).toMatch(/allow the prompt/)
  })

  it('says no microphone was found', () => {
    expect(micToggleErrorMessage(domError('NotFoundError'))).toMatch(/No microphone/)
  })

  it('says the microphone is busy', () => {
    expect(micToggleErrorMessage(domError('NotReadableError'))).toMatch(/another app/)
  })

  it('reads the name from error-like objects that do not extend Error', () => {
    expect(micToggleErrorMessage({ name: 'NotAllowedError', message: 'denied' })).toMatch(/allow the prompt/)
  })

  it('falls back to a neutral retry message, e.g. engine not connected (Sentry JAVASCRIPT-NEXTJS-1D)', () => {
    const fallback = "Couldn't change your microphone. Try again in a moment."
    expect(micToggleErrorMessage(domError('PublishTrackError'))).toBe(fallback)
    expect(micToggleErrorMessage(domError('AbortError'))).toBe(fallback)
    expect(micToggleErrorMessage('not an error')).toBe(fallback)
    expect(micToggleErrorMessage(null)).toBe(fallback)
  })
})
