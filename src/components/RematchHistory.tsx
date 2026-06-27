'use client'

import { useEffect, useState } from 'react'
import { isBinaryPeoplePollGame, isMostLikelyTo, isCustomGame, parseGameType } from '@/lib/game-types'
import type { Participant, Vote } from '@/types'

interface SnapshotData {
  votes: Vote[]
  participants: Participant[]
  gameType: string
}

interface Snapshot {
  id: string
  session_number: number
  snapshot_data: SnapshotData
}

function tallyFromVotes(
  participants: Participant[],
  votes: Vote[],
  gameType: string
): Record<string, { name: string; smash: number; marry: number; kill: number }> {
  const pairGame = isBinaryPeoplePollGame(gameType)
  const result: Record<string, { name: string; smash: number; marry: number; kill: number }> = {}
  for (const p of participants) {
    result[p.id] = { name: p.name, smash: 0, marry: 0, kill: 0 }
  }
  for (const v of votes) {
    if (pairGame && v.pair_assignments) {
      for (const [pid, flag] of Object.entries(v.pair_assignments)) {
        if (result[pid]) {
          if (flag === 'kiss') result[pid].smash++
          else if (flag === 'kill') result[pid].kill++
        }
      }
    } else {
      if (v.kiss_participant_id && result[v.kiss_participant_id]) result[v.kiss_participant_id].smash++
      if (v.marry_participant_id && result[v.marry_participant_id]) result[v.marry_participant_id].marry++
      if (v.kill_participant_id && result[v.kill_participant_id]) result[v.kill_participant_id].kill++
    }
  }
  return result
}

function tallyMltFromVotes(
  votes: Vote[],
  participants: Participant[]
): Record<string, { name: string; votes: number }> {
  const result: Record<string, { name: string; votes: number }> = {}
  for (const p of participants) {
    result[p.id] = { name: p.name, votes: 0 }
  }
  for (const v of votes) {
    const tid = v.target_participant_id ?? v.target_player_id
    if (tid && result[tid]) {
      result[tid].votes++
    }
  }
  return result
}

function tallyCustomFromVotes(
  votes: Vote[],
  participants: Participant[],
  slotKeys: string[]
): Record<string, { name: string; counts: Record<string, number> }> {
  const result: Record<string, { name: string; counts: Record<string, number> }> = {}
  for (const p of participants) {
    const counts: Record<string, number> = {}
    for (const key of slotKeys) counts[key] = 0
    result[p.id] = { name: p.name, counts }
  }
  for (const v of votes) {
    if (v.pair_assignments) {
      for (const [pid, slot] of Object.entries(v.pair_assignments)) {
        if (result[pid] && typeof slot === 'string' && result[pid].counts[slot] !== undefined) {
          result[pid].counts[slot]++
        }
      }
    }
  }
  return result
}

function DeltaBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  const diff = current - previous
  if (diff === 0)
    return (
      <span className="text-faint text-xs">
        {label}: {current}
      </span>
    )
  const color = diff > 0 ? 'text-green-400' : 'text-red-400'
  const arrow = diff > 0 ? '↑' : '↓'
  return (
    <span className={`text-xs ${color}`}>
      {label}: {current} {arrow}
      {Math.abs(diff)}
    </span>
  )
}

export function RematchHistory({
  gameId,
  currentParticipants,
  currentVotes,
  gameType,
  customSlots,
}: {
  gameId: string
  currentParticipants: Participant[]
  currentVotes: Vote[]
  gameType: string
  customSlots?: { key: string; label: string }[]
}) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/game-snapshots?gameId=${gameId}`)
        if (res.ok) {
          const { snapshots: data } = await res.json()
          setSnapshots(data ?? [])
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [gameId])

  if (loading || snapshots.length < 2) return null

  // Compare against previous session, not current (last snapshot is current session's data)
  const lastSnapshot = snapshots[snapshots.length - 2]
  const parsedType = parseGameType(gameType)

  if (isMostLikelyTo(parsedType)) {
    const prevTally = tallyMltFromVotes(lastSnapshot.snapshot_data.votes, lastSnapshot.snapshot_data.participants)
    const currentTally = tallyMltFromVotes(currentVotes, currentParticipants)

    const comparisons = currentParticipants
      .map((p) => {
        const curr = currentTally[p.id]
        const prev = Object.values(prevTally).find((pp) => pp.name.toLowerCase() === p.name.toLowerCase())
        if (!curr || !prev) return null
        if (curr.votes === prev.votes) return null
        return { name: p.name, curr, prev }
      })
      .filter(Boolean) as { name: string; curr: { votes: number }; prev: { votes: number } }[]

    if (comparisons.length === 0) return null

    return (
      <div className="surface-inset border border-theme rounded-2xl p-4 space-y-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="w-full flex items-center justify-between"
        >
          <p className="text-muted text-xs uppercase tracking-wider">Rematch History (Session {snapshots.length})</p>
          <span className="text-faint text-xs">{expanded ? '−' : '+'}</span>
        </button>
        {expanded && (
          <div className="space-y-2">
            <p className="text-faint text-[10px]">Compared to session {snapshots.length - 1}</p>
            {comparisons.map((c) => (
              <div key={c.name} className="glass-card p-3 space-y-1">
                <p className="font-bold text-body text-sm">{c.name}</p>
                <div className="flex flex-wrap gap-3">
                  <DeltaBadge current={c.curr.votes} previous={c.prev.votes} label="Votes" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (isCustomGame(parsedType) && customSlots) {
    const slotKeys = customSlots.map((s) => s.key)
    const prevTally = tallyCustomFromVotes(
      lastSnapshot.snapshot_data.votes,
      lastSnapshot.snapshot_data.participants,
      slotKeys
    )
    const currentTally = tallyCustomFromVotes(currentVotes, currentParticipants, slotKeys)

    const comparisons = currentParticipants
      .map((p) => {
        const curr = currentTally[p.id]
        const prev = Object.values(prevTally).find((pp) => pp.name.toLowerCase() === p.name.toLowerCase())
        if (!curr || !prev) return null
        const changed = slotKeys.some((k) => (curr.counts[k] ?? 0) !== (prev.counts[k] ?? 0))
        if (!changed) return null
        return { name: p.name, curr, prev }
      })
      .filter(Boolean) as {
      name: string
      curr: { counts: Record<string, number> }
      prev: { counts: Record<string, number> }
    }[]

    if (comparisons.length === 0) return null

    return (
      <div className="surface-inset border border-theme rounded-2xl p-4 space-y-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="w-full flex items-center justify-between"
        >
          <p className="text-muted text-xs uppercase tracking-wider">Rematch History (Session {snapshots.length})</p>
          <span className="text-faint text-xs">{expanded ? '−' : '+'}</span>
        </button>
        {expanded && (
          <div className="space-y-2">
            <p className="text-faint text-[10px]">Compared to session {snapshots.length - 1}</p>
            {comparisons.map((c) => (
              <div key={c.name} className="glass-card p-3 space-y-1">
                <p className="font-bold text-body text-sm">{c.name}</p>
                <div className="flex flex-wrap gap-3">
                  {customSlots.map((slot) => (
                    <DeltaBadge
                      key={slot.key}
                      current={c.curr.counts[slot.key] ?? 0}
                      previous={c.prev.counts[slot.key] ?? 0}
                      label={slot.label}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Trio and pair games (existing logic)
  const prevTally = tallyFromVotes(
    lastSnapshot.snapshot_data.participants,
    lastSnapshot.snapshot_data.votes,
    lastSnapshot.snapshot_data.gameType
  )
  const currentTally = tallyFromVotes(currentParticipants, currentVotes, gameType)

  const comparisons = currentParticipants
    .map((p) => {
      const curr = currentTally[p.id]
      const prev = Object.values(prevTally).find((pp) => pp.name.toLowerCase() === p.name.toLowerCase())
      if (!curr || !prev) return null
      const changed = curr.smash !== prev.smash || curr.marry !== prev.marry || curr.kill !== prev.kill
      return changed ? { name: p.name, curr, prev } : null
    })
    .filter(Boolean) as {
    name: string
    curr: (typeof currentTally)[string]
    prev: (typeof currentTally)[string]
  }[]

  if (comparisons.length === 0) return null

  const pair = isBinaryPeoplePollGame(parsedType)

  return (
    <div className="surface-inset border border-theme rounded-2xl p-4 space-y-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between"
      >
        <p className="text-muted text-xs uppercase tracking-wider">Rematch History (Session {snapshots.length})</p>
        <span className="text-faint text-xs">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="space-y-2">
          <p className="text-faint text-[10px]">Compared to session {snapshots.length - 1}</p>
          {comparisons.map((c) => (
            <div key={c.name} className="glass-card p-3 space-y-1">
              <p className="font-bold text-body text-sm">{c.name}</p>
              <div className="flex flex-wrap gap-3">
                <DeltaBadge current={c.curr.smash} previous={c.prev.smash} label="Smash" />
                {!pair && <DeltaBadge current={c.curr.marry} previous={c.prev.marry} label="Marry" />}
                <DeltaBadge current={c.curr.kill} previous={c.prev.kill} label="Kill" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
