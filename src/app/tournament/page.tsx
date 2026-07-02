'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Field, PrimaryBtn } from '@/components/ui/PageShell'

export default function TournamentLandingPage() {
  const router = useRouter()
  const [code, setCode] = useState('')

  const trimmed = code.trim().toUpperCase()

  function join() {
    if (trimmed) router.push(`/tournament/${trimmed}`)
  }

  return (
    <PageShell centered narrow>
      <div className="text-center space-y-2">
        <span className="premium-badge">Tournament</span>
        <h1 className="text-4xl font-black gradient-title leading-tight">Tournaments</h1>
        <p className="text-muted text-sm">Run a multi-game competition for your group — or join one with a code.</p>
      </div>

      <div className="glass-card-strong p-5 sm:p-6 space-y-5">
        <PrimaryBtn onClick={() => router.push('/tournament/create')} className="w-full">
          Create a tournament
        </PrimaryBtn>

        <div className="flex items-center gap-3">
          <div className="flex-1 divider-soft" />
          <span className="label-caps text-faint">or join</span>
          <div className="flex-1 divider-soft" />
        </div>

        <Field label="Tournament code" htmlFor="tournament-code">
          <div className="flex gap-2">
            <input
              id="tournament-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') join()
              }}
              placeholder="Enter code"
              maxLength={12}
              autoCapitalize="characters"
              className="input-field flex-1 uppercase tracking-wider"
            />
            <button
              type="button"
              onClick={join}
              disabled={!trimmed}
              className="btn-secondary btn-fit disabled:opacity-40"
            >
              Join
            </button>
          </div>
        </Field>
      </div>
    </PageShell>
  )
}
