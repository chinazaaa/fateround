'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PollGamePlayerExperience } from '@/components/poll-game/PollGamePlayerExperience'
// import { NowPlayingBar } from '@/components/music/NowPlayingBar'
import { AudioChat } from '@/components/AudioChat'
import { IosInstallPushNudge } from '@/components/IosInstallPushNudge'
import { getPlayerSession } from '@/lib/utils'
import { gameHasHeaderVoice } from '@/lib/game-types'

const TOURNAMENT_RETURN_SECONDS = 8

function TournamentBanner({ gameCode, tournamentId }: { gameCode: string; tournamentId: string | null }) {
  const router = useRouter()
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

  // Count down and return to the tournament once the game is over. Use SPA navigation
  // (router.push) rather than a full-page reload so the hand-off back to the hub is
  // smooth — matching how the hub forwards spectators into a game on the way in.
  useEffect(() => {
    if (!tournamentId || !finished) return
    if (secondsLeft <= 0) {
      router.push(`/tournament/${tournamentId}`)
      return
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [tournamentId, finished, secondsLeft, router])

  if (!tournamentId) return null

  if (finished) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
        <div className="glass-card-strong flex items-center gap-4 px-5 py-3">
          <p className="text-sm font-medium text-body">Game over — back to the tournament in {secondsLeft}s</p>
          <button
            type="button"
            onClick={() => router.push(`/tournament/${tournamentId}`)}
            className="btn-primary btn-fit text-sm"
          >
            Back now
          </button>
        </div>
      </div>
    )
  }

  // Parked top-left (not bottom-centre) so it never sits over the centred
  // name/join controls — players couldn't edit their name past it.
  return (
    <div className="fixed left-3 top-3 z-50">
      <button
        type="button"
        onClick={() => router.push(`/tournament/${tournamentId}`)}
        className="btn-secondary btn-fit text-xs shadow-md"
      >
        ← Tournament
      </button>
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
  // Game type gates the floating voice pill: games with the design-system header
  // voice (Whot) render their own Join-voice control, so we skip the pill for them.
  const [gameType, setGameType] = useState<string | null>(null)

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

  useEffect(() => {
    let active = true
    supabase
      .from('games')
      .select('game_type')
      .eq('id', gameCode)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setGameType(data?.game_type ?? null)
      })
    return () => {
      active = false
    }
  }, [gameCode])

  return (
    <>
      <PollGamePlayerExperience gameCode={gameCode} initialName={initialName} autoJoinAsViewer={watch} />
      {/* Floating "Join voice" pill. Skipped for games with the header voice rail
          (Whot) so they don't get two voice controls. Voice chat is disabled for
          tournament players (unstable across the lobby/match tabs) — but spectators
          watching a tournament game can still hop in. */}
      {playerName && playerId && (!tournamentId || watch) && !!gameType && !gameHasHeaderVoice(gameType) && (
        <AudioChat roomCode={gameCode} playerName={playerName} identity={playerId} auth={{ kind: 'player' }} />
      )}
      <TournamentBanner gameCode={gameCode} tournamentId={tournamentId} />
      {/* {playerId && <NowPlayingBar gameCode={gameCode} identity={playerId} />} */}
      {playerId && <IosInstallPushNudge gameCode={gameCode} />}
    </>
  )
}
