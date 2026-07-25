import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { markGameFinished } from '@/lib/game-finish'
import {
  checkMafiaWinCondition,
  checkJesterWin,
  checkLoversWin,
  resolveMafiaNight,
  resolveMafiaDayVote,
  mafiaRoleTeam,
  auraSeerAlignment,
} from '@/lib/mafia'
import { MAFIA_ROLE_INFO, mafiaRoleEmoji } from '@/components/mafia/mafia-role-info'
import type { MafiaPlayerState, MafiaSession, MafiaPhase } from '@/types'

const KILLER_LABEL: Record<string, string> = {
  mafia_kill: 'The Mafia',
  serial_kill: 'The Serial Killer',
  arson: 'The Arsonist',
  vigilante_kill: 'The Vigilante',
  witch_kill: 'The Witch',
  trap_kill: 'A Trapper trap',
}

/**
 * Runs the actual phase transition (resolution, deaths, win checks, system messages) for a
 * Mafia game. Shared by the timer/host-driven advance route AND the skip-ahead route, so a
 * majority skip vote goes through exactly the same resolution logic as a natural phase
 * expiry — no separate, potentially-divergent copy of the night/vote resolution.
 *
 * Lives outside app/api because Next.js route files may only export GET/POST/etc (and a
 * handful of route config constants) — an extra named export like this one fails the
 * production build's route-type check even though it works fine in dev.
 */
export async function runMafiaAdvance(
  gameId: string,
  opts?: { nextPhase?: MafiaPhase; expectedPhase?: MafiaPhase }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const admin = getSupabaseAdmin()

  // 1. Fetch game, session, player states, and player names (for system-message text)
  const [{ data: game }, { data: mafiaSession }, { data: mafiaPlayerStates }, { data: playersData }] =
    await Promise.all([
      admin
        .from('games')
        .select('host_token, status, timer_seconds, mafia_day_seconds, mafia_voting_seconds')
        .eq('id', gameId)
        .maybeSingle(),
      admin.from('mafia_sessions').select('*').eq('game_id', gameId).maybeSingle(),
      admin.from('mafia_player_states').select('*').eq('game_id', gameId),
      admin.from('players').select('id, name').eq('game_id', gameId),
    ])

  if (!game || !mafiaSession || !mafiaPlayerStates) {
    return { ok: false, error: 'Game or session not initialized', status: 404 }
  }

  const session = mafiaSession as MafiaSession
  const playerStates = mafiaPlayerStates as MafiaPlayerState[]
  const nameById = new Map((playersData ?? []).map((p) => [p.id, p.name]))
  const playerLabel = (playerId: string) => {
    const ps = playerStates.find((p) => p.player_id === playerId)
    const name = nameById.get(playerId) ?? 'Unknown'
    return ps ? `#${ps.seat_number} ${name}` : name
  }
  const roleLabel = (role: string) => `(${MAFIA_ROLE_INFO[role as keyof typeof MAFIA_ROLE_INFO]?.name ?? role})`

  if (game.status === 'finished' || session.phase === 'game_over') {
    return { ok: false, error: 'Game is already finished', status: 400 }
  }

  // If the caller pinned an expected phase (auto-advance race guard), bail when the phase has
  // already moved — another request already advanced it, so this racer must not advance again.
  if (opts?.expectedPhase && session.phase !== opts.expectedPhase) {
    return { ok: true }
  }

  const currentPhase = session.phase
  const phaseOrder: MafiaPhase[] = ['role_reveal', 'night', 'day_report', 'day', 'voting', 'elimination']
  const idxForCurrent = phaseOrder.indexOf(currentPhase)
  // The only legal target from any given phase is the very next one in sequence (or 'night'
  // when wrapping from 'elimination') — an explicit nextPhase that skips ahead would bypass
  // the night/vote resolution branches below (deaths, win checks, system messages). Reject
  // anything else instead of trusting the caller.
  const legalNextPhase: MafiaPhase =
    idxForCurrent === -1 || currentPhase === 'elimination' ? 'night' : phaseOrder[idxForCurrent + 1]
  let targetPhase: MafiaPhase
  if (typeof opts?.nextPhase === 'string') {
    if (!phaseOrder.includes(opts.nextPhase)) {
      return { ok: false, error: 'Invalid phase', status: 400 }
    }
    if (opts.nextPhase !== legalNextPhase) {
      return {
        ok: false,
        error: `Cannot advance from ${currentPhase} to ${opts.nextPhase} — next phase must be ${legalNextPhase}`,
        status: 400,
      }
    }
    targetPhase = opts.nextPhase
  } else {
    targetPhase = legalNextPhase
  }

  const updateFields: Partial<MafiaSession> = {
    phase: targetPhase,
  }

  // Public system-log lines for this transition — persisted as real chat messages (scope
  // 'day', sentinel sender) below, so the full history stays in the feed permanently instead
  // of a single ephemeral "current phase" banner that gets replaced the moment the phase
  // (often a brief 10s one) moves on.
  const systemMessages: string[] = []

  // Player-state/players writes that depend on THIS transition actually being the one that
  // wins the phase CAS below — deferred (not awaited yet) so a losing racer (another request
  // already advanced this phase first) never applies them. Previously these ran unconditionally
  // before the CAS, so a losing racer could still burn a vigilante's one shot, mark an
  // arsonist's douse target, or double-write a death row.
  const pendingEffects: Array<() => PromiseLike<unknown>> = []

  // Define timer durations — Night, Day (discussion), and Voting each have their own dial,
  // matching Wolvesville's separate phase timers rather than one duration doubled for day.
  // Day Report/Elimination are brief announcement beats, not player-input phases — kept
  // short but not razor-thin, so the outcome is readable before the next phase starts.
  let durationSeconds = 30
  if (targetPhase === 'role_reveal') {
    durationSeconds = 10
  } else if (targetPhase === 'night') {
    durationSeconds = game.timer_seconds || 45
  } else if (targetPhase === 'day_report') {
    durationSeconds = 12
  } else if (targetPhase === 'day') {
    durationSeconds = game.mafia_day_seconds || 90
  } else if (targetPhase === 'voting') {
    durationSeconds = game.mafia_voting_seconds || 45
  } else if (targetPhase === 'elimination') {
    durationSeconds = 12
  }

  updateFields.phase_deadline = new Date(Date.now() + durationSeconds * 1000).toISOString()

  // A fresh Discussion/Voting phase starts with a clean skip-ahead tally.
  if (targetPhase === 'day' || targetPhase === 'voting') {
    updateFields.skip_requested_player_ids = []
  }

  const applyLoversOverlay = (winTeam: NonNullable<MafiaSession['winning_team']>) => {
    // Only override the real winner when the two Lovers are the sole survivors — otherwise a
    // Village/Mafia win where the lovers simply happened to both be on the winning side would
    // get reported purely as a Lovers win, losing the actual team result. checkLoversWin only
    // confirms both are alive, not that they're alone, so that check is added here.
    const aliveCount = playerStates.filter((p) => p.is_alive).length
    updateFields.winning_team = checkLoversWin(playerStates) && aliveCount === 2 ? 'lovers' : winTeam
  }

  // 3. Resolve current phase transitions
  if (currentPhase === 'night' && targetPhase === 'day_report') {
    const resolution = resolveMafiaNight(session, playerStates)
    const {
      mafiaTarget,
      doctorTarget,
      auraSeerTarget,
      bodyguardTarget,
      bodyguardSacrificePlayerId,
      bodyguardHitsTaken,
      trackerTarget,
      trackerVisited,
      framedPlayerId,
      serialKillerTarget,
      arsonistIgnited,
      mediumRevivePlayerId,
      cursedConvertedPlayerId,
      wolfCubDiedThisNight,
      deaths,
      witchHealTarget,
      witchKillTarget,
      witchHealActuallySaved,
      littleGirlOpenedEyes,
      littleGirlOutcome,
      littleGirlDetectedMafiaId,
      trapperActivated,
      trapperBlockedPlayerIds,
      trapperKilledMafiaId,
    } = resolution

    updateFields.mafia_target_player_id = mafiaTarget
    updateFields.doctor_target_player_id = doctorTarget
    updateFields.aura_seer_target_player_id = auraSeerTarget
    updateFields.bodyguard_target_player_id = bodyguardTarget
    updateFields.bodyguard_sacrifice_player_id = bodyguardSacrificePlayerId
    updateFields.tracker_visited_player_id = trackerVisited
    updateFields.framed_player_id = framedPlayerId
    updateFields.serial_kill_player_id = serialKillerTarget
    updateFields.arson_ignite = arsonistIgnited
    updateFields.night_kill_player_id = deaths[0]?.playerId ?? null
    updateFields.wolf_cub_revenge_pending = wolfCubDiedThisNight
    updateFields.medium_revive_player_id = mediumRevivePlayerId

    if (cursedConvertedPlayerId) {
      pendingEffects.push(() =>
        admin
          .from('mafia_player_states')
          .update({ role: 'mafia' })
          .eq('game_id', gameId)
          .eq('player_id', cursedConvertedPlayerId)
      )
      const pIndex = playerStates.findIndex((p) => p.player_id === cursedConvertedPlayerId)
      if (pIndex !== -1) playerStates[pIndex].role = 'mafia'
    }

    // Persist bodyguard hits (survives first attack, dies on second)
    if (bodyguardHitsTaken > 0) {
      const bgState = playerStates.find((p) => p.role === 'bodyguard')
      if (bgState) {
        pendingEffects.push(() =>
          admin
            .from('mafia_player_states')
            .update({ bodyguard_hits_taken: bodyguardHitsTaken })
            .eq('game_id', gameId)
            .eq('player_id', bgState.player_id)
        )
        if (!bodyguardSacrificePlayerId && mafiaTarget) {
          systemMessages.push('🛡️ Someone was protected!')
        }
      }
    }

    for (const death of deaths) {
      const deadState = playerStates.find((p) => p.player_id === death.playerId)
      pendingEffects.push(() =>
        admin
          .from('mafia_player_states')
          .update({ is_alive: false, death_day: session.day_number, death_cause: death.cause })
          .eq('game_id', gameId)
          .eq('player_id', death.playerId)
      )
      pendingEffects.push(() =>
        admin.from('players').update({ is_eliminated: true }).eq('game_id', gameId).eq('id', death.playerId)
      )
      const pIndex = playerStates.findIndex((p) => p.player_id === death.playerId)
      if (pIndex !== -1) playerStates[pIndex].is_alive = false
      systemMessages.push(
        `☠️ ${KILLER_LABEL[death.cause] ?? 'Someone'} killed ${playerLabel(death.playerId)}${
          deadState ? ` ${roleLabel(deadState.role)}` : ''
        }`
      )
    }
    if (deaths.length === 0) {
      if (!mafiaTarget) {
        systemMessages.push('😴 No one was attacked last night.')
      } else if (doctorTarget === mafiaTarget) {
        systemMessages.push('🏥 The Doctor saved someone!')
      } else if (witchHealActuallySaved && witchHealTarget === mafiaTarget) {
        systemMessages.push('🧪 The Witch saved someone!')
      } else if (trapperBlockedPlayerIds.includes(mafiaTarget)) {
        systemMessages.push("🪤 A trap foiled the Mafia's attack!")
      } else if (cursedConvertedPlayerId === mafiaTarget) {
        systemMessages.push("☠️ The Mafia's target turned out to be one of their own...")
      } else if (bodyguardHitsTaken === 0) {
        // No known protection blocked it (e.g. the target was immune, like the Arsonist) and
        // the Bodyguard case is already announced above via "🛡️ Someone was protected!".
        systemMessages.push('😴 No one died last night.')
      }
    }

    if (mediumRevivePlayerId) {
      const revivedState = playerStates.find((p) => p.player_id === mediumRevivePlayerId)
      if (revivedState && !revivedState.is_alive) {
        pendingEffects.push(() =>
          admin
            .from('mafia_player_states')
            .update({ is_alive: true, death_day: null, death_cause: null })
            .eq('game_id', gameId)
            .eq('player_id', mediumRevivePlayerId)
        )
        pendingEffects.push(() =>
          admin.from('players').update({ is_eliminated: false }).eq('game_id', gameId).eq('id', mediumRevivePlayerId)
        )
        const medium = playerStates.find((p) => p.role === 'medium' && p.is_alive)
        if (medium) {
          pendingEffects.push(() =>
            admin.from('mafia_player_states').update({ medium_revive_used: true }).eq('id', medium.id)
          )
        }
        const pIndex = playerStates.findIndex((p) => p.player_id === mediumRevivePlayerId)
        if (pIndex !== -1) playerStates[pIndex].is_alive = true
        systemMessages.push(`🔮 The Medium has revived ${playerLabel(mediumRevivePlayerId)}!`)
      }
    }

    // Private result messages — persisted in the day chat feed with target_player_id so
    // only the owning player sees them. Lets players scroll back through history to see
    // what they investigated/tracked on each night.
    const privateMessages: Array<{ target_player_id: string; message: string }> = []

    // Aura Seer — Good/Evil/Unknown, not a plain Village/Mafia binary
    if (auraSeerTarget) {
      const auraSeer = playerStates.find((p) => p.role === 'aura_seer' && p.is_alive)
      const targetState = playerStates.find((p) => p.player_id === auraSeerTarget)
      if (auraSeer && targetState) {
        const framed = framedPlayerId === auraSeerTarget
        const alignment = auraSeerAlignment(targetState.role, framed)
        const alignmentLabel = alignment === 'evil' ? 'EVIL 🔪' : alignment === 'unknown' ? 'UNKNOWN ❓' : 'GOOD 🏘️'
        privateMessages.push({
          target_player_id: auraSeer.player_id,
          message: `🔍 Night ${session.day_number}: ${playerLabel(auraSeerTarget)} is ${alignmentLabel}`,
        })
      }
    }

    // Detective — checks two players for same-team membership (honors the Framer's frame)
    const detective = playerStates.find((p) => p.role === 'detective' && p.is_alive)
    if (detective?.night_action_target_player_id && detective.night_action_target_player_id_2) {
      const targetAId = detective.night_action_target_player_id
      const targetBId = detective.night_action_target_player_id_2
      const targetAState = playerStates.find((p) => p.player_id === targetAId)
      const targetBState = playerStates.find((p) => p.player_id === targetBId)
      if (targetAState && targetBState) {
        const teamOf = (playerId: string, state: MafiaPlayerState) =>
          framedPlayerId === playerId ? 'mafia' : mafiaRoleTeam(state.role)
        const sameTeam = teamOf(targetAId, targetAState) === teamOf(targetBId, targetBState)
        privateMessages.push({
          target_player_id: detective.player_id,
          message: `🕵️ Night ${session.day_number}: ${playerLabel(targetAId)} and ${playerLabel(targetBId)} are ${
            sameTeam ? 'on the SAME team!' : 'NOT on the same team.'
          }`,
        })
      }
    }

    // Tracker
    if (trackerTarget) {
      const tracker = playerStates.find((p) => p.role === 'tracker' && p.is_alive)
      if (tracker) {
        const visitedText = trackerVisited ? `visited ${playerLabel(trackerVisited)}` : 'visited no one'
        privateMessages.push({
          target_player_id: tracker.player_id,
          message: `👣 Night ${session.day_number}: ${playerLabel(trackerTarget)} ${visitedText}`,
        })
      }
    }

    // Doctor
    if (doctorTarget) {
      const doctor = playerStates.find((p) => p.role === 'doctor' && p.is_alive)
      if (doctor) {
        const wasAttacked = doctorTarget === mafiaTarget || doctorTarget === serialKillerTarget
        privateMessages.push({
          target_player_id: doctor.player_id,
          message: wasAttacked
            ? `🏥 Night ${session.day_number}: Your target was attacked — you saved them!`
            : `🏥 Night ${session.day_number}: Your target was not attacked.`,
        })
        if (wasAttacked) {
          privateMessages.push({
            target_player_id: doctorTarget,
            message: `🏥 Night ${session.day_number}: You were saved last night!`,
          })
        }
      }
    }

    // Bodyguard
    if (bodyguardTarget) {
      const bodyguard = playerStates.find((p) => p.role === 'bodyguard')
      if (bodyguard) {
        const bodyguardProtectedTarget = bodyguardTarget === mafiaTarget || bodyguardTarget === serialKillerTarget
        const bodyguardProtectedSelf = bodyguard.player_id === mafiaTarget || bodyguard.player_id === serialKillerTarget

        if (bodyguardSacrificePlayerId) {
          privateMessages.push({
            target_player_id: bodyguard.player_id,
            message: `🛡️ Night ${session.day_number}: Your target was attacked — you took a fatal hit protecting them.`,
          })
        } else if (bodyguardProtectedTarget || bodyguardProtectedSelf) {
          privateMessages.push({
            target_player_id: bodyguard.player_id,
            message: `🛡️ Night ${session.day_number}: You absorbed an attack but survived! One more hit will kill you.`,
          })
        }

        // Tell the protected player they were saved
        if (bodyguardProtectedTarget && bodyguardTarget !== bodyguard.player_id) {
          privateMessages.push({
            target_player_id: bodyguardTarget,
            message: `🛡️ Night ${session.day_number}: You were protected last night — someone took the hit for you.`,
          })
        }
      }
    }

    // Framer
    const framer = playerStates.find((p) => p.role === 'framer' && p.is_alive)
    if (framer?.night_action_target_player_id) {
      privateMessages.push({
        target_player_id: framer.player_id,
        message: `🎭 Night ${session.day_number}: You framed ${playerLabel(framer.night_action_target_player_id)}`,
      })
    }

    // Witch heal potion — only actually consumed if it saved someone from a real attack; a
    // whiffed heal (target wasn't attacked) costs nothing and can be reused another night.
    if (witchHealTarget) {
      const witch = playerStates.find((p) => p.role === 'witch' && p.is_alive)
      if (witch) {
        if (witchHealActuallySaved) {
          pendingEffects.push(() =>
            admin.from('mafia_player_states').update({ witch_heal_used: true }).eq('id', witch.id)
          )
        }
        privateMessages.push({
          target_player_id: witch.player_id,
          message: witchHealActuallySaved
            ? `🧪 Night ${session.day_number}: Your heal potion saved your target! (Potion used up.)`
            : `🧪 Night ${session.day_number}: Your target wasn't attacked — your heal potion is still available.`,
        })
        if (witchHealActuallySaved && witchHealTarget !== witch.player_id) {
          privateMessages.push({
            target_player_id: witchHealTarget,
            message: `🧪 Night ${session.day_number}: You were saved last night!`,
          })
        }
      }
    }

    // Witch kill potion — unblockable poison, once per game (night-1 use blocked at submission)
    if (witchKillTarget) {
      const witch = playerStates.find((p) => p.role === 'witch' && p.is_alive)
      if (witch) {
        pendingEffects.push(() =>
          admin.from('mafia_player_states').update({ witch_kill_used: true }).eq('id', witch.id)
        )
        privateMessages.push({
          target_player_id: witch.player_id,
          message: `🧪 Night ${session.day_number}: Your kill potion struck ${playerLabel(witchKillTarget)}.`,
        })
      }
    }

    // Little Girl — chose to open her eyes: 75% nothing, 20% identifies a Mafia member, 5% caught
    if (littleGirlOpenedEyes) {
      const littleGirl = playerStates.find((p) => p.role === 'little_girl')
      if (littleGirl) {
        if (littleGirlOutcome === 'caught') {
          privateMessages.push({
            target_player_id: littleGirl.player_id,
            message: `🎀 Night ${session.day_number}: The Mafia caught you! You will die tonight.`,
          })
        } else if (littleGirlOutcome === 'detected' && littleGirlDetectedMafiaId) {
          const detected = playerStates.find((p) => p.player_id === littleGirlDetectedMafiaId)
          const roleTag = detected
            ? `${mafiaRoleEmoji(detected.role)} ${MAFIA_ROLE_INFO[detected.role]?.name ?? detected.role}`
            : ''
          privateMessages.push({
            target_player_id: littleGirl.player_id,
            message: `🎀 Night ${session.day_number}: You found a mafia! ${playerLabel(littleGirlDetectedMafiaId)} ${roleTag}`,
          })
        } else {
          privateMessages.push({
            target_player_id: littleGirl.player_id,
            message: `🎀 Night ${session.day_number}: It was too dark. You couldn't see anything tonight.`,
          })
        }
      }
    }

    // Trapper — either set a new trap (accumulates, up to 3) or activated all set traps this
    // night (traps are consumed on activation regardless of whether anything triggered them).
    const trapper = playerStates.find((p) => p.role === 'trapper' && p.is_alive)
    if (trapper) {
      if (trapperActivated) {
        pendingEffects.push(() =>
          admin.from('mafia_player_states').update({ trapper_trap_player_ids: [] }).eq('id', trapper.id)
        )
        if (trapperBlockedPlayerIds.length > 0) {
          const blockedNames = trapperBlockedPlayerIds.map((id) => playerLabel(id)).join(', ')
          privateMessages.push({
            target_player_id: trapper.player_id,
            message: trapperKilledMafiaId
              ? `🪤 Night ${session.day_number}: Your traps caught the Mafia attacking ${blockedNames}! ${playerLabel(trapperKilledMafiaId)} died in the blast.`
              : `🪤 Night ${session.day_number}: Your traps blocked an attack on ${blockedNames} — the attacker survived.`,
          })
        } else {
          privateMessages.push({
            target_player_id: trapper.player_id,
            message: `🪤 Night ${session.day_number}: You activated your traps, but nothing triggered them.`,
          })
        }
      } else if (trapper.night_action_target_player_id && trapper.night_action_target_player_id !== trapper.player_id) {
        const trapCount = trapper.trapper_trap_player_ids?.length ?? 0
        privateMessages.push({
          target_player_id: trapper.player_id,
          message: `🪤 Night ${session.day_number}: You set a trap on ${playerLabel(trapper.night_action_target_player_id)}. (${trapCount}/3 traps set)`,
        })
      }
    }

    if (privateMessages.length > 0) {
      pendingEffects.push(() =>
        admin.from('mafia_chat_messages').insert(
          privateMessages.map((pm) => ({
            game_id: gameId,
            sender_player_id: 'system',
            sender_name: '🔒',
            message: pm.message,
            scope: 'day',
            target_player_id: pm.target_player_id,
          }))
        )
      )
    }

    // Check win condition
    const winTeam = checkMafiaWinCondition(playerStates)
    if (winTeam) {
      updateFields.phase = 'game_over'
      applyLoversOverlay(winTeam)
      updateFields.phase_deadline = null
      pendingEffects.push(() => markGameFinished(admin, gameId))
    }
  } else if (currentPhase === 'voting' && targetPhase === 'elimination') {
    // Resolve Voting on whatever's been cast so far — this runs identically whether Voting
    // ended by timeout or by a majority Skip Voting request; skipping just ends the phase
    // early, it doesn't override or discard the votes actually cast.
    const votedPlayerId = resolveMafiaDayVote(playerStates)
    updateFields.vote_result_player_id = votedPlayerId

    if (votedPlayerId) {
      const votedState = playerStates.find((p) => p.player_id === votedPlayerId)
      // Wolf Cub's revenge triggers on death by any cause, not just a night kill — a lynched
      // Cub grants the mafia a bonus kill the following night too.
      if (votedState?.role === 'wolf_cub') {
        updateFields.wolf_cub_revenge_pending = true
      }
      pendingEffects.push(() =>
        admin
          .from('mafia_player_states')
          .update({
            is_alive: false,
            death_day: session.day_number,
            death_cause: 'village_vote',
          })
          .eq('game_id', gameId)
          .eq('player_id', votedPlayerId)
      )
      pendingEffects.push(() =>
        admin.from('players').update({ is_eliminated: true }).eq('game_id', gameId).eq('id', votedPlayerId)
      )

      // Update local state for win check
      const pIndex = playerStates.findIndex((p) => p.player_id === votedPlayerId)
      if (pIndex !== -1) {
        playerStates[pIndex].is_alive = false
      }
      systemMessages.push(
        `⚖️ The Village killed ${playerLabel(votedPlayerId)}${votedState ? ` ${roleLabel(votedState.role)}` : ''}`
      )
    } else {
      systemMessages.push('🤝 No majority reached — nobody was eliminated.')
    }

    // Jester wins outright if they were just lynched, ahead of the normal team win check
    if (checkJesterWin(votedPlayerId, playerStates)) {
      updateFields.phase = 'game_over'
      updateFields.winning_team = 'jester'
      updateFields.phase_deadline = null
      pendingEffects.push(() => markGameFinished(admin, gameId))
    } else {
      const winTeam = checkMafiaWinCondition(playerStates)
      if (winTeam) {
        updateFields.phase = 'game_over'
        applyLoversOverlay(winTeam)
        updateFields.phase_deadline = null
        pendingEffects.push(() => markGameFinished(admin, gameId))
      }
    }
  } else if (targetPhase === 'night' && currentPhase !== 'role_reveal') {
    // Moving to next day cycle night. Reset every per-night resolution column back to null —
    // these previously only got set once (on the night → day_report transition) and were
    // never cleared, so a private "you saved them" / "you framed X" message from night 1
    // would keep showing on every subsequent day for the rest of the game.
    updateFields.mafia_target_player_id = null
    updateFields.doctor_target_player_id = null
    updateFields.aura_seer_target_player_id = null
    updateFields.bodyguard_target_player_id = null
    updateFields.bodyguard_sacrifice_player_id = null
    updateFields.tracker_visited_player_id = null
    updateFields.framed_player_id = null
    updateFields.serial_kill_player_id = null
    updateFields.arson_ignite = false
    updateFields.night_kill_player_id = null
    updateFields.day_number = session.day_number + 1
    updateFields.medium_revive_player_id = null
    updateFields.vigilante_day_kill_player_id = null
    updateFields.vigilante_reveal_player_id = null
    // Arsonist's douse targets (from the night just resolved) become permanently doused.
    const arsonist = playerStates.find((p) => p.role === 'arsonist' && p.is_alive)
    if (arsonist && arsonist.night_action_target_player_id !== arsonist.player_id) {
      const douseIds = [arsonist.night_action_target_player_id, arsonist.night_action_target_player_id_2].filter(
        (id): id is string => !!id && id !== arsonist.player_id
      )
      for (const douseId of douseIds) {
        pendingEffects.push(() =>
          admin
            .from('mafia_player_states')
            .update({ doused_by_arsonist: true })
            .eq('game_id', gameId)
            .eq('player_id', douseId)
        )
      }
    }
    // Clear all targets and votes in player states
    pendingEffects.push(() =>
      admin
        .from('mafia_player_states')
        .update({
          night_action_target_player_id: null,
          night_action_target_player_id_2: null,
          day_vote_target_player_id: null,
        })
        .eq('game_id', gameId)
    )
  } else if (targetPhase === 'night' && currentPhase === 'role_reveal') {
    // Moving from role reveal to night 1 (keep day_number = 1)
    pendingEffects.push(() =>
      admin
        .from('mafia_player_states')
        .update({
          night_action_target_player_id: null,
          day_vote_target_player_id: null,
        })
        .eq('game_id', gameId)
    )
  }

  if (targetPhase === 'day' && currentPhase === 'day_report') {
    systemMessages.push(`☀️ Day ${session.day_number} has started. Get ready to discuss!`)
  } else if (targetPhase === 'voting' && currentPhase === 'day') {
    const aliveCount = playerStates.filter((p) => p.is_alive).length
    const votesRequired = Math.floor(aliveCount / 2) + 1
    systemMessages.push(`🗳️ Get ready to vote! (${votesRequired} vote${votesRequired === 1 ? '' : 's'} required)`)
  }

  // 4. Save session updates — guard with current phase to prevent double-processing. Only the
  // request that actually flips this row (non-empty result) may go on to apply the dependent
  // player-state writes and system messages queued above — a losing racer stops here.
  const { error: sessionError, data: updatedSession } = await admin
    .from('mafia_sessions')
    .update(updateFields)
    .eq('game_id', gameId)
    .eq('phase', currentPhase)
    .select('phase')

  if (sessionError) {
    console.error('Failed to advance phase:', sessionError)
    return { ok: false, error: 'Failed to update game phase', status: 500 }
  }

  if (!updatedSession || updatedSession.length === 0) {
    // Another request already advanced this phase — treat as success, and skip logging (the
    // request that actually applied the transition already did).
    return { ok: true }
  }

  await Promise.all(pendingEffects.map((run) => run()))

  if (systemMessages.length > 0) {
    await admin.from('mafia_chat_messages').insert(
      systemMessages.map((message) => ({
        game_id: gameId,
        sender_player_id: 'system',
        sender_name: '📢',
        message,
        scope: 'day',
      }))
    )
  }

  return { ok: true }
}
