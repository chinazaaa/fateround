'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import { Glyph } from '@/components/icons/Glyph'
import { UI_ICONS } from '@/lib/game-glyphs'
import { ProfileChip } from '@/components/profile/ProfileChip'
import { CoinChip } from '@/components/coins/CoinChip'
import { useTheme } from '@/components/ThemeProvider'
import type { IconSvgElement } from '@hugeicons/react'

type NavItem = { href: string; label: string; icon: IconSvgElement }

function BackBar() {
  const router = useRouter()

  const handleClick = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/')
    }
  }

  return (
    <div className="fr-backbar">
      <button type="button" onClick={handleClick} className="fr-btn--nav" aria-label="Go back">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
      </button>
    </div>
  )
}

function SunIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )
}
function MoonIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function ThemeButton({ withLabel = false }: { withLabel?: boolean }) {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      className="fr-icon-btn"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
      {withLabel && <span>{isDark ? 'Light' : 'Dark'}</span>}
    </button>
  )
}

const NAV: NavItem[] = [
  { href: '/games', label: 'Games', icon: UI_ICONS.games },
  { href: '/tournament', label: 'Tournaments', icon: UI_ICONS.tournament },
  { href: '/daily-challenges', label: 'Daily Challenges', icon: UI_ICONS.dailyChallenges },
  { href: '/leaderboard', label: 'Leaderboard', icon: UI_ICONS.leaderboard },
  { href: '/shop', label: 'Shop', icon: UI_ICONS.shop },
  { href: '/updates', label: "What's new", icon: UI_ICONS.whatsNew },
]

/**
 * Public-site header — logo + desktop nav + a mobile hamburger drawer.
 * Mirrors the Claude Design marketing header (`site-header` / drawer).
 */
export function MarketingHeader({ hideBack = false }: { hideBack?: boolean } = {}) {
  const [menu, setMenu] = useState(false)
  const pathname = usePathname()
  const isHome = pathname === '/'

  useEffect(() => {
    document.body.style.overflow = menu ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menu])

  return (
    <>
      <header className="site-header">
        <Link href="/" aria-label="FateRound home">
          <FateRoundLogo className="h-8 w-auto" />
        </Link>

        <nav className="site-nav">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
          <CoinChip />
          <ProfileChip />
          <ThemeButton />
        </nav>

        <div className="fr-mobile-actions">
          <CoinChip />
          <ProfileChip />
          <ThemeButton />
          <button type="button" className="fr-burger" aria-label="Open menu" onClick={() => setMenu(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </header>

      {!isHome && !hideBack && <BackBar />}

      {/* Mobile drawer */}
      <div className={`fr-scrim${menu ? ' on' : ''}`} onClick={() => setMenu(false)} aria-hidden />
      <aside className={`fr-drawer${menu ? ' on' : ''}`} aria-hidden={!menu}>
        <div className="fr-drawer-head">
          <FateRoundLogo className="h-6 w-auto" />
          <button type="button" className="fr-drawer-x" aria-label="Close menu" onClick={() => setMenu(false)}>
            ✕
          </button>
        </div>
        <nav className="fr-drawer-nav">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMenu(false)}>
              <span className="di" aria-hidden>
                <Glyph icon={item.icon} size={18} />
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="fr-drawer-cta">
          <Link
            href="/create"
            className="fr-btn fr-btn--primary fr-btn--lg fr-btn--block"
            onClick={() => setMenu(false)}
          >
            Create a Game
          </Link>
          <Link
            href="/games"
            className="fr-btn fr-btn--secondary fr-btn--lg fr-btn--block"
            onClick={() => setMenu(false)}
          >
            Browse games
          </Link>
        </div>
      </aside>
    </>
  )
}
