import { describe, expect, it } from 'vitest'
import { micToggleErrorMessage } from './voice-errors'

function domError(name: string): Error {
  const e = new Error('x')
  e.name = name
  return e
}

describe('micToggleErrorMessage', () => {
  it('points at browser settings when the mic prompt is dismissed or denied (Sentry JAVASCRIPT-NEXTJS-16)', () => {
    expect(micToggleErrorMessage(domError('NotAllowedError'))).toMatch(/Allow the microphone/)
    expect(micToggleErrorMessage(domError('SecurityError'))).toMatch(/Allow the microphone/)
  })

  it('says no microphone was found', () => {
    expect(micToggleErrorMessage(domError('NotFoundError'))).toMatch(/No microphone/)
  })

  it('says the microphone is busy', () => {
    expect(micToggleErrorMessage(domError('NotReadableError'))).toMatch(/another app/)
  })

  it('falls back to a reconnecting message, e.g. engine not connected (Sentry JAVASCRIPT-NEXTJS-1D)', () => {
    const err = domError('PublishTrackError')
    expect(micToggleErrorMessage(err)).toMatch(/reconnecting/)
    expect(micToggleErrorMessage('not an error')).toMatch(/reconnecting/)
  })
})
