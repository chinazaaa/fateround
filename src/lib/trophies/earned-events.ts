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

export function emitTrophiesEarned(trophies: EarnedTrophy[]): void {
  if (typeof window === 'undefined' || !trophies.length) return
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { trophies } }))
}

/** Subscribe. Returns the unsubscribe function. */
export function onTrophiesEarned(handler: (trophies: EarnedTrophy[]) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (event: Event) => {
    const detail = (event as CustomEvent).detail as { trophies?: EarnedTrophy[] } | undefined
    if (detail?.trophies?.length) handler(detail.trophies)
  }
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
