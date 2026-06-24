'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { isRoomLobbyPath } from '@/lib/room-routes'
import { isSoundMuted, SOUND_MUTED_STORAGE_KEY, stopTimerMusic, unlockAudio } from '@/lib/sounds'

type SoundToggleProps = {
  variant?: 'fixed' | 'inline'
  className?: string
}

export function SoundToggle({ variant = 'fixed', className = '' }: SoundToggleProps) {
  const pathname = usePathname()
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    setMuted(isSoundMuted())
  }, [])

  const onGamePage = /^\/(game|host)\/[^/]+/.test(pathname ?? '')
  const onRoomPage = isRoomLobbyPath(pathname)
  if (variant === 'fixed' && (onGamePage || onRoomPage)) return null

  const toggle = () => {
    const next = !muted
    setMuted(next)
    localStorage.setItem(SOUND_MUTED_STORAGE_KEY, String(next))
    if (next) {
      stopTimerMusic()
    } else {
      unlockAudio() // pre-warm context on unmute (user gesture)
    }
  }

  const positionClass = variant === 'fixed' ? 'fixed bottom-4 left-4 z-50' : 'shrink-0'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={muted ? 'Turn sounds on' : 'Turn sounds off'}
      aria-pressed={!muted}
      title={muted ? 'Sounds off — tap to turn on' : 'Sounds on — tap to turn off'}
      className={`${positionClass} flex items-center gap-1.5 rounded-full px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium transition-all duration-200 glass-card ${className}`}
      style={{ color: 'var(--muted)' }}
    >
      {muted ? <SpeakerOffIcon /> : <SpeakerIcon />}
      <span className="hidden sm:inline">{muted ? 'Sounds off' : 'Sounds on'}</span>
    </button>
  )
}

function SpeakerIcon() {
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
      aria-hidden
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

function SpeakerOffIcon() {
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
      aria-hidden
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  )
}
