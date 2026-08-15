'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { isRoomLobbyPath } from '@/lib/room-routes'
import { useTheme } from './ThemeProvider'

type ThemeToggleProps = {
  variant?: 'fixed' | 'inline'
  className?: string
}

// Shared ThemeToggle - uses fr-icon-btn matching homepage theme switcher
export function ThemeToggle({ variant = 'fixed', className = '' }: ThemeToggleProps) {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted ? theme === 'dark' : false

  // In-game (host + player) light/dark lives in the chrome's ⚙ settings sheet
  // (and the lobby's), so suppress the floating fixed toggle there — it would
  // otherwise overlap the chrome's top-right actions. Rooms carry their own.
  // The tournament projector view (`/tournament/<code>/screen`) is a
  // deliberately-dark full-viewport display; toggling the site theme has no
  // visible effect there (the page hardcodes bg-black text-white) so the
  // control reads as broken to the host. Hide it on that route too.
  const onGamePage = /^\/(game|host)\/[^/]+/.test(pathname ?? '')
  const onRoomPage = isRoomLobbyPath(pathname)
  const onProjectorScreen = /^\/tournament\/[^/]+\/screen\/?$/.test(pathname ?? '')
  if (variant === 'fixed' && (onGamePage || onRoomPage || onProjectorScreen)) return null

  // The fixed toggle is hidden on public/marketing pages (which carry their own
  // design-system toggle in the header) via a `:has(.fr-site)` rule in globals.css.
  const positionClass = variant === 'fixed' ? 'app-fixed-theme-toggle' : 'shrink-0'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`${positionClass} fr-icon-btn ${className}`}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}
