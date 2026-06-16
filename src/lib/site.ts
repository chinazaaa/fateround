/** Public site domain (no protocol). Override with NEXT_PUBLIC_APP_URL in env. */
export function appDomain(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!raw) return 'fateround.com'
  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`)
    return url.host
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  }
}

export function appOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!raw) return 'https://fateround.com'
  if (raw.includes('://')) return raw.replace(/\/$/, '')
  return `https://${raw.replace(/\/$/, '')}`
}

export function playerGameUrl(gameCode: string): string {
  return `${appOrigin()}/game/${gameCode.trim().toUpperCase()}`
}
