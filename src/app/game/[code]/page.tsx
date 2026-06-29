'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PollGamePlayerExperience } from '@/components/poll-game/PollGamePlayerExperience'
import { AudioChat } from '@/components/AudioChat'
import { getPlayerSession } from '@/lib/utils'

const TOURNAMENT_RETURN_SECONDS = 8

function TournamentBanner({ gameCode }: { gameCode: string }) {
  const [tournamentId, setTournamentId] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(TOURNAMENT_RETURN_SECONDS)

  // Poll the game's tournament link + status so we can route players back to the
  // tournament hub when the game ends (otherwise they get stranded on results).
  useEffect(() => {
    let cancelled = false
    const check = () => {
      supabase
        .from('games')
        .select('tournament_id, status')
        .eq('id', gameCode)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled || !data?.tournament_id) return
          setTournamentId(data.tournament_id)
          setFinished(data.status === 'finished')
        })
    }
    check()
    const timer = setInterval(check, 4000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [gameCode])

  // Count down and return to the tournament once the game is over.
  useEffect(() => {
    if (!tournamentId || !finished) return
    if (secondsLeft <= 0) {
      window.location.href = `/tournament/${tournamentId}`
      return
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [tournamentId, finished, secondsLeft])

  if (!tournamentId) return null

  if (finished) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
        <div className="glass-card-strong flex items-center gap-4 px-5 py-3">
          <p className="text-sm font-medium text-body">Game over — back to the tournament in {secondsLeft}s</p>
          <a href={`/tournament/${tournamentId}`} className="btn-primary btn-fit text-sm">
            Back now
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <a href={`/tournament/${tournamentId}`} className="btn-secondary btn-fit text-sm">
        ← Back to Tournament
      </a>
    </div>
  )
}

export default function GamePage() {
  const { code } = useParams<{ code: string }>()
  const searchParams = useSearchParams()
  const gameCode = (Array.isArray(code) ? code[0] : code).toUpperCase()
  const initialName = searchParams.get('name') ?? undefined
  const [playerName, setPlayerName] = useState<string | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)

  useEffect(() => {
    const checkSession = () => {
      const session = getPlayerSession(gameCode)
      if (session?.playerName) {
        setPlayerName(session.playerName)
        setPlayerId(session.playerId)
      } else {
        setPlayerName(null)
        setPlayerId(null)
      }
    }
    checkSession()
    const timer = setInterval(checkSession, 1500)
    return () => clearInterval(timer)
  }, [gameCode])

  return (
    <>
      <PollGamePlayerExperience gameCode={gameCode} initialName={initialName} />
      {playerName && playerId && (
        <AudioChat roomCode={gameCode} playerName={playerName} identity={playerId} auth={{ kind: 'player' }} />
      )}
      <TournamentBanner gameCode={gameCode} />
    </>
  )
}
