import type { GameType, Participant, Round, Vote } from '@/types'
import { participantsInGenderRounds, genderLabel } from '@/lib/participants'
import { isPairGame } from '@/lib/game-types'
import { flagForParticipant, getCategoryMeta, getVoteCategories } from '@/lib/vote-stats'
import { VoteCountStat } from '@/components/VoteResults'
import { Avatar } from '@/components/Avatar'
import { filterParticipantsInRounds } from '@/lib/utils'

type TallyRow = {
  id: string
  name: string
  photo_url: string | null
  kissCount: number
  marryCount: number
  killCount: number
}

function buildTally(participants: Participant[], votes: Vote[], gameType?: GameType | string): TallyRow[] {
  const pairGame = isPairGame(gameType)
  return participants.map((p) => ({
    id: p.id,
    name: p.name,
    photo_url: p.photo_url ?? null,
    kissCount: pairGame
      ? votes.filter((v) => flagForParticipant(v, p.id) === 'kiss').length
      : votes.filter((v) => v.kiss_participant_id === p.id).length,
    marryCount: votes.filter((v) => v.marry_participant_id === p.id).length,
    killCount: pairGame
      ? votes.filter((v) => flagForParticipant(v, p.id) === 'kill').length
      : votes.filter((v) => v.kill_participant_id === p.id).length,
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
  TopCard: (props: {
    emoji: string
    label: string
    name?: string
    count?: number
    accentColor: string
  }) => React.ReactNode
}) {
  const sections = [
    { gender: 'male' as const, title: "Men's leaderboard" },
    { gender: 'female' as const, title: "Women's leaderboard" },
  ]
    .map(({ gender, title }) => {
      const group = participantsInGenderRounds(participants, rounds, gender)
      const tally = buildTally(group, votes, gameType)
      return { gender, title, tally, group }
    })
    .filter((s) => s.group.length > 0)

  if (sections.length === 0) return null

  return (
    <div className="space-y-6">
      {sections.map(({ gender, title, tally }) => {
        const categories = getVoteCategories(gameType)
        const topByCategory = categories.map((category) => {
          const key = category === 'kiss' ? 'kissCount' : category === 'marry' ? 'marryCount' : 'killCount'
          const meta = getCategoryMeta(gameType, category)
          const top = topBy(tally, key)
          const count = top ? top[key] : undefined
          return { meta, name: top?.name, count }
        })
        return (
          <div key={gender}>
            <h2 className="text-muted text-xs uppercase tracking-wider mb-3">{title}</h2>
            <div className={`grid gap-3 ${categories.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {topByCategory.map(({ meta, name, count }) => (
                <TopCard
                  key={meta.label}
                  emoji={meta.emoji}
                  label={meta.leaderboardLabel}
                  name={name}
                  count={count}
                  accentColor={meta.color}
                />
              ))}
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
  const sections = [
    { gender: 'male' as const, title: 'Men' },
    { gender: 'female' as const, title: 'Women' },
  ]
    .map(({ gender, title }) => {
      const group = participantsInGenderRounds(participants, rounds, gender)
      const tally = buildTally(group, votes, gameType)
      return { gender, title, tally }
    })
    .filter((s) => s.tally.length > 0)

  if (sections.length === 0) return null

  const pairGame = isPairGame(gameType)

  return (
    <div className="space-y-6">
      {sections.map(({ gender, title, tally }) => {
        const categories = getVoteCategories(gameType)
        const maxByCategory = categories.map((category) => {
          const key = category === 'kiss' ? 'kissCount' : category === 'marry' ? 'marryCount' : 'killCount'
          return Math.max(1, ...tally.map((p) => p[key]))
        })
        return (
          <div key={gender}>
            <h2 className="text-muted text-xs uppercase tracking-wider mb-3">{title}</h2>
            <div className="space-y-3">
              {tally
                .sort((a, b) => b.kissCount + b.marryCount + b.killCount - (a.kissCount + a.marryCount + a.killCount))
                .map((p) => (
                  <div key={p.id} className="glass-card p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Avatar name={p.name} photoUrl={p.photo_url} size="sm" />
                      <p className="font-bold text-body text-lg">{p.name}</p>
                      <span className="ml-auto text-[10px] uppercase tracking-wider text-faint">
                        {genderLabel(gender)}
                      </span>
                    </div>
                    <div className={`grid gap-2 ${categories.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                      {categories.map((category, index) => {
                        const meta = getCategoryMeta(gameType, category)
                        const key =
                          category === 'kiss' ? 'kissCount' : category === 'marry' ? 'marryCount' : 'killCount'
                        const count = p[key]
                        const max = maxByCategory[index]
                        const isWinner = pairGame
                          ? category === 'kiss'
                            ? p.kissCount > p.killCount
                            : p.killCount > p.kissCount
                          : count === max && max > 0
                        return (
                          <VoteCountStat
                            key={category}
                            emoji={meta.emoji}
                            label={meta.label}
                            count={count}
                            max={max}
                            color={meta.color}
                            isWinner={isWinner}
                          />
                        )
                      })}
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

/** Names-only games — one leaderboard for everyone who appeared in rounds. */
export function FinalOverallLeaderboards({
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
  TopCard: (props: {
    emoji: string
    label: string
    name?: string
    count?: number
    accentColor: string
  }) => React.ReactNode
}) {
  const group = filterParticipantsInRounds(participants, rounds)
  if (group.length === 0) return null

  const tally = buildTally(group, votes, gameType)
  const categories = getVoteCategories(gameType)
  const topByCategory = categories.map((category) => {
    const key = category === 'kiss' ? 'kissCount' : category === 'marry' ? 'marryCount' : 'killCount'
    const meta = getCategoryMeta(gameType, category)
    const top = topBy(tally, key)
    const count = top ? top[key] : undefined
    return { meta, name: top?.name, count }
  })

  return (
    <div>
      <h2 className="text-muted text-xs uppercase tracking-wider mb-3">Final leaderboard</h2>
      <div className={`grid gap-3 ${categories.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {topByCategory.map(({ meta, name, count }) => (
          <TopCard
            key={meta.label}
            emoji={meta.emoji}
            label={meta.leaderboardLabel}
            name={name}
            count={count}
            accentColor={meta.color}
          />
        ))}
      </div>
    </div>
  )
}

export function FinalOverallBreakdown({
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
  const group = filterParticipantsInRounds(participants, rounds)
  if (group.length === 0) return null

  const tally = buildTally(group, votes, gameType)
  const pairGame = isPairGame(gameType)
  const categories = getVoteCategories(gameType)
  const maxByCategory = categories.map((category) => {
    const key = category === 'kiss' ? 'kissCount' : category === 'marry' ? 'marryCount' : 'killCount'
    return Math.max(1, ...tally.map((p) => p[key]))
  })

  return (
    <div>
      <h2 className="text-muted text-xs uppercase tracking-wider mb-3">Everyone</h2>
      <div className="space-y-3">
        {tally
          .sort((a, b) => b.kissCount + b.marryCount + b.killCount - (a.kissCount + a.marryCount + a.killCount))
          .map((p) => (
            <div key={p.id} className="glass-card p-4">
              <div className="flex items-center gap-3 mb-3">
                <Avatar name={p.name} photoUrl={p.photo_url} size="sm" />
                <p className="font-bold text-body text-lg">{p.name}</p>
              </div>
              <div className={`grid gap-2 ${categories.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {categories.map((category, index) => {
                  const meta = getCategoryMeta(gameType, category)
                  const key = category === 'kiss' ? 'kissCount' : category === 'marry' ? 'marryCount' : 'killCount'
                  const count = p[key]
                  const max = maxByCategory[index]
                  const isWinner = pairGame
                    ? category === 'kiss'
                      ? p.kissCount > p.killCount
                      : p.killCount > p.kissCount
                    : count === max && max > 0
                  return (
                    <VoteCountStat
                      key={category}
                      emoji={meta.emoji}
                      label={meta.label}
                      count={count}
                      max={max}
                      color={meta.color}
                      isWinner={isWinner}
                    />
                  )
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
