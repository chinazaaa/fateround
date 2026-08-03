'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { onTrophiesEarned, type EarnedTrophy } from '@/lib/trophies/earned-events'

const TIER_EMOJI: Record<string, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  platinum: '🏆',
}

/**
 * "3 trophies this game →" on the results screen (`docs/trophy-unlocks-plan.md` §3).
 *
 * SHOWS WHETHER OR NOT YOU WON. Losing a game and still unlocking something is one of the better
 * moments a trophy system has, and hiding it behind a win would throw that away. The award pass
 * doesn't care who won either — it reports what this round earned.
 *
 * This is NOT the signup prompt. `PostWinPrompt` asks anonymous players to save their progress
 * and is deliberately loud; this is a quiet line that belongs with the results. They can both be
 * on screen, which is fine — they're answering different questions ("what did I get?" and "will
 * I keep it?").
 *
 * Mounted centrally beside `GameAttribution`, for the reason recorded in `earned-events.ts`:
 * threading a callback through both chromes into ~40 game views would be the third time this
 * feature paid that tax.
 */
export function TrophiesThisGame() {
  const [trophies, setTrophies] = useState<EarnedTrophy[]>([])
  const [gameType, setGameType] = useState<string | undefined>()

  useEffect(() => {
    return onTrophiesEarned((earned, type) => {
      setTrophies(earned)
      setGameType(type)
    })
  }, [])

  if (!trophies.length) return null

  // Best first, so the line leads with the thing worth bragging about rather than whatever the
  // award pass happened to grant first.
  const order = ['platinum', 'gold', 'silver', 'bronze']
  const best = [...trophies].sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier))[0]
  const count = trophies.length
  const label = `${count} ${count === 1 ? 'trophy' : 'trophies'} this game`

  const body = (
    <>
      <span aria-hidden>{TIER_EMOJI[best.tier] ?? '🏅'}</span>
      <span className="font-semibold">{label}</span>
      {count === 1 && <span className="text-muted">· {best.title}</span>}
    </>
  )

  // Without a game type there is nowhere specific to send them, and a link to the wrong game is
  // worse than none — so it degrades to a plain statement rather than guessing.
  return (
    <div className="mt-4 flex justify-center">
      {gameType ? (
        <Link
          href={`/profile/${encodeURIComponent(gameType)}`}
          className="glass-card flex items-center gap-2 px-4 py-2 text-sm transition hover:brightness-105"
        >
          {body}
          <span aria-hidden className="text-muted">
            →
          </span>
        </Link>
      ) : (
        <p className="glass-card flex items-center gap-2 px-4 py-2 text-sm">{body}</p>
      )}
    </div>
  )
}
