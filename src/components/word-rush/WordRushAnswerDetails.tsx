import type { Player, WordRushAnswer, WordRushPlayer } from '@/types'

export function WordRushPlayerAnswerDetails({
  answers,
  emptyLabel = 'No correct words',
}: {
  answers: Pick<WordRushAnswer, 'text' | 'round' | 'start_letter' | 'end_letter' | 'correct'>[]
  emptyLabel?: string
}) {
  const correct = answers
    .filter((a) => a.correct)
    .sort((a, b) => a.round - b.round || a.text.localeCompare(b.text))

  if (correct.length === 0) {
    return <p className="text-faint text-sm">{emptyLabel}</p>
  }

  return (
    <ul className="space-y-1.5">
      {correct.map((answer, index) => (
        <li key={`${answer.round}-${answer.text}-${index}`} className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-body">{answer.text}</span>
          <span className="text-faint shrink-0 text-xs">
            R{answer.round} · {answer.start_letter.toUpperCase()}…{answer.end_letter.toUpperCase()}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function WordRushTeamMemberBreakdown({
  team,
  players,
  teamRows,
  answers,
}: {
  team: number
  players: Player[]
  teamRows: WordRushPlayer[]
  answers: WordRushAnswer[]
}) {
  const nameById = new Map(players.map((player) => [player.id, player.name]))
  const memberIds = teamRows.filter((row) => row.team === team).map((row) => row.player_id)

  if (memberIds.length === 0) {
    return <p className="text-faint text-sm">No players on this team</p>
  }

  return (
    <div className="space-y-3">
      {memberIds.map((playerId) => (
        <div key={playerId}>
          <p className="text-xs font-bold text-body mb-1">{nameById.get(playerId) ?? 'Player'}</p>
          <WordRushPlayerAnswerDetails
            answers={answers.filter((answer) => answer.player_id === playerId)}
            emptyLabel="No words"
          />
        </div>
      ))}
    </div>
  )
}
