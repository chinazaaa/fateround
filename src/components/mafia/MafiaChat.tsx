'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import type { MafiaChatMessage, MafiaPublicPlayer } from '@/types'

// ── Phase Timer ───────────────────────────────────────────────────────────────

export function MafiaPhaseTimer({
  deadline,
  onExpired,
  label,
}: {
  deadline: string | null
  onExpired: () => void
  label?: string
}) {
  const calc = () => (deadline ? Math.max(0, Math.round((new Date(deadline).getTime() - Date.now()) / 1000)) : null)
  const [timeLeft, setTimeLeft] = useState<number | null>(calc)
  const firedRef = useRef(false)

  useEffect(() => {
    firedRef.current = false
    const t = setInterval(() => {
      const rem = calc()
      setTimeLeft(rem)
      if (rem !== null && rem <= 0 && !firedRef.current) {
        firedRef.current = true
        onExpired()
      }
    }, 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, onExpired])

  if (timeLeft === null || timeLeft <= 0) return null
  const urgent = timeLeft <= 10
  return (
    <div
      className={`py-1.5 flex items-center justify-center gap-2 text-xs font-semibold border-b ${
        urgent
          ? 'bg-red-500/10 border-red-500/20 text-red-400'
          : 'bg-[var(--surface-inset-bg)] border-[var(--border)] text-[var(--muted)]'
      }`}
    >
      <span className={urgent ? 'animate-pulse' : ''}>⏳</span>
      <span>
        {label ? `${label} ` : ''}
        {timeLeft}s
      </span>
    </div>
  )
}

// ── Shared bubble renderer with auto-scroll ───────────────────────────────────

interface ChatMessagesProps {
  messages: MafiaChatMessage[]
  myPlayerId: string | null
  /** Player roster (for seat numbers + alive status) — sender names show "#N", any message
   *  mentioning the local player's own number highlights the whole row (not just the text),
   *  and dead senders render in muted grey vs the living's normal foreground color —
   *  matching Wolvesville's flat chat-log style (no speech bubbles). */
  players?: MafiaPublicPlayer[]
  className?: string
}

/** Flat chat-log renderer (Wolvesville style): "#N Name: message" rows, no bubbles. Dead
 *  senders render muted grey; the living render in normal foreground color. A message that
 *  mentions the local player's own seat number highlights its entire row, not just the text.
 *  Phase-narrative announcements (day started, night results, vote results) are persisted
 *  server-side as real rows with `sender_player_id: 'system'`, so they render inline in true
 *  chronological order and stay in history permanently — never overwritten by the next
 *  phase's announcement the way a single ephemeral "current phase" banner would be. */
export function ChatMessages({ messages, myPlayerId, players, className = 'h-40' }: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Jump straight to the newest message by default — there's no reason to land on a message
  // from 4 nights ago first, the reader can always scroll back up if they want it. Runs
  // before paint (useLayoutEffect) so there's no visible flash of the top of the log first,
  // and is instant (not 'smooth') so it doesn't feel like an animated scroll on every poll.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const playerById = new Map(players?.map((p) => [p.id, p]) ?? [])
  const mySeatNumber = myPlayerId ? playerById.get(myPlayerId)?.seatNumber : undefined
  const myMentionPattern = mySeatNumber != null ? new RegExp(`(?<!\\d)${mySeatNumber}(?!\\d)`) : null

  return (
    <div ref={containerRef} className={`${className} overflow-y-auto overflow-x-hidden space-y-1 p-1 break-words`}>
      {messages.length === 0 ? (
        <p className="text-xs text-[var(--muted)] italic text-center py-6">No messages yet.</p>
      ) : (
        messages.map((m) => {
          if (m.sender_player_id === 'system') {
            return (
              <p key={m.id} className="text-sm font-bold text-center py-1 text-pink-500">
                {m.message}
              </p>
            )
          }
          const sender = playerById.get(m.sender_player_id)
          const isMe = m.sender_player_id === myPlayerId
          const mentionsMe = !isMe && !!myMentionPattern?.test(m.message)
          const senderIsDead = sender ? !sender.isAlive : false
          return (
            <p
              key={m.id}
              className={`text-sm leading-snug px-1.5 py-0.5 rounded ${
                mentionsMe ? 'bg-pink-500/15' : ''
              } ${senderIsDead ? 'text-[var(--muted)]' : 'text-[var(--foreground)]'}`}
            >
              <strong className="font-bold">
                {sender ? `#${sender.seatNumber} ` : ''}
                {m.sender_name}:
              </strong>{' '}
              {m.message}
            </p>
          )
        })
      )}
    </div>
  )
}

// ── Chat input helper ─────────────────────────────────────────────────────────

function useChatInput(onSendMessage: (msg: string) => Promise<void>, disabled = false) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!text.trim() || sending || disabled) return
    setSending(true)
    try {
      await onSendMessage(text.trim())
      setText('')
    } finally {
      setSending(false)
    }
  }

  return { text, setText, sending, handleSubmit }
}

// ── Mafia secret chat ─────────────────────────────────────────────────────────

interface ChatProps {
  messages: MafiaChatMessage[]
  onSendMessage: (msg: string) => Promise<void>
  myPlayerId: string | null
  players?: MafiaPublicPlayer[]
}

export function MafiaSecretChat({ messages, onSendMessage, myPlayerId, players }: ChatProps) {
  const { text, setText, sending, handleSubmit } = useChatInput(onSendMessage)
  return (
    <div className="glass-card border border-red-500/20 rounded-2xl p-4 space-y-2">
      <p className="text-[10px] font-bold tracking-widest uppercase text-red-400 flex items-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
        Mafia Secret Chat
      </p>
      <ChatMessages messages={messages} myPlayerId={myPlayerId} players={players} />
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={text}
          disabled={sending}
          onChange={(e) => setText(e.target.value)}
          placeholder="Whisper to allies..."
          className="flex-1 px-3 py-2 bg-[var(--surface-inset-bg)] border border-red-500/20 rounded-lg text-sm focus:outline-none focus:border-red-500/50 text-[var(--foreground)] placeholder:text-[var(--muted)]"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition"
        >
          Send
        </button>
      </form>
    </div>
  )
}

// ── Town discussion — one shared feed for living and dead ────────────────────
//
// Living players only ever receive day-scope messages from the server (ghost messages
// are never sent to them), so they simply never see the dead's chat. Dead players get
// both merged into one timeline here, with dead senders rendered in muted grey. There is
// no separate "Ghost Chat" box — the send box is the same one, and the scope a message
// is posted to is decided by the caller (living -> day scope, dead -> ghost scope).

interface DayChatProps extends ChatProps {
  disabled?: boolean
  /** Only present for dead viewers — merged into `messages` and sorted by time. */
  ghostMessages?: MafiaChatMessage[]
  /** Outside Discussion/Voting, Town Discussion is visible (so its history isn't hidden
   *  away) but nobody can post to it — hides the input row entirely rather than just
   *  disabling it, since there's nothing to type into. */
  readOnly?: boolean
  /** Short phase name shown next to the header when readOnly (e.g. "night", "sunrise") —
   *  must reflect the actual current phase, not be hardcoded to one specific phase. */
  readOnlyLabel?: string
}

export function MafiaDayChat({
  messages,
  ghostMessages,
  onSendMessage,
  myPlayerId,
  players,
  disabled = false,
  readOnly = false,
  readOnlyLabel,
}: DayChatProps) {
  const { text, setText, sending, handleSubmit } = useChatInput(onSendMessage, disabled)
  const merged = ghostMessages?.length
    ? [...messages, ...ghostMessages].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    : messages
  return (
    // A fixed (not content-grown) height keeps this box from stretching the page taller as
    // messages pile up — the roster grid above it stays put and only this box scrolls, on
    // both mobile (where the layout stacks) and desktop.
    <div className="glass-card border border-[var(--border)] rounded-2xl p-4 space-y-2 flex flex-col md:sticky md:top-20">
      <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--primary)] flex items-center gap-1.5">
        💬 Town Discussion
        {readOnly && (
          <span className="font-normal normal-case text-[var(--muted)]">
            {' '}
            · {readOnlyLabel ? `${readOnlyLabel}, ` : ''}read-only
          </span>
        )}
      </p>
      <ChatMessages messages={merged} myPlayerId={myPlayerId} players={players} className="h-[24rem]" />
      {!readOnly && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={text}
            disabled={sending || disabled}
            onChange={(e) => setText(e.target.value)}
            placeholder={disabled ? 'You cannot chat right now' : 'Share your thoughts...'}
            className="flex-1 px-3 py-2 bg-[var(--surface-inset-bg)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-[var(--primary)] text-[var(--foreground)] placeholder:text-[var(--muted)] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !text.trim() || disabled}
            className="px-3 py-2 btn-primary btn-fit text-sm font-semibold rounded-lg transition disabled:opacity-50"
          >
            Send
          </button>
        </form>
      )}
    </div>
  )
}
