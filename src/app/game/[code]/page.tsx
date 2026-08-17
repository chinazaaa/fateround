'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PollGamePlayerExperience } from '@/components/poll-game/PollGamePlayerExperience'
// import { NowPlayingBar } from '@/components/music/NowPlayingBar'
import { AudioChat } from '@/components/AudioChat'
import { IosInstallPushNudge } from '@/components/IosInstallPushNudge'
import { PublicGameFinishOverlay } from '@/components/notifications/PublicGameFinishOverlay'
import { MatureGameGate } from '@/components/MatureGameGate'
import { getPlayerSession } from '@/lib/utils'
import { gameHasHeaderVoice } from '@/lib/game-types'
import { useProfile } from '@/hooks/useProfile'
import { TournamentBrandingWrapper } from '@/components/tournament/BrandingWrapper'
import type { TournamentBranding } from '@/types/tournament'

const TOURNAMENT_RETURN_SECONDS = 8

function TournamentBanner({
  gameCode,
  tournamentId,
  branding,
}: {
  gameCode: string
  tournamentId: string | null
  branding: TournamentBranding | null
}) {
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
  // name/join controls — players couldn't edit their name past it. Renders the
  // host's event logo beside the back button when the tournament has one, so
  // players see the brand on every game screen (not just the lobby).
  return (
    <div className="fixed left-3 top-3 z-50 flex items-center gap-2">
      <button
        type="button"
        onClick={() => router.push(`/tournament/${tournamentId}`)}
        className="btn-secondary btn-fit text-xs shadow-md"
      >
        ← Tournament
      </button>
      {branding?.logoUrl && (
        <img
          src={branding.logoUrl}
          alt=""
          className="h-8 w-8 object-contain rounded-md shadow-md"
          style={{ background: 'var(--card-bg, rgba(255,255,255,0.9))' }}
        />
      )}
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
  const { profile } = useProfile()
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
  // The player's secret resume token — voice authorizes on this, not on the public
  // playerId (see src/lib/audio-room-auth.ts).
  const [resumeToken, setResumeToken] = useState<string | null>(null)
  // Game type gates the floating voice pill: games with the design-system header
  // voice (Whot) render their own Join-voice control, so we skip the pill for them.
  const [gameType, setGameType] = useState<string | null>(null)

  useEffect(() => {
    const checkSession = () => {
      const session = getPlayerSession(gameCode)
      if (session?.playerName) {
        setPlayerName(session.playerName)
        setPlayerId(session.playerId)
        setResumeToken(session.resumeToken ?? null)
      } else {
        setPlayerName(null)
        setPlayerId(null)
        setResumeToken(null)
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

  // Fetch the parent tournament's brand colours + logo when this game is part
  // of a tournament, so the whole game tree inherits the host's palette (via
  // the CSS-var cascade below) and the top-left banner can show the logo. Uses
  // the public tournament GET — same endpoint the lobby uses, browser-cached.
  const [tournamentBranding, setTournamentBranding] = useState<TournamentBranding | null>(null)
  useEffect(() => {
    if (!tournamentId) {
      setTournamentBranding(null)
      return
    }
    let cancelled = false
    fetch(`/api/tournaments/${tournamentId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        setTournamentBranding((data?.tournament?.branding as TournamentBranding | null) ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [tournamentId])

  return (
    <TournamentBrandingWrapper branding={tournamentBranding} className="contents">
      <PollGamePlayerExperience gameCode={gameCode} initialName={initialName} autoJoinAsViewer={watch} />
      {/* Content warning for the adult party games. Sits on the shared game route so it
          reaches joiners too — a gate on /create would only ever stop the host. */}
      <MatureGameGate gameType={gameType} />
      {/* Floating "Join voice" pill. Skipped for games with the header voice rail
          (Whot) so they don't get two voice controls. Voice chat is disabled for
          tournament players (unstable across the lobby/match tabs) — but spectators
          watching a tournament game can still hop in. */}
      {playerName && resumeToken && (!tournamentId || watch) && !!gameType && !gameHasHeaderVoice(gameType) && (
        <AudioChat
          roomCode={gameCode}
          playerName={playerName}
          auth={{ kind: 'player', resumeToken }}
          autoJoin={!!profile?.default_voice_on}
        />
      )}
      <TournamentBanner gameCode={gameCode} tournamentId={tournamentId} branding={tournamentBranding} />
      {/* Web parity for the mobile PostJoinSubscribeNudge: one floating card
          when the game finishes, one shot per browser install. Non-tournament
          games only — tournament players already get the "back to hub" banner
          in that same corner. */}
      {!tournamentId && <PublicGameFinishOverlay gameCode={gameCode} />}
      {/* {resumeToken && <NowPlayingBar gameCode={gameCode} resumeToken={resumeToken} />} */}
      {playerId && <IosInstallPushNudge gameCode={gameCode} />}
    </TournamentBrandingWrapper>
  )
}
