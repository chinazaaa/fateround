'use client'

import { usePathname } from 'next/navigation'
import { useTheme } from './ThemeProvider'

type ThemeToggleProps = {
  variant?: 'fixed' | 'inline'
  className?: string
}

export function ThemeToggle({ variant = 'fixed', className = '' }: ThemeToggleProps) {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  const onGamePlayerPage = /^\/game\/[^/]+/.test(pathname ?? '')
  if (variant === 'fixed' && onGamePlayerPage) return null

  const positionClass =
    variant === 'fixed' ? 'fixed top-4 right-4 z-50' : 'shrink-0'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`${positionClass} flex items-center gap-1.5 rounded-full px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium transition-all duration-200 glass-card ${className}`}
      style={{ color: 'var(--muted)' }}
    >
      {isDark ? (
        <>
          <SunIcon />
          <span className="hidden sm:inline">Light</span>
        </>
      ) : (
        <>
          <MoonIcon />
          <span className="hidden sm:inline">Dark</span>
        </>
      )}
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
