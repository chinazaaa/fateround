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
  const hasReactions = reactions.size > 0

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

  if (disabled && !hasReactions) return null

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1.5 relative">
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

      {!disabled && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-white/5 border border-dashed border-white/15 text-faint hover:border-violet-400/40 hover:text-violet-200 transition-colors"
            aria-label="Add reaction"
          >
            <span aria-hidden="true">+</span>
            React
          </button>
          <EmojiPickerPopover open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handleEmojiSelect} />
        </div>
      )}
    </div>
  )
}
