import { describe, expect, it } from 'vitest'
import { secretMatches, timingSafeEqual } from './secret-compare'

/**
 * `secretMatches` is the host-token check behind every host-authorized route. Nothing tested it,
 * and its failure modes are all silent: a comparison that returns true for a missing token, or
 * one that short-circuits on length, produces no functional symptom and is invisible to
 * inspection. These pin the contract rather than the implementation.
 */
describe('timingSafeEqual', () => {
  it('accepts identical strings', async () => {
    await expect(timingSafeEqual('s3cret-token', 's3cret-token')).resolves.toBe(true)
  })

  it('rejects strings differing only in the last byte', async () => {
    await expect(timingSafeEqual('s3cret-tokea', 's3cret-tokeb')).resolves.toBe(false)
  })

  it('rejects strings differing only in the first byte', async () => {
    await expect(timingSafeEqual('a3cret-token', 'b3cret-token')).resolves.toBe(false)
  })

  it('rejects a prefix of the real secret — a length check alone would not', async () => {
    await expect(timingSafeEqual('s3cret', 's3cret-token')).resolves.toBe(false)
  })

  it('treats two empty strings as equal (the guard against that lives in secretMatches)', async () => {
    await expect(timingSafeEqual('', '')).resolves.toBe(true)
  })

  it('is case-sensitive', async () => {
    await expect(timingSafeEqual('Secret', 'secret')).resolves.toBe(false)
  })

  it('handles non-ASCII without throwing', async () => {
    await expect(timingSafeEqual('tökén-✓', 'tökén-✓')).resolves.toBe(true)
    await expect(timingSafeEqual('tökén-✓', 'tökén-✗')).resolves.toBe(false)
  })
})

describe('secretMatches', () => {
  it('matches a correct token', async () => {
    await expect(secretMatches('abc123', 'abc123')).resolves.toBe(true)
  })

  it('rejects a wrong token', async () => {
    await expect(secretMatches('abc123', 'def456')).resolves.toBe(false)
  })

  // The important half: absence must never authorize. If a game row has no host_token, a caller
  // supplying nothing must not be treated as the host.
  it.each([
    ['both empty strings', '', ''],
    ['both null', null, null],
    ['both undefined', undefined, undefined],
    ['supplied empty, stored empty', '', ''],
    ['supplied null, stored present', null, 'abc123'],
    ['supplied present, stored null', 'abc123', null],
    ['supplied undefined, stored present', undefined, 'abc123'],
    ['supplied present, stored undefined', 'abc123', undefined],
    ['supplied empty, stored present', '', 'abc123'],
    ['supplied present, stored empty', 'abc123', ''],
  ])('never authorizes when %s', async (_label, supplied, stored) => {
    await expect(secretMatches(supplied as string | null | undefined, stored as string | null | undefined)).resolves.toBe(
      false
    )
  })

  it('does not coerce — the string "null" is not a null token', async () => {
    await expect(secretMatches('null', null)).resolves.toBe(false)
  })
})
