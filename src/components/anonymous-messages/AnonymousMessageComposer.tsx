'use client'

import { useEffect, useRef } from 'react'
import type { AnonymousMessage } from '@/types'

interface AnonymousMessageComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  sending: boolean
  replyTo: AnonymousMessage | null
  onClearReply: () => void
}

export function AnonymousMessageComposer({
  value,
  onChange,
  onSend,
  sending,
  replyTo,
  onClearReply,
}: AnonymousMessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus()
  }, [replyTo])

  return (
    <div className="space-y-3">
      {replyTo && (
        <div className="glass-card px-3 py-2.5 flex items-start gap-3 border border-violet-400/30">
          <div className="flex-1 min-w-0 border-l-2 border-violet-400 pl-2">
            <p className="text-faint text-[10px] uppercase tracking-wider">Replying to</p>
            <p className="text-body-muted text-sm line-clamp-2 mt-0.5">{replyTo.text}</p>
          </div>
          <button
            type="button"
            onClick={onClearReply}
            className="shrink-0 text-faint hover:text-body text-lg leading-none px-1"
            aria-label="Cancel reply"
          >
            ×
          </button>
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSend()
          }
        }}
        placeholder={replyTo ? 'Write your anonymous reply…' : 'Say something anonymous…'}
        rows={3}
        maxLength={500}
        className="input-field resize-none w-full"
      />
      <button
        type="button"
        onClick={onSend}
        disabled={sending || !value.trim()}
        className="btn-primary w-full"
      >
        {sending ? 'Sending…' : replyTo ? 'Send reply' : 'Send anonymously'}
      </button>
    </div>
  )
}
