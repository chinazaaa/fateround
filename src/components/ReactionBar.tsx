'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

const REACTIONS = [
  { emoji: '😂', label: 'Laughing' },
  { emoji: '😱', label: 'Shocked' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '💀', label: 'Dead' },
  { emoji: '👀', label: 'Eyes' },
] as const

const ALLOWED_EMOJI = new Set(REACTIONS.map((r) => r.emoji))

interface FloatingEmoji {
  id: number
  emoji: string
  x: number
}

const STYLE_ID = 'reaction-bar-styles'

function randomX() {
  return 15 + Math.random() * 70
}

function ensureStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes reaction-float-up {
      0% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-140px) scale(1.35); }
    }
  `
  document.head.appendChild(style)
}

interface ReactionBarProps {
  className?: string
  gameCode?: string
  playerId?: string | null
}

export default function ReactionBar({ className = '', gameCode, playerId }: ReactionBarProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [floaters, setFloaters] = useState<FloatingEmoji[]>([])
  const [mounted, setMounted] = useState(false)
  const idRef = useRef(0)
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  const channelRef = useRef<RealtimeChannel | null>(null)

  const addFloater = useCallback((emoji: string, x = randomX()) => {
    const id = idRef.current++
    setFloaters((prev) => [...prev, { id, emoji, x }])
    const timer = setTimeout(() => {
      setFloaters((prev) => prev.filter((f) => f.id !== id))
      timersRef.current.delete(timer)
    }, 900)
    timersRef.current.add(timer)
  }, [])

  useEffect(() => {
    setMounted(true)
    ensureStyles()
    const timers = timersRef.current
    return () => {
      timers.forEach(clearTimeout)
    }
  }, [])

  useEffect(() => {
    if (!gameCode) return

    const channel = supabase.channel(`reactions:${gameCode}`, {
      config: { broadcast: { self: false } },
    })

    channel.on('broadcast', { event: 'reaction' }, ({ payload }) => {
      const emoji = typeof payload?.emoji === 'string' ? payload.emoji : ''
      if (!ALLOWED_EMOJI.has(emoji as (typeof REACTIONS)[number]['emoji'])) return
      const x = typeof payload?.x === 'number' ? payload.x : randomX()
      addFloater(emoji, x)
    })

    channel.subscribe()
    channelRef.current = channel

    return () => {
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [gameCode, addFloater])

  const handleClick = useCallback(
    (emoji: string) => {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(emoji)) next.delete(emoji)
        else next.add(emoji)
        return next
      })

      const x = randomX()
      addFloater(emoji, x)

      if (gameCode && channelRef.current) {
        void channelRef.current.send({
          type: 'broadcast',
          event: 'reaction',
          payload: { emoji, playerId: playerId ?? null, x },
        })
      }
    },
    [addFloater, gameCode, playerId]
  )

  const floaterLayer =
    mounted && floaters.length > 0
      ? createPortal(
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[100]"
            style={{ height: '180px' }}
          >
            {floaters.map((f) => (
              <span
                key={f.id}
                style={{
                  position: 'absolute',
                  bottom: '24px',
                  left: `${f.x}%`,
                  fontSize: '2rem',
                  animation: 'reaction-float-up 0.9s ease-out forwards',
                }}
              >
                {f.emoji}
              </span>
            ))}
          </div>,
          document.body
        )
      : null

  return (
    <>
      <div className={`relative flex items-center justify-center gap-2 ${className}`}>
        {REACTIONS.map(({ emoji, label }) => {
          const isSelected = selected.has(emoji)
          return (
            <button
              key={emoji}
              type="button"
              aria-label={`React with ${label}`}
              aria-pressed={isSelected}
              onClick={() => handleClick(emoji)}
              style={{
                background: isSelected ? 'var(--surface-bg)' : 'transparent',
                border: isSelected ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                borderRadius: '9999px',
                padding: '6px 10px',
                fontSize: '1.25rem',
                cursor: 'pointer',
                transition: 'transform 0.15s ease, border-color 0.2s ease, background 0.2s ease',
                transform: isSelected ? 'scale(1.15)' : 'scale(1)',
              }}
            >
              {emoji}
            </button>
          )
        })}
      </div>
      {floaterLayer}
    </>
  )
}
