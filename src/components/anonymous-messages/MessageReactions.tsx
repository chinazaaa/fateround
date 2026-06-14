'use client'

import { useState } from 'react'
import { EmojiPickerPopover } from './EmojiPickerPopover'

interface MessageReactionsProps {
  messageId: string
  reactions: Map<string, Set<string>>
  myPlayerName: string
  onReact: (messageId: string, emoji: string, action: 'add' | 'remove') => void
  disabled?: boolean
}

export function MessageReactions({
  messageId,
  reactions,
  myPlayerName,
  onReact,
  disabled = false,
}: MessageReactionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const handleEmojiSelect = (emoji: string) => {
    const existing = reactions.get(emoji)
    const hasMyReaction = existing?.has(myPlayerName) ?? false
    onReact(messageId, emoji, hasMyReaction ? 'remove' : 'add')
  }

  const handlePillClick = (emoji: string) => {
    const existing = reactions.get(emoji)
    const hasMyReaction = existing?.has(myPlayerName) ?? false
    onReact(messageId, emoji, hasMyReaction ? 'remove' : 'add')
  }

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1 relative">
      {/* Existing reaction pills */}
      {Array.from(reactions.entries()).map(([emoji, players]) => {
        const isMine = players.has(myPlayerName)
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => handlePillClick(emoji)}
            disabled={disabled}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-colors ${
              isMine
                ? 'bg-violet-500/25 border border-violet-400/40 text-violet-200'
                : 'bg-white/5 border border-white/10 text-faint hover:border-white/20'
            }`}
          >
            <span>{emoji}</span>
            <span className="text-[10px] tabular-nums">{players.size}</span>
          </button>
        )
      })}

      {/* Add reaction button */}
      {!disabled && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-white/5 border border-white/10 text-faint hover:border-white/20 hover:text-body transition-colors"
            aria-label="Add reaction"
          >
            😊
          </button>
          <EmojiPickerPopover open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handleEmojiSelect} />
        </div>
      )}
    </div>
  )
}
