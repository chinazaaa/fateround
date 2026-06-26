'use client'

import { useState, useEffect, useRef } from 'react'

type Message = {
  id: string
  display_name: string
  text: string
  created_at: string
  member_id: string | null
}

type Props = {
  messages: Message[]
  myMemberId: string
  onSend: (text: string) => Promise<void>
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function RoomChat({ messages, myMemberId, onSend }: Props) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const send = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setText('')
    try {
      await onSend(trimmed)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-2 p-3 min-h-0">
        {messages.length === 0 && <p className="text-center text-faint text-sm py-8">No messages yet. Say hi!</p>}
        {messages.map((msg) => {
          const isMe = msg.member_id === myMemberId
          return (
            <div key={msg.id} className={`flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
              {!isMe && <span className="text-[10px] text-faint px-1">{msg.display_name}</span>}
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                  isMe
                    ? 'bg-[var(--primary)] text-white rounded-br-sm'
                    : 'bg-[var(--surface)] border border-[var(--border)] text-body rounded-bl-sm'
                }`}
              >
                {msg.text}
              </div>
              <span className="text-[10px] text-faint px-1">{formatTime(msg.created_at)}</span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-[var(--border)] flex gap-2 shrink-0">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Say something…"
          maxLength={500}
          className="input-field flex-1 py-2 text-sm"
          disabled={sending}
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || sending}
          className="btn-secondary shrink-0 px-4 py-2 text-sm"
        >
          Send
        </button>
      </div>
    </div>
  )
}
