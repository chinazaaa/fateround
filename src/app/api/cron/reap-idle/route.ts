import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { closeIdleActiveGames, isIdleReaperDisabled, resolveIdleMinutes } from '@/lib/idle-reaper'
import { recoverAllFinishBookkeeping } from '@/lib/game-finish'
import { settleAllWordGroupingGames } from '@/lib/word-grouping-completion'
import { resumeAllWordRushFinalizations } from '@/lib/word-rush-server'

/**
 * Cron tick — close `status='active'` games whose `last_activity_at` hasn't
 * moved in 30 minutes (IDLE_REAPER_MINUTES to tune). Bounded batch (20 per
 * call) so a backlog drains gently instead of saturating the DB; the next
 * tick picks up the rest.
 *
 * Why a route and not `startIdleReaper()` in instrumentation.ts: importing
 * the reaper's module graph (admin-end-game → game-finish → room-points /
 * tournament / trophies → coins) during Next's server bootstrap hit a
 * webpack circular-import TDZ and took production down on 2026-08-24 — see
 * the DO-NOT-RE-ADD block in src/instrumentation.ts. A route module is
 * loaded lazily at request time, entirely outside the boot path, so the
 * same graph is safe here (proven by a production build). Without any
 * caller, abandoned games stay 'active' forever and the server ticker pokes
 * them for days (~68.5k Supabase reads/day per zombie).
 *
 * Honors the IDLE_REAPER_DISABLED kill-switch (SSM-plumbed via infra; any
 * non-empty value other than 0/false disables the sweep)
 * that guarded the old in-process reaper, so ops can still stop a bad sweep
 * without a deploy.
 *
 * The same tick first settles Word Grouping games whose players are all done but whose finish
 * failed (see settleAllWordGroupingGames), so an untimed game ends through the normal completion
 * path with its real result instead of being closed here as `idle_timeout`.
 *
 * It also resumes Word Rush rounds that were closed but never finalized (see
 * resumeAllWordRushFinalizations): after the last round the session is finished, so no client timer
 * runs and nothing else would complete the setter's points or the game finish.
 *
 * It also recovers finished games whose post-finish bookkeeping is still owed (recoverAllFinishBookkeeping).
 *
 * Auth: same `Authorization: Bearer $CRON_SECRET` all cron entrypoints use.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  // Default-deny: an unset CRON_SECRET must close the door, not open it.
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Checked AFTER auth on purpose: flipping the order would turn this into an
  // unauthenticated probe that reports whether the kill-switch is set.
  if (isIdleReaperDisabled()) {
    return NextResponse.json({ ok: true, skipped: 'disabled', closed: 0, failed: 0 })
  }

  const minutes = resolveIdleMinutes()
  try {
    // Before closing idle games: a stranded all-done game must finish normally, not as idle_timeout.
    // A failure here must never turn the idle sweep itself into an error.
    let wordGrouping = { finished: 0, failed: 0 }
    try {
      wordGrouping = await settleAllWordGroupingGames(getSupabaseAdmin())
      if (wordGrouping.finished > 0 || wordGrouping.failed > 0) {
        console.warn(
          `[idle-reaper] word-grouping completions finished=${wordGrouping.finished} failed=${wordGrouping.failed}`
        )
      }
    } catch (err) {
      console.error('[idle-reaper] word-grouping completion sweep failed', err)
    }
    const result = await closeIdleActiveGames(getSupabaseAdmin(), minutes)
    // A failure here must never turn the idle sweep's own result into an error.
    let wordRush = { resumed: 0, failed: 0 }
    try {
      wordRush = await resumeAllWordRushFinalizations(getSupabaseAdmin())
      if (wordRush.resumed > 0 || wordRush.failed > 0) {
        console.warn(`[idle-reaper] word-rush finalizations resumed=${wordRush.resumed} failed=${wordRush.failed}`)
      }
    } catch (err) {
      console.error('[idle-reaper] word-rush finalization sweep failed', err)
    }
    // Finished games whose post-finish bookkeeping is still owed (a runner died or a step failed).
    let bookkeeping = { recovered: 0, pending: 0, failed: 0 }
    try {
      bookkeeping = await recoverAllFinishBookkeeping(getSupabaseAdmin())
      if (bookkeeping.recovered > 0 || bookkeeping.pending > 0 || bookkeeping.failed > 0) {
        console.warn(
          `[idle-reaper] finish bookkeeping recovered=${bookkeeping.recovered} pending=${bookkeeping.pending} failed=${bookkeeping.failed}`
        )
      }
    } catch (err) {
      console.error('[idle-reaper] finish bookkeeping sweep failed', err)
    }
    if (result.closed > 0 || result.failed > 0 || result.raced > 0 || result.errors.length > 0) {
      console.log(
        `[idle-reaper] closed=${result.closed} failed=${result.failed} raced=${result.raced} threshold=${minutes}m${
          result.errors.length ? ` errors=${result.errors.join('; ')}` : ''
        }`
      )
    }
    return NextResponse.json({
      ok: true,
      threshold_minutes: minutes,
      ...result,
      word_grouping_finished: wordGrouping.finished,
      word_rush_finalized: wordRush.resumed,
      finish_bookkeeping_recovered: bookkeeping.recovered,
    })
  } catch (err) {
    // The timer refires in 15 minutes; never 500 into a retry storm.
    console.error('[idle-reaper] cron sweep failed', err)
    return NextResponse.json({ ok: false, closed: 0, failed: 0 }, { status: 200 })
  }
}
