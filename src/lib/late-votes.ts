import type { Vote } from '@/types'

/** `base` followed by every `extra` vote whose id is not already in it. */
export function mergeVotesById(base: Vote[], extra: Vote[]): Vote[] {
  if (extra.length === 0) return base
  const ids = new Set(base.map((v) => v.id))
  const added = extra.filter((v) => !ids.has(v.id))
  return added.length === 0 ? base : [...base, ...added]
}

/**
 * A vote accepted inside the close grace window is inserted AFTER the round finished, so its
 * realtime INSERT can arrive while the results snapshot is still being fetched (the snapshot is then
 * read before the row existed and would drop it) or before any code path has loaded the results.
 *
 * The tracker remembers the votes inserted for the round whose results are on screen, so every
 * path that loads a snapshot (realtime round update, bootstrap, polling) can fold them back in with
 * `merge`, whatever order the events and fetches finish in.
 */
export function createLateVoteTracker() {
  let roundId: string | null = null
  let late = new Map<string, Vote>()

  return {
    /** Start tracking `id`. Call BEFORE fetching that round's results. Re-calling for the same round is a no-op. */
    begin(id: string) {
      if (roundId === id) return
      roundId = id
      late = new Map()
    },
    /** The round being tracked, or null. */
    current: () => roundId,
    /** Record a vote INSERT. Returns true when it belongs to the tracked round (and should be displayed). */
    add(vote: Vote): boolean {
      if (roundId === null || vote.round_id !== roundId) return false
      late.set(vote.id, vote)
      return true
    },
    /** A fetched snapshot for `id`, plus any late votes that the snapshot may predate. */
    merge(id: string, snapshot: Vote[]): Vote[] {
      if (roundId !== id) return snapshot
      return mergeVotesById(snapshot, [...late.values()])
    },
  }
}
