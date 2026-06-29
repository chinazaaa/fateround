'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PollGamePlayerExperience } from '@/components/poll-game/PollGamePlayerExperience'
import { AudioChat } from '@/components/AudioChat'
import { getPlayerSession } from '@/lib/utils'

const TOURNAMENT_RETURN_SECONDS = 8

function TournamentBanner({ gameCode, tournamentId }: { gameCode: string; tournamentId: string | null }) {
  const [finished, setFinished] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(TOURNAMENT_RETURN_SECONDS)

  // The tournament id comes from the URL (?tournament=). We only poll the game's
  // status here so we can route players back to the hub once the game ends.
  useEffect(() => {
    if (!tournamentId) return
    let cancelled = false
    const check = () => {
      supabase
        .from('games')
        .select('status')
        .eq('id', gameCode)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled || !data) return
          setFinished(data.status === 'finished')
        })
    }
    check()
    const timer = setInterval(check, 4000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [gameCode, tournamentId])

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
  const tournamentId = searchParams.get('tournament')
  // Spectator "Watch live" links carry ?watch=1 — auto-join as a viewer under a
  // stable generated name so people can follow the game without playing.
  const watch = searchParams.get('watch') === '1'
  const initialName = useMemo(() => {
    if (!watch) return searchParams.get('name') ?? undefined
    if (typeof window === 'undefined') return undefined
    const key = `watcher_name_${gameCode}`
    let w = window.localStorage.getItem(key)
    if (!w) {
      // Use a high-entropy suffix so concurrent watchers don't collide on the name.
      const rand =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID().slice(0, 8)
          : `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`
      w = `Watcher-${rand}`
      window.localStorage.setItem(key, w)
    }
    return w
  }, [watch, searchParams, gameCode])
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
      <PollGamePlayerExperience gameCode={gameCode} initialName={initialName} autoJoinAsViewer={watch} />
      {playerName && playerId && (
        <AudioChat roomCode={gameCode} playerName={playerName} identity={playerId} auth={{ kind: 'player' }} />
      )}
      <TournamentBanner gameCode={gameCode} tournamentId={tournamentId} />
    </>
  )
}
