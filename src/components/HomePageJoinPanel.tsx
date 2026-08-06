'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { GameType } from '@/types'
import { gameTypeCreateParam } from '@/lib/game-types'
import { Glyph } from '@/components/icons/Glyph'
import { UI_ICONS } from '@/lib/game-glyphs'
import type { IconSvgElement } from '@hugeicons/react'

const MarketingGameTypeModal = dynamic(
  () => import('@/components/MarketingGameTypeModal').then((module) => module.MarketingGameTypeModal),
  { ssr: false }
)

const MIN_CODE_LENGTH = 4

type QuickLink = {
  href: string
  icon: IconSvgElement
  title: string
  caption: string
  accent: string
  /** Renders the tile in the accent colour rather than tinting it. */
  filled?: boolean
}

/** Two side-by-side tiles, then one full-width tile beneath them. */
const PAIRED_LINKS: QuickLink[] = [
  {
    href: '/rooms',
    icon: UI_ICONS.home,
    title: 'Game Rooms',
    caption: 'A space for your crew',
    accent: 'var(--play-teal)',
  },
  {
    href: '/tournament',
    icon: UI_ICONS.tournament,
    title: 'Tournaments',
    caption: 'Bracket night',
    accent: 'var(--rose-600)',
    filled: true,
  },
]

const WIDE_LINK: QuickLink = {
  href: '/browse',
  icon: UI_ICONS.browse,
  title: 'Browse public games',
  caption: 'Jump into games happening now',
  accent: 'var(--play-sky)',
}

function QuickLinkTile({ link }: { link: QuickLink }) {
  return (
    <Link
      href={link.href}
      className={`fr-tile${link.filled ? ' fr-tile--filled' : ''}`}
      style={{ '--accent': link.accent } as React.CSSProperties}
    >
      <span className="fr-glyph fr-glyph--sm">
        <Glyph icon={link.icon} size={22} />
      </span>
      <span className="fr-tile__body">
        <span className="fr-tile__title">{link.title}</span>
        <span className="fr-tile__caption">{link.caption}</span>
      </span>
    </Link>
  )
}

export function HomePageJoinPanel() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [showGameTypes, setShowGameTypes] = useState(false)

  const normalizedCode = code.trim().toUpperCase()
  const canJoin = normalizedCode.length >= MIN_CODE_LENGTH

  const join = () => {
    if (canJoin) router.push(`/game/${normalizedCode}`)
  }

  return (
    <>
      <div className="fr-card fr-card--xl" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <button
          type="button"
          className="fr-btn fr-btn--primary fr-btn--lg fr-btn--block"
          onClick={() => setShowGameTypes(true)}
        >
          Create a Game
        </button>

        <div className="my-[var(--space-4)] flex items-center gap-3">
          <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: 'var(--text-faint)' }}
          >
            or join
          </span>
          <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
        </div>

        <div className="fr-code-field">
          <input
            className="fr-input fr-input--code fr-code-field__input"
            placeholder="ENTER CODE"
            maxLength={6}
            aria-label="Game room code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onKeyDown={(event) => event.key === 'Enter' && join()}
          />
          <button type="button" className="fr-code-go" disabled={!canJoin} onClick={join} aria-label="Join game">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        <div className="mt-[var(--space-4)] grid grid-cols-1 gap-3 min-[460px]:grid-cols-2">
          {PAIRED_LINKS.map((link) => (
            <QuickLinkTile key={link.href} link={link} />
          ))}
        </div>

        <div className="mt-3">
          <QuickLinkTile link={WIDE_LINK} />
        </div>
      </div>

      {showGameTypes && (
        <MarketingGameTypeModal
          open={showGameTypes}
          onClose={() => setShowGameTypes(false)}
          onSelect={(type: GameType) => router.push(`/create?type=${gameTypeCreateParam(type)}`)}
        />
      )}
    </>
  )
}
