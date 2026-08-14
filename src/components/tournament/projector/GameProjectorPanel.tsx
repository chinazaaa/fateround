'use client'

import { TriviaProjectorView } from './TriviaProjectorView'
import { NpatProjectorView } from './NpatProjectorView'
import { TwoTruthsProjectorView } from './TwoTruthsProjectorView'
import { WhoSaidThisProjectorView } from './WhoSaidThisProjectorView'

/**
 * Dispatch a projector "spectator" view based on the game's type. Only the
 * games with a wired-up big-screen renderer here get the Kahoot-style
 * treatment; anything else returns null so the big-screen page falls back to
 * its live-leaderboard panel. Add a case per new game type as the projector
 * variants get built.
 */
export function GameProjectorPanel({ gameType, gameCode }: { gameType: string | null; gameCode: string }) {
  if (gameType === 'trivia') return <TriviaProjectorView gameCode={gameCode} />
  if (gameType === 'i_call_on') return <NpatProjectorView gameCode={gameCode} />
  if (gameType === 'two_truths') return <TwoTruthsProjectorView gameCode={gameCode} />
  if (gameType === 'who_said_this') return <WhoSaidThisProjectorView gameCode={gameCode} />
  return null
}
