'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnonymousMessage } from '@/types'
import { ScrollToBottomButton } from './ScrollToBottomButton'
import { MessageReactions } from './MessageReactions'

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
  reactionsMap?: Map<string, Map<string, Set<string>>>
  myPlayerName?: string
  onReact?: (messageId: string, emoji: string, action: 'add' | 'remove') => void
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
  reactionsMap,
  myPlayerName,
  onReact,
}: AnonymousMessageFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const prevMessageCount = useRef(messages.length)

  const SCROLL_THRESHOLD = 200

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  // Track new messages when scrolled up
  useEffect(() => {
    const newMessages = messages.length - prevMessageCount.current
    prevMessageCount.current = messages.length
    if (newMessages > 0 && showScrollButton) {
      setUnreadCount((c) => c + newMessages)
    }
    // Auto-scroll when near bottom
    if (newMessages > 0 && !showScrollButton) {
      scrollToBottom(messages.length <= 1 ? 'auto' : 'smooth')
    }
  }, [messages.length, showScrollButton, scrollToBottom])

  // Scroll event handler
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handleScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      setShowScrollButton(distFromBottom > SCROLL_THRESHOLD)
      if (distFromBottom <= NEAR_BOTTOM_PX) {
        setUnreadCount(0)
      }
    }
    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  const handleScrollToBottom = () => {
    scrollToBottom('smooth')
    setUnreadCount(0)
  }

  return (
    <div className="glass-card border border-white/10 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted text-xs uppercase tracking-wider">{title}</p>
        <span className="text-faint text-xs tabular-nums">{messages.length}</span>
      </div>

      <div ref={scrollRef} className="relative max-h-[min(52vh,28rem)] overflow-y-auto scrollbar-thin">
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
                  className={`group/message confession-slide-in px-3 py-2.5 rounded-xl border transition-colors ${
                    isHighlighted ? 'bg-violet-500/15 border-violet-400/40' : 'bg-white/5 border-white/5'
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

                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      {message.text ? (
                        <p className="text-body-muted text-sm leading-relaxed flex-1 min-w-0">{message.text}</p>
                      ) : (
                        <div className="flex-1" />
                      )}
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
                    {message.media_url && (
                      <img src={message.media_url} alt="GIF" loading="lazy" className="rounded-xl max-w-[200px]" />
                    )}
                    {reactionsMap && myPlayerName !== undefined && onReact && (
                      <MessageReactions
                        messageId={message.id}
                        reactions={reactionsMap.get(message.id) ?? new Map()}
                        myPlayerName={myPlayerName}
                        onReact={onReact}
                        disabled={readOnly}
                      />
                    )}
                  </div>
                  <p className="text-faint text-[10px] mt-1.5">{new Date(message.created_at).toLocaleTimeString()}</p>
                </div>
              )
            })
          )}
        </div>
        <ScrollToBottomButton visible={showScrollButton} unreadCount={unreadCount} onClick={handleScrollToBottom} />
      </div>

      {readOnly && messages.length > 0 && <p className="text-faint text-xs">Lobby names are shown on each message.</p>}

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
