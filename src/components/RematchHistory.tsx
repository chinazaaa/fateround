'use client'

import { useEffect, useState } from 'react'
import { isPairGame, parseGameType } from '@/lib/game-types'
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
  const pairGame = isPairGame(gameType)
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
}: {
  gameId: string
  currentParticipants: Participant[]
  currentVotes: Vote[]
  gameType: string
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

  if (loading || snapshots.length === 0) return null

  const lastSnapshot = snapshots[snapshots.length - 1]
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
    .filter(Boolean) as { name: string; curr: (typeof currentTally)[string]; prev: (typeof currentTally)[string] }[]

  if (comparisons.length === 0) return null

  const pair = isPairGame(parseGameType(gameType))

  return (
    <div className="surface-inset border border-theme rounded-2xl p-4 space-y-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between"
      >
        <p className="text-muted text-xs uppercase tracking-wider">Rematch History (Session {snapshots.length + 1})</p>
        <span className="text-faint text-xs">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="space-y-2">
          <p className="text-faint text-[10px]">Compared to session {snapshots.length}</p>
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
