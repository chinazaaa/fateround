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

const TEXT_REACTIONS = [
  'As how?!',
  'No way',
  'Called it',
  "That's wild",
  'Nahhh',
  'FR',
  'Plot twist',
  'Cap',
] as const

const ALLOWED_EMOJI = new Set(REACTIONS.map((r) => r.emoji))
const ALLOWED_TEXT = new Set<string>(TEXT_REACTIONS)
const MAX_CUSTOM_TEXT = 32

type Floater =
  | { id: number; kind: 'emoji'; content: string; x: number }
  | { id: number; kind: 'text'; content: string; x: number }

const STYLE_ID = 'reaction-bar-styles'

function randomX() {
  return 15 + Math.random() * 70
}

function normalizeCustomText(raw: string): string | null {
  const text = raw.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  if (!text || text.length > MAX_CUSTOM_TEXT) return null
  return text
}

function isAllowedReactionText(text: string): boolean {
  return ALLOWED_TEXT.has(text) || normalizeCustomText(text) === text
}

function ensureStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes reaction-float-up {
      0% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-140px) scale(1.15); }
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
  const [selectedEmoji, setSelectedEmoji] = useState<Set<string>>(new Set())
  const [selectedText, setSelectedText] = useState<Set<string>>(new Set())
  const [customText, setCustomText] = useState('')
  const [floaters, setFloaters] = useState<Floater[]>([])
  const [mounted, setMounted] = useState(false)
  const idRef = useRef(0)
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  const channelRef = useRef<RealtimeChannel | null>(null)

  const addFloater = useCallback((floater: Omit<Floater, 'id'>) => {
    const id = idRef.current++
    setFloaters((prev) => [...prev, { ...floater, id }])
    const timer = setTimeout(() => {
      setFloaters((prev) => prev.filter((f) => f.id !== id))
      timersRef.current.delete(timer)
    }, floater.kind === 'text' ? 1100 : 900)
    timersRef.current.add(timer)
  }, [])

  const broadcastReaction = useCallback(
    (payload: { emoji?: string; text?: string; x: number }) => {
      if (!gameCode || !channelRef.current) return
      void channelRef.current.send({
        type: 'broadcast',
        event: 'reaction',
        payload: { ...payload, playerId: playerId ?? null },
      })
    },
    [gameCode, playerId]
  )

  const sendEmoji = useCallback(
    (emoji: string) => {
      setSelectedEmoji((prev) => {
        const next = new Set(prev)
        if (next.has(emoji)) next.delete(emoji)
        else next.add(emoji)
        return next
      })

      const x = randomX()
      addFloater({ kind: 'emoji', content: emoji, x })
      broadcastReaction({ emoji, x })
    },
    [addFloater, broadcastReaction]
  )

  const sendText = useCallback(
    (raw: string) => {
      const text = ALLOWED_TEXT.has(raw) ? raw : normalizeCustomText(raw)
      if (!text || !isAllowedReactionText(text)) return

      setSelectedText((prev) => {
        const next = new Set(prev)
        if (next.has(text)) next.delete(text)
        else next.add(text)
        return next
      })

      const x = randomX()
      addFloater({ kind: 'text', content: text, x })
      broadcastReaction({ text, x })
    },
    [addFloater, broadcastReaction]
  )

  const sendCustomText = useCallback(() => {
    const text = normalizeCustomText(customText)
    if (!text) return
    sendText(text)
    setCustomText('')
  }, [customText, sendText])

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
      const x = typeof payload?.x === 'number' ? payload.x : randomX()
      const text = typeof payload?.text === 'string' ? payload.text : ''
      if (text && isAllowedReactionText(text)) {
        addFloater({ kind: 'text', content: text, x })
        return
      }

      const emoji = typeof payload?.emoji === 'string' ? payload.emoji : ''
      if (ALLOWED_EMOJI.has(emoji as (typeof REACTIONS)[number]['emoji'])) {
        addFloater({ kind: 'emoji', content: emoji, x })
      }
    })

    channel.subscribe()
    channelRef.current = channel

    return () => {
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [gameCode, addFloater])

  const floaterLayer =
    mounted && floaters.length > 0
      ? createPortal(
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[100]"
            style={{ height: '200px' }}
          >
            {floaters.map((f) => (
              <span
                key={f.id}
                style={{
                  position: 'absolute',
                  bottom: '24px',
                  left: `${f.x}%`,
                  animation: 'reaction-float-up ease-out forwards',
                  animationDuration: f.kind === 'text' ? '1.1s' : '0.9s',
                  ...(f.kind === 'emoji' ? { fontSize: '2rem' } : {}),
                }}
              >
                {f.kind === 'emoji' ? (
                  f.content
                ) : (
                  <span className="inline-block max-w-[min(70vw,220px)] truncate rounded-full bg-violet-600/95 px-3 py-1.5 text-sm font-bold text-white shadow-lg shadow-violet-900/30">
                    {f.content}
                  </span>
                )}
              </span>
            ))}
          </div>,
          document.body
        )
      : null

  return (
    <>
      <div className={`relative space-y-3 ${className}`}>
        <div className="flex items-center justify-center gap-2">
          {REACTIONS.map(({ emoji, label }) => {
            const isSelected = selectedEmoji.has(emoji)
            return (
              <button
                key={emoji}
                type="button"
                aria-label={`React with ${label}`}
                aria-pressed={isSelected}
                onClick={() => sendEmoji(emoji)}
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

        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {TEXT_REACTIONS.map((text) => {
            const isSelected = selectedText.has(text)
            return (
              <button
                key={text}
                type="button"
                onClick={() => sendText(text)}
                aria-pressed={isSelected}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                  isSelected
                    ? 'bg-violet-500/15 text-violet-900 dark:text-violet-100 border border-violet-500 dark:border-violet-400/50 scale-105'
                    : 'surface-inset border border-theme text-muted hover:text-body hover:border-violet-400/30'
                }`}
              >
                {text}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                sendCustomText()
              }
            }}
            maxLength={MAX_CUSTOM_TEXT}
            placeholder="Type a reaction…"
            className="input-field flex-1 py-2 text-sm"
          />
          <button
            type="button"
            onClick={sendCustomText}
            disabled={!normalizeCustomText(customText)}
            className="btn-secondary shrink-0 px-4 py-2 text-sm disabled:opacity-40"
          >
            Pop
          </button>
        </div>
      </div>
      {floaterLayer}
    </>
  )
}
