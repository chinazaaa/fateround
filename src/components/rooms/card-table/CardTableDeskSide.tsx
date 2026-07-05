'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getPlayerSession } from '@/lib/utils'

/** Card-table family this rail supports (Whot / Crazy Eights). */
type CardTableType = 'whot' | 'crazy_eights'

/** Per-game session/hands tables + the "This game" blurb (matches the design). */
const CONFIG: Record<CardTableType, { sessionTable: string; handsTable: string; blurb: string }> = {
  whot: {
    sessionTable: 'whot_sessions',
    handsTable: 'whot_player_hands',
    blurb: 'Whot · first to empty their hand wins. Watch for Pick 2, Pick 3, and the WHOT wild.',
  },
  crazy_eights: {
    sessionTable: 'crazy_eights_sessions',
    handsTable: 'crazy_eights_player_hands',
    blurb: 'Crazy Eights · first to empty their hand wins. Watch for Pick 2, reverses, and the wild 8.',
  },
}

type Seat = { id: string; name: string; cards: number; turn: boolean }

/**
 * Desktop-only side rail for the card-table room's two-pane artboard — the
 * live "Turn order" (seat · card count, current seat ringed), a short rules
 * blurb, and share actions. Rendered inside `.fr-room-poll .pr-side` (hidden
 * below 1024px), so it self-polls only when the desktop rail is visible —
 * mirroring `PollDeskSide`. Independent of the play surface's own state.
 */
export function CardTableDeskSide({
  gameCode,
  gameType,
  myPlayerId,
}: {
  gameCode: string
  gameType: CardTableType
  /** The current player's id — marks their seat "(you)". */
  myPlayerId?: string | null
}) {
  const cfg = CONFIG[gameType]
  const [seats, setSeats] = useState<Seat[]>([])
  const [copied, setCopied] = useState(false)
  const [continued, setContinued] = useState(false)

  useEffect(() => {
    // The rail is hidden on narrow screens — skip all work there.
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches) return
    let active = true
    const load = async () => {
      const [{ data: players }, { data: session }, { data: hands }] = await Promise.all([
        supabase.from('players').select('id, name').eq('game_id', gameCode).order('joined_at'),
        supabase.from(cfg.sessionTable).select('turn_order, current_turn_index').eq('game_id', gameCode).maybeSingle(),
        supabase.from(cfg.handsTable).select('player_id, cards').eq('game_id', gameCode),
      ])
      if (!active) return
      const nameById = new Map((players ?? []).map((p) => [p.id, p.name]))
      const countById = new Map((hands ?? []).map((h) => [h.player_id, (h.cards as unknown[] | null)?.length ?? 0]))
      const order: string[] = (session?.turn_order as string[] | null) ?? []
      // Safe modulo (matches currentPlayerId in lib/whot + lib/crazy-eights) so a
      // negative Crazy Eights index (reverse direction) still maps to the right seat.
      const len = order.length
      const idx = session?.current_turn_index ?? 0
      const turnId = len ? order[((idx % len) + len) % len] : null
      // Seats read left→right in play order; fall back to join order if the
      // session hasn't dealt yet.
      const ids = order.length ? order : (players ?? []).map((p) => p.id)
      setSeats(
        ids
          .filter((id) => nameById.has(id))
          .map((id) => ({ id, name: nameById.get(id)!, cards: countById.get(id) ?? 0, turn: id === turnId }))
      )
    }
    void load()
    const t = window.setInterval(load, 2500)
    return () => {
      active = false
      window.clearInterval(t)
    }
  }, [gameCode, cfg.sessionTable, cfg.handsTable])

  const copy = (text: string, mark: (v: boolean) => void) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text)
      mark(true)
      window.setTimeout(() => mark(false), 1500)
    }
  }
  const gameUrl = () => (typeof window !== 'undefined' ? `${window.location.origin}/game/${gameCode}` : '')
  // "Continue on another device" carries the player's resume token so the other
  // device resumes *this* session (?player=…), not a fresh join.
  const continueUrl = () => {
    const token = typeof window !== 'undefined' ? getPlayerSession(gameCode)?.resumeToken : null
    return token ? `${gameUrl()}?player=${encodeURIComponent(token)}` : gameUrl()
  }

  return (
    <aside className="pr-side">
      <div className="sect">
        <h4>Turn order</h4>
        {seats.map((s) => {
          const isMe = !!myPlayerId && s.id === myPlayerId
          return (
            <div className={'seatitem' + (s.turn ? ' turn' : '')} key={s.id}>
              <span className="av">{s.name.charAt(0).toUpperCase()}</span>
              <span className="nm">
                {s.name}
                {isMe ? ' (you)' : ''}
              </span>
              {/* count + card-back glyph (🂠), matching the design */}
              <span className="cc">
                {s.cards} <span aria-hidden>🂠</span>
              </span>
            </div>
          )
        })}
      </div>
      <div className="sect grow">
        <h4>This game</h4>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>{cfg.blurb}</p>
      </div>
      <div className="foot">
        <button
          type="button"
          className="fr-btn fr-btn--secondary fr-btn--block"
          onClick={() => copy(gameUrl(), setCopied)}
        >
          {copied ? 'Invite link copied ✓' : 'Share game'}
        </button>
        <button
          type="button"
          className="fr-btn fr-btn--ghost fr-btn--block"
          onClick={() => copy(continueUrl(), setContinued)}
        >
          {continued ? 'Your link copied ✓' : 'Continue on another device'}
        </button>
      </div>
    </aside>
  )
}
