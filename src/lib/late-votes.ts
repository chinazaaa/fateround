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
export type LateVoteTracker = ReturnType<typeof createLateVoteTracker>

export function createLateVoteTracker() {
  let roundId: string | null = null
  let late = new Map<string, Vote>()
  let lastTicket = 0
  let ownerTicket = 0
  // Counts switches of the tracked round, including a switch away and back to the same round.
  let epoch = 0

  return {
    /**
     * A loader takes a ticket when it STARTS (before any await). Tickets order loaders by start time, so a loader
     * that started earlier but finishes later can be told apart from the newer one that owns the tracking state.
     */
    ticket: () => ++lastTicket,
    /**
     * Start tracking `id` for the loader holding `ticket`. Call BEFORE fetching that round's results. Returns a
     * token for `owns`, or null when the caller is stale and must not apply anything: switching to a different
     * round is refused when a loader that started later already owns the tracking state, because it would clear
     * the newer round's late votes. Re-calling for the tracked round is always allowed and changes nothing
     * (repeated loads of one round, in any order); a loader that started later can take over, including for an
     * older round id (a replayed game).
     */
    begin(id: string, ticket: number): number | null {
      if (roundId === id) {
        ownerTicket = Math.max(ownerTicket, ticket)
        return epoch
      }
      if (ticket < ownerTicket) return null
      ownerTicket = ticket
      roundId = id
      late = new Map()
      return ++epoch
    },
    /** True while the tracked round has not been switched since `begin` returned `token` (re-check after awaits). */
    owns: (token: number) => token === epoch,
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

/**
 * The one sequence every finished-round loader (bootstrap, realtime round update, polling) must follow, so that
 * loaders finishing out of order cannot overwrite each other: take ownership of the tracker BEFORE fetching, and
 * check it again AFTER the fetch and before applying anything.
 *
 *   - 'stale'   a loader that started later owns the tracker (before the fetch), or the tracked round was switched
 *               while this fetch was in flight (after it): nothing was applied.
 *   - 'failed'  `fetchResults` returned null (the fetch failed): nothing was applied.
 *   - 'applied' `apply` ran with the votes merged with the late votes the snapshot may predate.
 */
export async function loadFinishedRoundResults<T extends { votes: Vote[] }>(
  tracker: LateVoteTracker,
  roundId: string,
  ticket: number,
  fetchResults: () => Promise<T | null>,
  apply: (results: T) => void
): Promise<'applied' | 'stale' | 'failed'> {
  const token = tracker.begin(roundId, ticket)
  if (token === null) return 'stale'
  const results = await fetchResults()
  if (!tracker.owns(token)) return 'stale'
  if (results === null) return 'failed'
  apply({ ...results, votes: tracker.merge(roundId, results.votes) })
  return 'applied'
}
