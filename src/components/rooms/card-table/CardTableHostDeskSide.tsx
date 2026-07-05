'use client'

import type { ReactNode } from 'react'
import { TrashIcon } from '@/components/host/host-icons'

export type HostSeat = {
  id: string
  name: string
  cards: number
  /** current turn (ringed) */
  turn: boolean
  /** the host's own seat */
  isMe: boolean
}

/**
 * Card-table HOST desktop side rail (design `Host · Desktop.html` `.desk-side`).
 *
 * - Host + play → "Turn order": seats with the current turn ringed, "(you)" on
 *   the host's seat, card counts, and a remove button per other player.
 * - Host only → "All hands · host view": the spy panel — each player's hand as
 *   face-down mini-cards + count (the host sees how many cards everyone holds).
 *
 * Then a "Table" blurb and the host control toolbar (passed as `controls`).
 */
export function CardTableHostDeskSide({
  seats,
  hostPlays,
  blurb,
  onRemove,
  controls,
}: {
  seats: HostSeat[]
  hostPlays: boolean
  blurb: string
  onRemove: (playerId: string, playerName: string) => void
  controls: ReactNode
}) {
  return (
    <>
      {hostPlays ? (
        <div className="sect">
          <h4>Turn order</h4>
          {seats.map((s) => (
            <div className={'seatitem' + (s.turn ? ' turn' : '')} key={s.id}>
              <span className="av">{s.name.charAt(0).toUpperCase()}</span>
              <span className="nm">
                {s.name}
                {s.isMe ? ' (you)' : ''}
              </span>
              <span className="cc">
                {s.cards} <span aria-hidden>🂠</span>
              </span>
              {!s.isMe && (
                <button
                  type="button"
                  className="ct-spy-remove"
                  aria-label={`Remove ${s.name}`}
                  onClick={() => onRemove(s.id, s.name)}
                >
                  <TrashIcon size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="sect">
          <h4>All hands · host view</h4>
          {seats.map((s) => (
            <div className="spy-row" key={s.id}>
              <span className="av">{s.name.charAt(0).toUpperCase()}</span>
              <span className="nm">{s.name}</span>
              <div className="mini-hand">
                {Array.from({ length: Math.min(s.cards, 6) }).map((_, i) => (
                  <span className="mc" key={i} />
                ))}
              </div>
              <span className="spy-count">{s.cards}</span>
            </div>
          ))}
        </div>
      )}
      <div className="sect grow">
        <h4>Table</h4>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>{blurb}</p>
      </div>
      <div className="foot">{controls}</div>
    </>
  )
}
