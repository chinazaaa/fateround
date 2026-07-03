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

/** Prefer the live browser origin when sharing links so localStorage matches on the same device. */
export function shareOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return appOrigin()
}

export function playerGameUrl(gameCode: string, origin: string = appOrigin()): string {
  return `${origin.replace(/\/$/, '')}/game/${gameCode.trim().toUpperCase()}`
}

export function roomLobbyUrl(roomCode: string, origin: string = appOrigin()): string {
  return `${origin.replace(/\/$/, '')}/room/${roomCode.trim().toUpperCase()}`
}

export function playerResumeUrl(gameCode: string, resumeToken: string, origin: string = appOrigin()): string {
  const code = gameCode.trim().toUpperCase()
  const token = resumeToken.trim().toUpperCase()
  return `${playerGameUrl(code, origin)}?player=${encodeURIComponent(token)}`
}

export function hostGameUrl(gameCode: string, hostToken: string, origin: string = appOrigin()): string {
  const code = gameCode.trim().toUpperCase()
  const token = hostToken.trim()
  return `${origin.replace(/\/$/, '')}/host/${code}?token=${encodeURIComponent(token)}`
}

/** The public tournament lobby link — anyone can open it and join with a name. */
export function tournamentInviteUrl(code: string, origin: string = appOrigin()): string {
  return `${origin.replace(/\/$/, '')}/tournament/${code.trim().toUpperCase()}`
}

/** A player's "continue on another device" link — carries their secret code so they
 *  resume as themselves (name + seat) instead of joining fresh. */
export function tournamentPlayerResumeUrl(code: string, token: string, origin: string = appOrigin()): string {
  return `${tournamentInviteUrl(code, origin)}?ptoken=${encodeURIComponent(token.trim().toUpperCase())}`
}

/** The host's link to manage a tournament from another device (carries the host token). */
export function tournamentHostUrl(code: string, hostToken: string, origin: string = appOrigin()): string {
  return `${tournamentInviteUrl(code, origin)}?host=${encodeURIComponent(hostToken.trim())}`
}

/** Host panel + your player seat — manage and play from one link. */
export function hostPlayerUrl(
  gameCode: string,
  hostToken: string,
  resumeToken: string,
  origin: string = appOrigin()
): string {
  const base = hostGameUrl(gameCode, hostToken, origin)
  const player = resumeToken.trim().toUpperCase()
  return `${base}&player=${encodeURIComponent(player)}`
}

/** PayPal / Ko-fi / Buy Me a Coffee link. Override with NEXT_PUBLIC_SUPPORT_URL. */
export function supportUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPPORT_URL?.trim()
  if (!raw) return 'https://www.paypal.me/nazalistic'
  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`)
    return url.href
  } catch {
    return raw
  }
}
