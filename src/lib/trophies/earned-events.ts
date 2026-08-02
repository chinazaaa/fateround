/**
 * A tiny bus for "this player just earned something".
 *
 * The award pass runs inside `useProfileAttribution`, which lives in the two central game hooks.
 * The prompt has to appear once, above whatever screen the player is on. Threading a callback
 * out through both hooks and into ~40 game views to render it would be the third time this
 * feature paid that tax, so the hook emits and one always-mounted listener renders.
 *
 * Mirrors the existing `kmk-player-session` CustomEvent convention rather than adding a context.
 */

export type EarnedTrophy = { id: string; title: string; tier: string; points: number }

const EVENT = 'fateround-trophies-earned'

export function emitTrophiesEarned(trophies: EarnedTrophy[], gameType?: string): void {
  if (typeof window === 'undefined' || !trophies.length) return
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { trophies, gameType } }))
}

/**
 * Subscribe. Returns the unsubscribe function.
 *
 * `gameType` may be undefined for an older emitter or a game whose type couldn't be read —
 * listeners must degrade rather than assume it, since a broken link is worse than no link.
 */
export function onTrophiesEarned(handler: (trophies: EarnedTrophy[], gameType?: string) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (event: Event) => {
    const detail = (event as CustomEvent).detail as { trophies?: EarnedTrophy[]; gameType?: string } | undefined
    if (detail?.trophies?.length) handler(detail.trophies, detail.gameType)
  }
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
