const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateGameCode(): string {
  return Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
}

export function normalizeResumeToken(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function normalizeGameCode(raw: string): string {
  return normalizeResumeToken(raw)
}
