import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isProdDeployment, resolveAppEnv } from './app-env'

const env = (o: Record<string, string | undefined>) => o as unknown as NodeJS.ProcessEnv

describe('resolveAppEnv', () => {
  it('treats the real production hosts as prod', () => {
    expect(resolveAppEnv(env({ NEXT_PUBLIC_APP_URL: 'https://fateround.com' }))).toBe('prod')
    expect(resolveAppEnv(env({ NEXT_PUBLIC_APP_URL: 'https://www.fateround.com' }))).toBe('prod')
  })

  // The case that caused the outage: a deployed dev build sets NODE_ENV=production too.
  it('treats the dev host as dev even when NODE_ENV says production', () => {
    expect(resolveAppEnv(env({ NEXT_PUBLIC_APP_URL: 'https://dev.fateround.com', NODE_ENV: 'production' }))).toBe('dev')
  })

  it.each([
    ['a preview host', 'https://pr-123.fateround.com'],
    ['localhost', 'http://localhost:3000'],
    ['a lookalike domain', 'https://fateround.com.evil.test'],
    ['a subdomain of the prod host', 'https://staging.fateround.com'],
  ])('treats %s as dev', (_label, url) => {
    expect(resolveAppEnv(env({ NEXT_PUBLIC_APP_URL: url }))).toBe('dev')
  })

  it('defaults to dev when the URL is missing or unparseable — the safe direction', () => {
    expect(resolveAppEnv(env({}))).toBe('dev')
    expect(resolveAppEnv(env({ NEXT_PUBLIC_APP_URL: 'not-a-url' }))).toBe('dev')
    expect(resolveAppEnv(env({ NODE_ENV: 'production' }))).toBe('dev')
  })

  it('lets an explicit APP_ENV override the host, in both directions', () => {
    expect(resolveAppEnv(env({ APP_ENV: 'dev', NEXT_PUBLIC_APP_URL: 'https://fateround.com' }))).toBe('dev')
    expect(resolveAppEnv(env({ APP_ENV: 'prod', NEXT_PUBLIC_APP_URL: 'https://dev.fateround.com' }))).toBe('prod')
  })

  it.each([
    ['production', 'prod'],
    ['PROD', 'prod'],
    ['development', 'dev'],
    ['preview', 'dev'],
    ['  Dev  ', 'dev'],
  ])('accepts APP_ENV=%s', (v, want) => {
    expect(resolveAppEnv(env({ APP_ENV: v }))).toBe(want)
  })

  it('ignores an unrecognised APP_ENV and falls through to the host', () => {
    expect(resolveAppEnv(env({ APP_ENV: 'staging', NEXT_PUBLIC_APP_URL: 'https://fateround.com' }))).toBe('prod')
    expect(resolveAppEnv(env({ APP_ENV: 'staging', NEXT_PUBLIC_APP_URL: 'https://dev.fateround.com' }))).toBe('dev')
  })
})

/**
 * The bug these guard: `resolveAppEnv` read the app URL off its `env` PARAMETER, which Next.js
 * cannot substitute at build time, so the browser bundle saw `undefined` and every client call
 * returned 'dev'. Production browser errors were tagged `environment: dev` in Sentry for weeks.
 *
 * Unit tests cannot observe webpack's build-time substitution, so these assert the two things
 * that are observable from here: that the no-argument call reads the ambient environment at all,
 * and that the source still contains the exact literal the substitution keys on.
 */
describe('client-bundle inlining', () => {
  it('reads the ambient environment when called with no argument', () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL
    try {
      process.env.NEXT_PUBLIC_APP_URL = 'https://fateround.com'
      expect(resolveAppEnv()).toBe('prod')
      process.env.NEXT_PUBLIC_APP_URL = 'https://dev.fateround.com'
      expect(resolveAppEnv()).toBe('dev')
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL
      else process.env.NEXT_PUBLIC_APP_URL = prev
    }
  })

  it('still spells out process.env.NEXT_PUBLIC_APP_URL literally, which is what Next.js inlines', () => {
    const source = readFileSync(new URL('./app-env.ts', import.meta.url), 'utf8')
    expect(source).toContain('process.env.NEXT_PUBLIC_APP_URL')
  })

  it('does not let the ambient value leak into an explicitly passed env', () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL
    try {
      process.env.NEXT_PUBLIC_APP_URL = 'https://fateround.com'
      // A caller that passes its own env must get exactly that env's answer.
      expect(resolveAppEnv(env({}))).toBe('dev')
      expect(resolveAppEnv(env({ NEXT_PUBLIC_APP_URL: 'https://dev.fateround.com' }))).toBe('dev')
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL
      else process.env.NEXT_PUBLIC_APP_URL = prev
    }
  })
})

describe('isProdDeployment', () => {
  it('is true only for prod', () => {
    expect(isProdDeployment(env({ NEXT_PUBLIC_APP_URL: 'https://fateround.com' }))).toBe(true)
    expect(isProdDeployment(env({ NEXT_PUBLIC_APP_URL: 'https://dev.fateround.com' }))).toBe(false)
    expect(isProdDeployment(env({}))).toBe(false)
  })
})
