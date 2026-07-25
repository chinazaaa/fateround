'use client'

import { useState, useEffect, useRef } from 'react'
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

export interface MafiaSystemLine {
  id: string
  text: string
  tone?: 'default' | 'danger' | 'success'
}

interface ChatMessagesProps {
  messages: MafiaChatMessage[]
  myPlayerId: string | null
  sentBubbleClass: string
  /** Player roster (for seat numbers) — when provided, sender names show "#N" and any
   *  message mentioning the local player's own number gets a highlighted border, matching
   *  Wolvesville's convention of referring to players by seat number in chat. */
  players?: MafiaPublicPlayer[]
  /** Synthesized public phase-narrative lines (day started, sunrise/vote results, votes
   *  required) shown inline above the chat history — folds the "system log" and chat into
   *  one feed, matching Wolvesville, instead of a separate result card. */
  systemLines?: MafiaSystemLine[]
}

const SYSTEM_LINE_TONE: Record<NonNullable<MafiaSystemLine['tone']>, string> = {
  default: 'text-pink-500',
  danger: 'text-red-400',
  success: 'text-emerald-400',
}

export function ChatMessages({ messages, myPlayerId, sentBubbleClass, players, systemLines = [] }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, systemLines.length])

  const seatNumberById = new Map(players?.map((p) => [p.id, p.seatNumber]) ?? [])
  const mySeatNumber = myPlayerId ? seatNumberById.get(myPlayerId) : undefined
  const myMentionPattern = mySeatNumber != null ? new RegExp(`(?<!\\d)${mySeatNumber}(?!\\d)`) : null

  return (
    <div className="h-40 overflow-y-auto space-y-1.5 flex flex-col p-1">
      {systemLines.map((line) => (
        <p key={line.id} className={`text-sm font-bold text-center py-1 ${SYSTEM_LINE_TONE[line.tone ?? 'default']}`}>
          {line.text}
        </p>
      ))}
      {messages.length === 0 && systemLines.length === 0 ? (
        <p className="text-xs text-[var(--muted)] italic text-center py-6 m-auto">No messages yet.</p>
      ) : (
        messages.map((m) => {
          const isMe = m.sender_player_id === myPlayerId
          const mentionsMe = !isMe && !!myMentionPattern?.test(m.message)
          const senderNumber = seatNumberById.get(m.sender_player_id)
          return (
            <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div
                className={`px-3 py-1.5 rounded-xl text-sm max-w-[85%] ${
                  isMe
                    ? sentBubbleClass
                    : mentionsMe
                      ? 'bg-amber-500/10 text-[var(--foreground)] border-2 border-amber-400'
                      : 'bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)]'
                }`}
              >
                {!isMe && (
                  <span className="block text-[10px] font-bold text-[var(--muted)] mb-0.5">
                    {senderNumber != null ? `#${senderNumber} ` : ''}
                    {m.sender_name}
                  </span>
                )}
                <span>{m.message}</span>
              </div>
            </div>
          )
        })
      )}
      <div ref={bottomRef} />
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
  systemLines?: MafiaSystemLine[]
}

export function MafiaSecretChat({ messages, onSendMessage, myPlayerId, players }: ChatProps) {
  const { text, setText, sending, handleSubmit } = useChatInput(onSendMessage)
  return (
    <div className="glass-card border border-red-500/20 rounded-2xl p-4 space-y-2">
      <p className="text-[10px] font-bold tracking-widest uppercase text-red-400 flex items-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
        Mafia Secret Chat
      </p>
      <ChatMessages
        messages={messages}
        myPlayerId={myPlayerId}
        players={players}
        sentBubbleClass="bg-red-600 text-white"
      />
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

// ── Town day chat ─────────────────────────────────────────────────────────────

interface DayChatProps extends ChatProps {
  disabled?: boolean
}

export function MafiaDayChat({
  messages,
  onSendMessage,
  myPlayerId,
  players,
  systemLines,
  disabled = false,
}: DayChatProps) {
  const { text, setText, sending, handleSubmit } = useChatInput(onSendMessage, disabled)
  return (
    <div className="glass-card border border-[var(--border)] rounded-2xl p-4 space-y-2">
      <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--primary)] flex items-center gap-1.5">
        💬 Town Discussion
      </p>
      <ChatMessages
        messages={messages}
        myPlayerId={myPlayerId}
        players={players}
        systemLines={systemLines}
        sentBubbleClass="bg-[var(--primary)] text-white"
      />
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
          className="px-3 py-2 btn-primary text-sm font-semibold rounded-lg transition disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}

// ── Ghost chat (dead players) ─────────────────────────────────────────────────

export function MafiaGhostChat({ messages, onSendMessage, myPlayerId, players }: ChatProps) {
  const { text, setText, sending, handleSubmit } = useChatInput(onSendMessage)
  return (
    <div className="glass-card border border-[var(--border)] rounded-2xl p-4 space-y-2 opacity-80">
      <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--muted)] flex items-center gap-1.5">
        👻 Ghost Chat <span className="normal-case font-normal text-[var(--muted)]">(only the dead can see this)</span>
      </p>
      <ChatMessages
        messages={messages}
        myPlayerId={myPlayerId}
        players={players}
        sentBubbleClass="bg-[var(--card)] text-[var(--muted)] border border-[var(--border)]"
      />
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={text}
          disabled={sending}
          onChange={(e) => setText(e.target.value)}
          placeholder="Chat with fellow ghosts..."
          className="flex-1 px-3 py-2 bg-[var(--surface-inset-bg)] border border-[var(--border)] rounded-lg text-sm focus:outline-none text-[var(--foreground)] placeholder:text-[var(--muted)]"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="px-3 py-2 btn-secondary text-sm font-semibold rounded-lg transition disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
