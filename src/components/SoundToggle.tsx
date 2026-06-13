'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'kmk-sound-muted'

export function SoundToggle() {
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    setMuted(localStorage.getItem(STORAGE_KEY) === 'true')
  }, [])

  const toggle = () => {
    const next = !muted
    setMuted(next)
    localStorage.setItem(STORAGE_KEY, String(next))
    // Muting is handled by isSoundMuted() checks in sound functions
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
      className="fixed bottom-4 right-4 z-50 w-9 h-9 rounded-full glass-card border border-theme flex items-center justify-center text-sm transition-all hover:scale-105"
    >
      {muted ? '🔇' : '🔊'}
    </button>
  )
}
