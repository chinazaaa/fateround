'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { AnonymousMessage } from '@/types'
import { useAnonymousFeedAutoScroll } from '@/hooks/useAnonymousFeedAutoScroll'

interface AnonymousMessageFeedProps {
  messages: AnonymousMessage[]
  title?: string
  emptyLabel?: string
  readOnly?: boolean
  canRemove?: boolean
  canReply?: boolean
  removingId?: string | null
  onRemove?: (messageId: string) => void
  onReply?: (message: AnonymousMessage) => void
  highlightMessageId?: string | null
  showAutoScrollToggle?: boolean
}

const NEAR_BOTTOM_PX = 80

export function AnonymousMessageFeed({
  messages,
  title = 'Anonymous messages',
  emptyLabel = 'No messages yet — be the first to post',
  readOnly = false,
  canRemove = false,
  canReply = false,
  removingId = null,
  onRemove,
  onReply,
  highlightMessageId = null,
  showAutoScrollToggle = true,
}: AnonymousMessageFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { autoScroll, toggleAutoScroll, ready } = useAnonymousFeedAutoScroll()
  const lastMessageId = messages[messages.length - 1]?.id ?? null

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  const prevAutoScrollRef = useRef(autoScroll)

  useEffect(() => {
    if (!ready) return

    const turnedOn = !prevAutoScrollRef.current && autoScroll
    prevAutoScrollRef.current = autoScroll

    if (!autoScroll) return
    if (turnedOn || (lastMessageId && isNearBottom())) {
      scrollToBottom(messages.length <= 1 ? 'auto' : 'smooth')
    }
  }, [ready, autoScroll, lastMessageId, messages.length, isNearBottom, scrollToBottom])

  const handleToggleAutoScroll = () => {
    toggleAutoScroll()
  }

  return (
    <div className="glass-card border border-white/10 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted text-xs uppercase tracking-wider">{title}</p>
        <div className="flex items-center gap-2 shrink-0">
          {showAutoScrollToggle && (
            <button
              type="button"
              onClick={handleToggleAutoScroll}
              className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-lg border transition-colors ${
                autoScroll
                  ? 'border-violet-400/40 text-violet-300/90 bg-violet-500/10'
                  : 'border-white/10 text-faint hover:text-muted'
              }`}
              aria-pressed={autoScroll}
              aria-label={autoScroll ? 'Turn auto-scroll off' : 'Turn auto-scroll on'}
            >
              Auto-scroll {autoScroll ? 'on' : 'off'}
            </button>
          )}
          <span className="text-faint text-xs tabular-nums">{messages.length}</span>
        </div>
      </div>

      <div ref={scrollRef} className="max-h-[min(52vh,28rem)] overflow-y-auto scrollbar-thin">
        <div className="space-y-2 pb-10">
        {messages.length === 0 ? (
          <p className="text-muted text-sm text-center py-8">{emptyLabel}</p>
        ) : (
          messages.map((message, i) => {
            const quoted = message.reply_to_text?.trim()
            const isHighlighted = highlightMessageId === message.id

            return (
              <div
                key={message.id}
                className={`confession-slide-in px-3 py-2.5 rounded-xl border transition-colors ${
                  isHighlighted
                    ? 'bg-violet-500/15 border-violet-400/40'
                    : 'bg-white/5 border-white/5'
                }`}
                style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}
              >
                {quoted && (
                  <div className="mb-2 pl-2 border-l-2 border-violet-400/70">
                    <p className="text-faint text-[10px] uppercase tracking-wider mb-0.5">Replying to</p>
                    <p className="text-body-muted/80 text-xs leading-snug line-clamp-2">{quoted}</p>
                  </div>
                )}

                <p className="text-violet-300/90 text-xs font-semibold mb-1">{message.player_name ?? 'Unknown'}</p>

                <div className="flex items-start justify-between gap-3">
                  <p className="text-body-muted text-sm leading-relaxed flex-1 min-w-0">
                    {message.text}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    {canReply && onReply && (
                      <button
                        type="button"
                        onClick={() => onReply(message)}
                        className="text-faint hover:text-violet-300 text-xs"
                        aria-label="Reply to message"
                      >
                        Reply
                      </button>
                    )}
                    {canRemove && onRemove && (
                      <button
                        type="button"
                        onClick={() => onRemove(message.id)}
                        disabled={removingId === message.id}
                        className="text-faint hover:text-red-400 text-xs disabled:opacity-50"
                        aria-label="Remove message"
                      >
                        {removingId === message.id ? '…' : 'Remove'}
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-faint text-[10px] mt-1.5">{new Date(message.created_at).toLocaleTimeString()}</p>
              </div>
            )
          })
        )}
        </div>
      </div>

      {readOnly && messages.length > 0 && (
        <p className="text-faint text-xs">Lobby names are shown on each message.</p>
      )}

      <style jsx>{`
        @keyframes confessionSlideIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .confession-slide-in {
          animation: confessionSlideIn 0.35s ease-out both;
        }
        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 2px;
        }
      `}</style>
    </div>
  )
}
