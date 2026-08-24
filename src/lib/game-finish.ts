import type { SupabaseClient } from '@supabase/supabase-js'

// ⚠️ THIS MODULE MUST STAY A LEAF AT IMPORT TIME. Do not add value imports here.
//
// Every per-game module (uno, whot, ludo, chess, describe-it, …) imports `markGameFinished`
// from this file. Anything this file imports statically that reaches back into those modules
// closes a cycle, and webpack resolves cycles into a temporal-dead-zone access
// ("Cannot access 'g' before initialization"). That took production down on 2026-08-24, once
// instrumentation began pulling this graph in at server boot (#1059 / #1063).
//
// Everything below the row flip is a best-effort POST-finish side effect, run once per game and
// never on a hot path, so each is imported at its call site instead. Type-only imports are fine
// (erased at compile time). If you need something new here, import it inside the function.

export async function markGameFinished(
  supabase: SupabaseClient,
  gameId: string,
  finishedAt = new Date().toISOString(),
  // Flows where several requests can independently detect the finish at once (e.g.
  // sudoku's "first to solve the whole board") should pass `onlyIfActive` so the
  // active→finished transition is a single-winner CAS — otherwise every racer's
  // update succeeds and `awardRoomGamePoints` runs more than once for one game.
  { onlyIfActive = false }: { onlyIfActive?: boolean } = {}
) {
  const update = supabase.from('games').update({ status: 'finished', finished_at: finishedAt }).eq('id', gameId)
  const result = onlyIfActive ? await update.eq('status', 'active').select('id') : await update

  // With the guard, only the request that actually flipped the row (non-empty data)
  // won the transition and should award points; losers get an empty set, no error.
  const won = !onlyIfActive || (Array.isArray(result.data) && result.data.length > 0)

  if (!result.error && won) {
    try {
      // Imported HERE, not at module scope — this one edge closed six import cycles.
      //
      // `room-points` needs pure scoring helpers (unoPlacementOrder, whotPlacementOrder,
      // buildLudoStandings, crazyEightsPlacementOrder, buildSnakeLadderStandings,
      // tallyWordHuntScores) which live inside the heavy per-game modules — and each of those
      // modules imports `markGameFinished` from THIS file. So a static import above created:
      //
      //   game-finish -> room-points -> {uno,whot,ludo,crazy-eights,snake-and-ladder,word-hunt}
      //                -> game-finish
      //
      // six ways round. Webpack resolves such a cycle into a temporal-dead-zone access
      // ("Cannot access 'g' before initialization"), which took production down on 2026-08-24
      // when instrumentation began pulling this graph in at server boot (#1059 / #1063).
      //
      // Deferring to the call site removes the static edge entirely, so the cycle no longer
      // exists in the module graph — this is not a bundler workaround. It is safe precisely
      // here: one call site, once per game finish (not a hot path), already best-effort inside
      // this try/catch. The structural alternative is to extract the six scoring helpers into
      // their own pure modules so `room-points` never reaches the game modules; that is a
      // larger refactor and worth doing, but is not required to break the cycle.
      const { awardRoomGamePoints } = await import('@/lib/room-points')
      await awardRoomGamePoints(supabase, gameId)
    } catch {
      // Room stats are best-effort — never block game finish.
    }
    try {
      // Snapshot trophy facts NOW, while the game's own tables still hold the round. Play-again
      // clears them and Chess's rematch blanks its move list, so deriving these at attribution
      // time — after the client mounts the finished screen — loses them to whoever replays
      // first. Best-effort: on failure the award pass falls back to deriving live, which is
      // exactly the old behaviour.
      const { recordRoundFacts } = await import('@/lib/trophies/round-facts')
      await recordRoundFacts(supabase, gameId, finishedAt)
    } catch (err) {
      // Never block game finish for a trophy snapshot — but do NOT swallow the failure silently.
      // The snapshot is the durable copy of a round's facts; if it keeps failing, play-again can
      // delete the live state before attribution and the fallback has nothing to reconstruct
      // from. Logging it means a persistent problem is visible rather than an invisible slow
      // leak of trophies.
      console.error(`recordRoundFacts failed for game ${gameId}`, err)
    }
    try {
      // Advance a head-to-head bracket match (record winner / rematch a draw).
      // No-op for every other game. Never block game finish, but — unlike room
      // points — this is core tournament state, so surface a failure rather than
      // swallow it: a stuck match needs attention (host can re-trigger by ending
      // the game again, and resolution is idempotent).
      const { resolveHeadToHeadMatch } = await import('@/lib/tournament-h2h')
      await resolveHeadToHeadMatch(supabase, gameId)
    } catch (err) {
      console.error(`resolveHeadToHeadMatch failed for game ${gameId}`, err)
    }
    try {
      // Advance a school (class-ladder) match: climb the winner a class, or finish
      // the tournament if that graduates them. No-op for every other game; core
      // tournament state, so surface a failure rather than swallow it.
      const { resolveSchoolMatch } = await import('@/lib/tournament-school')
      await resolveSchoolMatch(supabase, gameId)
    } catch (err) {
      console.error(`resolveSchoolMatch failed for game ${gameId}`, err)
    }
    try {
      // Score a finished Scrabble knockout room and, once the round's last room is
      // in, cut the bottom half of the whole field. No-op for every other game;
      // core tournament state, so surface a failure rather than swallow it.
      const { resolveKnockoutGroupRoom } = await import('@/lib/tournament-scoring')
      await resolveKnockoutGroupRoom(supabase, gameId)
    } catch (err) {
      console.error(`resolveKnockoutGroupRoom failed for game ${gameId}`, err)
    }
  }

  return result
}
