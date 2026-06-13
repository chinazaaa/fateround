import type { GameType, Participant, Round, Vote } from '@/types'
import { participantsInGenderRounds, genderLabel } from '@/lib/participants'
import { getCategoryMeta } from '@/lib/vote-stats'
import { VoteCountStat } from '@/components/VoteResults'
import { getInitial } from '@/lib/utils'

type TallyRow = {
  id: string
  name: string
  kissCount: number
  marryCount: number
  killCount: number
}

function buildTally(participants: Participant[], votes: Vote[]): TallyRow[] {
  return participants.map((p) => ({
    id: p.id,
    name: p.name,
    kissCount: votes.filter((v) => v.kiss_participant_id === p.id).length,
    marryCount: votes.filter((v) => v.marry_participant_id === p.id).length,
    killCount: votes.filter((v) => v.kill_participant_id === p.id).length,
  }))
}

function topBy(rows: TallyRow[], key: 'kissCount' | 'marryCount' | 'killCount') {
  if (rows.length === 0) return undefined
  return [...rows].sort((a, b) => b[key] - a[key])[0]
}

export function FinalGenderLeaderboards({
  gameType,
  participants,
  rounds,
  votes,
  TopCard,
}: {
  gameType?: GameType | string
  participants: Participant[]
  rounds: Round[]
  votes: Vote[]
  TopCard: (props: { emoji: string; label: string; name?: string; count?: number; accentColor: string }) => React.ReactNode
}) {
  const sections = ([
    { gender: 'male' as const, title: "Men's leaderboard" },
    { gender: 'female' as const, title: "Women's leaderboard" },
  ]).map(({ gender, title }) => {
    const group = participantsInGenderRounds(participants, rounds, gender)
    const tally = buildTally(group, votes)
    return { gender, title, tally, group }
  }).filter((s) => s.group.length > 0)

  if (sections.length === 0) return null

  return (
    <div className="space-y-6">
      {sections.map(({ gender, title, tally }) => {
        const mostSmashed = topBy(tally, 'kissCount')
        const mostMarried = topBy(tally, 'marryCount')
        const mostKilled = topBy(tally, 'killCount')
        const kissMeta = getCategoryMeta(gameType, 'kiss')
        const marryMeta = getCategoryMeta(gameType, 'marry')
        const smashMeta = getCategoryMeta(gameType, 'smash')
        return (
          <div key={gender}>
            <h2 className="text-muted text-xs uppercase tracking-wider mb-3">{title}</h2>
            <div className="grid grid-cols-3 gap-3">
              <TopCard emoji={kissMeta.emoji} label={kissMeta.leaderboardLabel} name={mostSmashed?.name} count={mostSmashed?.kissCount} accentColor={kissMeta.color} />
              <TopCard emoji={marryMeta.emoji} label={marryMeta.leaderboardLabel} name={mostMarried?.name} count={mostMarried?.marryCount} accentColor={marryMeta.color} />
              <TopCard emoji={smashMeta.emoji} label={smashMeta.leaderboardLabel} name={mostKilled?.name} count={mostKilled?.killCount} accentColor={smashMeta.color} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function FinalGenderBreakdown({
  gameType,
  participants,
  rounds,
  votes,
}: {
  gameType?: GameType | string
  participants: Participant[]
  rounds: Round[]
  votes: Vote[]
}) {
  const sections = ([
    { gender: 'male' as const, title: 'Men' },
    { gender: 'female' as const, title: 'Women' },
  ]).map(({ gender, title }) => {
    const group = participantsInGenderRounds(participants, rounds, gender)
    const tally = buildTally(group, votes)
    return { gender, title, tally }
  }).filter((s) => s.tally.length > 0)

  if (sections.length === 0) return null

  return (
    <div className="space-y-6">
      {sections.map(({ gender, title, tally }) => {
        const maxSmash = Math.max(1, ...tally.map((p) => p.kissCount))
        const maxMarry = Math.max(1, ...tally.map((p) => p.marryCount))
        const maxKill = Math.max(1, ...tally.map((p) => p.killCount))
        const kissMeta = getCategoryMeta(gameType, 'kiss')
        const marryMeta = getCategoryMeta(gameType, 'marry')
        const smashMeta = getCategoryMeta(gameType, 'smash')
        return (
          <div key={gender}>
            <h2 className="text-muted text-xs uppercase tracking-wider mb-3">{title}</h2>
            <div className="space-y-3">
              {tally
                .sort((a, b) => (b.kissCount + b.marryCount + b.killCount) - (a.kissCount + a.marryCount + a.killCount))
                .map((p) => (
                  <div key={p.id} className="glass-card p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="avatar w-9 h-9 shrink-0">{getInitial(p.name)}</div>
                      <p className="text-white font-bold text-lg">{p.name}</p>
                      <span className="ml-auto text-[10px] uppercase tracking-wider text-faint">{genderLabel(gender)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <VoteCountStat emoji={kissMeta.emoji} label={kissMeta.label} count={p.kissCount} max={maxSmash} color={kissMeta.color} isWinner={p.kissCount === maxSmash && maxSmash > 0} />
                      <VoteCountStat emoji={marryMeta.emoji} label={marryMeta.label} count={p.marryCount} max={maxMarry} color={marryMeta.color} isWinner={p.marryCount === maxMarry && maxMarry > 0} />
                      <VoteCountStat emoji={smashMeta.emoji} label={smashMeta.label} count={p.killCount} max={maxKill} color={smashMeta.color} isWinner={p.killCount === maxKill && maxKill > 0} />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
