'use client'

interface ScrollToBottomButtonProps {
  visible: boolean
  unreadCount: number
  onClick: () => void
}

export function ScrollToBottomButton({ visible, unreadCount, onClick }: ScrollToBottomButtonProps) {
  if (!visible) return null

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-2 right-2 z-10 w-10 h-10 rounded-full glass-card border border-violet-400/40 flex items-center justify-center text-violet-300 hover:bg-violet-500/15 transition-all animate-in fade-in zoom-in-90 duration-200"
      aria-label={unreadCount > 0 ? `${unreadCount} new messages — scroll to bottom` : 'Scroll to bottom'}
    >
      <span className="text-lg">↓</span>
      {unreadCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}
