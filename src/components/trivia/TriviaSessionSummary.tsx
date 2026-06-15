'use client'

import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { FinalResultsShareBlock } from '@/components/FinalResultsShareBlock'
import { tallyTriviaPlayerScores, triviaCategoryFromGame } from '@/lib/trivia'
import { triviaCategoryLabel } from '@/lib/trivia-questions'
import type { Game, Player, Round, TriviaAnswer } from '@/types'

export function TriviaSessionSummary({
  game,
  players,
  rounds,
  answers,
}: {
  game: Game
  players: Player[]
  rounds: Round[]
  answers: TriviaAnswer[]
}) {
  const leaderboard = tallyTriviaPlayerScores(answers, players)
  const finishedRounds = rounds.filter((r) => r.status === 'finished')
  const category = triviaCategoryLabel(triviaCategoryFromGame(game))

  return (
    <div className="space-y-6">
      <div className="glass-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-faint text-[10px] uppercase tracking-wider">Category</p>
          <p className="font-medium mt-0.5">{category}</p>
        </div>
        <div>
          <p className="text-faint text-[10px] uppercase tracking-wider">Rounds played</p>
          <p className="font-medium mt-0.5">
            {finishedRounds.length} / {game.rounds_count}
          </p>
        </div>
        <div>
          <p className="text-faint text-[10px] uppercase tracking-wider">Players</p>
          <p className="font-medium mt-0.5">{players.length}</p>
        </div>
        <div>
          <p className="text-faint text-[10px] uppercase tracking-wider">Answers recorded</p>
          <p className="font-medium mt-0.5">{answers.length}</p>
        </div>
      </div>

      {leaderboard.length > 0 ? (
        <FinalResultsShareBlock
          game={game}
          participants={[]}
          votes={[]}
          rounds={rounds}
          players={players}
          triviaAnswers={answers}
        >
          <PaginatedLeaderboard
            title="Final leaderboard"
            rows={leaderboard.map((row, i) => ({ ...row, rank: i + 1 }))}
            scoreLabel={(n) => `${n} pts`}
          />
        </FinalResultsShareBlock>
      ) : (
        <div className="glass-card p-8 text-center text-muted">No rounds completed yet.</div>
      )}
    </div>
  )
}
