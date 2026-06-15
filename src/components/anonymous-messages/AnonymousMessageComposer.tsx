'use client'

import { useEffect, useRef, useState } from 'react'
import type { AnonymousMessage } from '@/types'
import { EmojiPickerPopover } from './EmojiPickerPopover'
import { GifStickerPicker } from './GifStickerPicker'

interface AnonymousMessageComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onSendGif: (mediaUrl: string) => void
  sending: boolean
  replyTo: AnonymousMessage | null
  onClearReply: () => void
}

export function AnonymousMessageComposer({
  value,
  onChange,
  onSend,
  onSendGif,
  sending,
  replyTo,
  onClearReply,
}: AnonymousMessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [gifPickerOpen, setGifPickerOpen] = useState(false)

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus()
  }, [replyTo])

  const handleEmojiInsert = (emoji: string) => {
    const textarea = textareaRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = value.slice(0, start) + emoji + value.slice(end)
      onChange(newValue)
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length
        textarea.focus()
      }, 0)
    } else {
      onChange(value + emoji)
    }
  }

  return (
    <div className="space-y-3 relative">
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
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => {
              setEmojiPickerOpen((v) => !v)
              setGifPickerOpen(false)
            }}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg surface-inset border-theme text-muted hover:text-body transition-colors"
            aria-label="Add emoji"
          >
            😀
          </button>
          <button
            type="button"
            onClick={() => {
              setGifPickerOpen((v) => !v)
              setEmojiPickerOpen(false)
            }}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold surface-inset border-theme text-muted hover:text-body transition-colors"
            aria-label="Send GIF or sticker"
          >
            GIF
          </button>
        </div>
        <button type="button" onClick={onSend} disabled={sending || !value.trim()} className="btn-primary flex-1">
          {sending ? 'Sending…' : replyTo ? 'Send reply' : 'Send anonymously'}
        </button>
      </div>

      <EmojiPickerPopover
        open={emojiPickerOpen}
        onClose={() => setEmojiPickerOpen(false)}
        onSelect={handleEmojiInsert}
      />
      <GifStickerPicker
        open={gifPickerOpen}
        onClose={() => setGifPickerOpen(false)}
        onSelect={(url) => {
          onSendGif(url)
          setGifPickerOpen(false)
        }}
      />
    </div>
  )
}
