'use client'

import { GameTypeBadge } from '@/components/GameTypeBadge'
import { ShareGameLinkCard } from '@/components/ShareGameLinkCard'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import type { LateJoinContext } from '@/lib/late-join-context'
import type { Game, GameType } from '@/types'

type Props = {
  gameCode: string
  game: Pick<Game, 'title' | 'game_type'>
  context?: LateJoinContext | null
  contextLoading?: boolean
  playersAllowed?: boolean
  nameInput?: string
  onNameChange?: (name: string) => void
  showNameField?: boolean
  joining?: boolean
  onJoinAsViewer: () => void
  onJoinAsPlayer: () => void
}

export function LateJoinChoice({
  gameCode,
  game,
  context = null,
  contextLoading = false,
  playersAllowed = true,
  nameInput = '',
  onNameChange,
  showNameField = false,
  joining = false,
  onJoinAsViewer,
  onJoinAsPlayer,
}: Props) {
  const gameType = parseGameType(game.game_type)
  const cfg = gameTypeConfig(gameType)
  const canJoin = !showNameField || nameInput.trim().length > 0

  return (
    <div className="page-wrap flex items-center justify-center px-4 py-8">
      <div className="glass-card p-6 w-full max-w-md space-y-5">
        <div className="text-center space-y-2">
          <div className="text-4xl">{cfg.headerEmoji}</div>
          <h1 className="text-2xl font-black text-body">{game.title}</h1>
          <GameTypeBadge gameType={gameType as GameType} />
        </div>
        <div className="space-y-2 text-center">
          <p className="text-lg font-bold text-body">Game in progress</p>
          {contextLoading ? (
            <p className="text-muted text-sm">Loading game status…</p>
          ) : context ? (
            <>
              <p className="text-base font-semibold text-body">{context.statusLine}</p>
              <p className="text-muted text-sm leading-relaxed">
                {playersAllowed
                  ? 'This game has already started. Watch without playing, or join now as a player.'
                  : 'This game allows late joiners to watch only — you can join the live session as a viewer.'}
              </p>
            </>
          ) : (
            <p className="text-muted text-sm leading-relaxed">
              {playersAllowed
                ? 'This game has already started. Watch without playing, or join now as a player.'
                : 'This game allows late joiners to watch only.'}
            </p>
          )}
        </div>
        {showNameField && onNameChange && (
          <div>
            <label className="label-caps block mb-2">Your name</label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Enter your name"
              className="input-field w-full"
              maxLength={40}
              autoFocus
            />
          </div>
        )}
        {playersAllowed ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={onJoinAsViewer}
                disabled={joining || !canJoin}
                className="btn-secondary w-full py-3 text-sm font-bold"
              >
                {joining ? 'Joining…' : 'Join as viewer'}
              </button>
              {context && (
                <p className="text-faint text-[11px] text-center leading-snug px-1">{context.viewerDetail}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={onJoinAsPlayer}
                disabled={joining || !canJoin}
                className="btn-primary w-full py-3 text-sm font-bold"
              >
                {joining ? 'Joining…' : 'Join as player'}
              </button>
              {context && (
                <p className="text-faint text-[11px] text-center leading-snug px-1">{context.playerDetail}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={onJoinAsViewer}
              disabled={joining || !canJoin}
              className="btn-primary w-full py-3 text-sm font-bold"
            >
              {joining ? 'Joining…' : 'Join to watch'}
            </button>
            {context && (
              <p className="text-faint text-[11px] text-center leading-snug px-1">{context.viewerDetail}</p>
            )}
          </div>
        )}
        <ShareGameLinkCard gameCode={gameCode} />
      </div>
    </div>
  )
}
