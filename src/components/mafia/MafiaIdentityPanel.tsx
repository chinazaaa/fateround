'use client'

import type { MafiaMyState } from '@/types'

interface MafiaIdentityPanelProps {
  myState: MafiaMyState | null
}

/**
 * Dynamic private results only (investigation/tracking results, lover status,
 * bodyguard/vigilante/framer/cupid outcomes). Mafia teammates are shown via the shared mafia
 * symbol on their tiles in MafiaPlayersGrid instead of a name list here — Wolvesville doesn't
 * spell teammates out in a text panel, it marks their tile. Your own role/team card lives on
 * your own tile too, and the secret chat is rendered by the caller (MafiaPlayerView) so it can
 * sit in the right-hand column on desktop, matching Town Discussion.
 */
export function MafiaIdentityPanel({ myState }: MafiaIdentityPanelProps) {
  const myRole = myState?.role

  const hasDynamicInfo =
    !!myState &&
    (myState.isLover ||
      !!myState.detectiveResult ||
      !!myState.trackerResult ||
      (myRole === 'bodyguard' && !!myState.bodyguardLastOutcome && myState.bodyguardLastOutcome !== 'no_attack') ||
      (myRole === 'doctor' && !!myState.doctorLastOutcome && myState.doctorLastOutcome !== 'no_attack') ||
      myRole === 'vigilante' ||
      (myRole === 'framer' && !!myState.framerLastTargetName) ||
      (myRole === 'cupid' && !!myState.cupidLinkedNames))

  if (!hasDynamicInfo) return null

  return (
    <div className="space-y-3">
      {myState?.isLover && (
        <div className="glass-card border border-pink-500/20 rounded-2xl p-3 text-left">
          <p className="text-[10px] font-bold text-pink-400 uppercase tracking-wider mb-1">💘 In Love</p>
          <p className="text-sm text-[var(--foreground)]">
            You are linked with <strong>{myState.loverPartnerName ?? 'someone'}</strong>. You win together if you both
            survive.
          </p>
        </div>
      )}

      {myState?.detectiveResult && (
        <div className="glass-card border border-[var(--border)] rounded-2xl p-3 text-left">
          <p className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider mb-1">Investigation</p>
          <p className="text-sm">
            <strong className="text-[var(--foreground)]">{myState.detectiveResult.targetName}</strong>
            {' is '}
            <span
              className={
                myState.detectiveResult.alignment === 'mafia' ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'
              }
            >
              {myState.detectiveResult.alignment === 'mafia' ? 'MAFIA 🔪' : 'INNOCENT 🏘️'}
            </span>
          </p>
        </div>
      )}

      {myState?.trackerResult && (
        <div className="glass-card border border-[var(--border)] rounded-2xl p-3 text-left">
          <p className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider mb-1">Tracking Result</p>
          <p className="text-sm text-[var(--foreground)]">
            <strong>{myState.trackerResult.targetName}</strong>{' '}
            {myState.trackerResult.visitedName
              ? `visited ${myState.trackerResult.visitedName} last night.`
              : 'visited no one last night.'}
          </p>
        </div>
      )}

      {myRole === 'bodyguard' && myState?.bodyguardLastOutcome && myState.bodyguardLastOutcome !== 'no_attack' && (
        <div className="glass-card border border-[var(--border)] rounded-2xl p-3 text-left">
          <p className="text-sm text-[var(--foreground)]">
            {myState.bodyguardLastOutcome === 'sacrificed'
              ? 'You took a second hit and died protecting your target.'
              : 'You absorbed an attack last night but survived! One more hit will kill you.'}
          </p>
        </div>
      )}

      {myRole === 'doctor' && myState?.doctorLastOutcome && myState.doctorLastOutcome !== 'no_attack' && (
        <div className="glass-card border border-[var(--border)] rounded-2xl p-3 text-left">
          <p className="text-sm text-[var(--foreground)]">Your target was attacked and you saved them last night.</p>
        </div>
      )}

      {myRole === 'vigilante' && (
        <div className="glass-card border border-[var(--border)] rounded-2xl p-3 text-left">
          <p className="text-sm text-[var(--foreground)]">
            Shots remaining: <strong>{myState?.vigilanteShotsRemaining ?? 1}</strong>
          </p>
        </div>
      )}

      {myRole === 'framer' && myState?.framerLastTargetName && (
        <div className="glass-card border border-[var(--border)] rounded-2xl p-3 text-left">
          <p className="text-sm text-[var(--foreground)]">
            You framed <strong>{myState.framerLastTargetName}</strong> last night.
          </p>
        </div>
      )}

      {myRole === 'cupid' && myState?.cupidLinkedNames && (
        <div className="glass-card border border-pink-500/20 rounded-2xl p-3 text-left">
          <p className="text-[10px] font-bold text-pink-400 uppercase tracking-wider mb-1">💘 Lovers Linked</p>
          <p className="text-sm text-[var(--foreground)]">
            {myState.cupidLinkedNames[0]} &amp; {myState.cupidLinkedNames[1]}
          </p>
        </div>
      )}
    </div>
  )
}
