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

describe('isProdDeployment', () => {
  it('is true only for prod', () => {
    expect(isProdDeployment(env({ NEXT_PUBLIC_APP_URL: 'https://fateround.com' }))).toBe(true)
    expect(isProdDeployment(env({ NEXT_PUBLIC_APP_URL: 'https://dev.fateround.com' }))).toBe(false)
    expect(isProdDeployment(env({}))).toBe(false)
  })
})
