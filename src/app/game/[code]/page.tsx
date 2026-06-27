'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PollGamePlayerExperience } from '@/components/poll-game/PollGamePlayerExperience'

function TournamentBanner({ gameCode }: { gameCode: string }) {
  const [tournamentId, setTournamentId] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('games')
      .select('tournament_id')
      .eq('id', gameCode)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.tournament_id) setTournamentId(data.tournament_id)
      })
  }, [gameCode])

  if (!tournamentId) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <a
        href={`/tournament/${tournamentId}`}
        className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-bold text-white shadow-lg transition hover:brightness-110"
      >
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

  return (
    <>
      <PollGamePlayerExperience gameCode={gameCode} initialName={initialName} />
      <TournamentBanner gameCode={gameCode} />
    </>
  )
}
