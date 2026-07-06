'use client'

import { useState, type DragEvent } from 'react'
import {
  canDeclareMahjongForRuleset,
  currentMahjongPlayerId,
  mahjongClaimOptionsForPlayer,
  mahjongSelfKongOptions,
  mahjongTileShortLabel,
  MAHJONG_SEAT_LABELS,
  sortMahjongTiles,
} from '@/lib/mahjong'
import { isTenpai } from '@/lib/mahjong-hand'
import type { MahjongClaimType, MahjongPlayerState, MahjongSession, Player } from '@/types'
import { MahjongCard, MahjongTurnBar } from '@/components/mahjong/MahjongChrome'
import { MahjongTileFace } from '@/components/mahjong/MahjongTileFace'

function TileButton({
  tile,
  onClick,
  disabled,
  draggable,
  onDragStart,
  onDragEnd,
  title,
}: {
  tile: string
  onClick?: () => void
  disabled?: boolean
  draggable?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  title?: string
}) {
  const className = [
    'rounded-lg transition-all',
    onClick && !disabled ? 'hover:scale-105 active:scale-95 cursor-pointer' : '',
    disabled ? 'opacity-45 cursor-not-allowed' : '',
  ].join(' ')

  if (!onClick)
    return (
      <span className={`${className} inline-flex items-center justify-center`}>
        <MahjongTileFace tile={tile} />
      </span>
    )

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      draggable={draggable && !disabled}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/mahjong-tile', tile)
        onDragStart?.()
      }}
      onDragEnd={onDragEnd}
      title={title}
      className={className}
    >
      <MahjongTileFace tile={tile} />
    </button>
  )
}

function MiniTile({ tile }: { tile: string }) {
  return (
    <span className="inline-flex items-center justify-center rounded-md">
      <MahjongTileFace tile={tile} compact />
    </span>
  )
}

function claimButtonLabel(option: { type: MahjongClaimType; tiles?: string[] }): string {
  if (option.type === 'mahjong') return 'Mahjong'
  if (option.type === 'chow' && option.tiles?.length) {
    return `CHOW ${option.tiles.map(mahjongTileShortLabel).join(' ')}`
  }
  return option.type.toUpperCase()
}

function SeatBoardPanel({
  state,
  player,
  current,
  isMe,
  score,
}: {
  state: MahjongPlayerState
  player?: Player
  current: boolean
  isMe: boolean
  score?: number
}) {
  const handCount = state.hand_count ?? state.hand.length

  return (
    <MahjongCard
      className={[
        'p-2.5 sm:p-3 space-y-2 border min-h-28 sm:min-h-32',
        current ? 'border-[var(--primary)]/50 bg-[var(--primary)]/10' : 'border-[var(--border)]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
            {MAHJONG_SEAT_LABELS[state.seat]}
          </p>
          <p className="font-black text-sm truncate">
            {player?.name ?? 'Player'}
            {isMe ? ' (you)' : ''}
          </p>
        </div>
        <span className="text-xs text-faint shrink-0">{score != null ? `${score} pts` : `${handCount} tiles`}</span>
      </div>
      {score != null && <p className="text-[10px] text-faint">{handCount} tiles</p>}
      {(state.riichi_declared || state.permanent_furiten || state.temporary_furiten) && (
        <div className="flex flex-wrap gap-1">
          {state.riichi_declared && (
            <span className="rounded-full bg-[var(--primary)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--primary)]">
              Riichi
            </span>
          )}
          {(state.permanent_furiten || state.temporary_furiten) && (
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-500">Furiten</span>
          )}
        </div>
      )}

      {state.melds.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Melds</p>
          <div className="flex flex-wrap gap-1">
            {state.melds.map((meld, index) => (
              <span key={`${meld.type}-${index}`} className="rounded-lg bg-[var(--surface-inset-bg)] px-2 py-1">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-faint">
                  {meld.type}
                </span>
                <span className="flex flex-wrap gap-1">
                  {meld.tiles.map((tile, tileIndex) => (
                    <MiniTile key={`${tile}-${tileIndex}`} tile={tile} />
                  ))}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {(state.flowers?.length ?? 0) > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Flowers</p>
          <div className="flex flex-wrap gap-1">
            {state.flowers?.map((tile, index) => (
              <MiniTile key={`${tile}-${index}`} tile={tile} />
            ))}
          </div>
        </div>
      )}

      {state.discarded.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">River</p>
          <div className="flex flex-wrap gap-1 max-h-20 overflow-hidden">
            {state.discarded.slice(-14).map((tile, index) => (
              <MiniTile key={`${tile}-${index}`} tile={tile} />
            ))}
          </div>
        </div>
      )}
    </MahjongCard>
  )
}

function WallPreview({ remaining }: { remaining: number }) {
  const visible = Math.max(0, Math.min(28, Math.ceil(remaining / 3)))
  return (
    <div className="grid grid-cols-7 gap-1" aria-hidden>
      {Array.from({ length: 28 }, (_, index) => (
        <span
          key={index}
          className={[
            'h-3 rounded-sm border',
            index < visible
              ? 'border-[var(--primary)]/40 bg-[var(--primary)]/20'
              : 'border-[var(--border)] bg-[var(--surface-inset-bg)] opacity-35',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

function MahjongTableBoard({
  session,
  states,
  players,
  myPlayerId,
  currentPlayerId,
  canDiscard,
  dragTile,
  onDropDiscard,
}: {
  session: MahjongSession
  states: MahjongPlayerState[]
  players: Player[]
  myPlayerId: string | null
  currentPlayerId: string | null
  canDiscard: boolean
  dragTile: string | null
  onDropDiscard: (tile: string) => void
}) {
  const bySeat = Object.fromEntries(states.map((state) => [state.seat, state])) as Partial<
    Record<MahjongPlayerState['seat'], MahjongPlayerState>
  >
  const lastDiscard = session.last_discard
  const lastDiscardPlayer = players.find((p) => p.id === lastDiscard?.player_id)

  const seatPanel = (seat: MahjongPlayerState['seat']) => {
    const state = bySeat[seat]
    if (!state) return null
    return (
      <SeatBoardPanel
        state={state}
        player={players.find((p) => p.id === state.player_id)}
        current={state.player_id === currentPlayerId}
        isMe={state.player_id === myPlayerId}
        score={session.scores?.[state.player_id]}
      />
    )
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!canDiscard) return
    event.preventDefault()
    const tile = event.dataTransfer.getData('text/mahjong-tile') || dragTile
    if (tile) onDropDiscard(tile)
  }

  return (
    <MahjongCard className="p-2.5 sm:p-4">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,1.15fr)_minmax(0,1fr)] sm:grid-rows-[auto_minmax(16rem,1fr)_auto]">
        <div className="sm:col-start-2">{seatPanel('west')}</div>
        <div className="sm:col-start-1 sm:row-start-2">{seatPanel('north')}</div>

        <div
          className={[
            'col-span-2 sm:col-span-1 sm:col-start-2 sm:row-start-2 min-h-56 sm:min-h-64 rounded-2xl border bg-[var(--surface-inset-bg)] p-3 sm:p-4 flex flex-col items-center justify-center text-center transition-all',
            canDiscard
              ? 'border-[var(--primary)]/45 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]'
              : 'border-[var(--border)]',
            dragTile ? 'bg-[var(--primary)]/10 scale-[1.01]' : '',
          ].join(' ')}
          onDragOver={(event) => {
            if (canDiscard) event.preventDefault()
          }}
          onDrop={handleDrop}
        >
          <div className="w-full max-w-52 space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-bg)] p-3 space-y-2">
              <p className="label-caps">Wall</p>
              <p className="text-3xl font-black">{session.wall.length}</p>
              {(session.dead_wall?.length ?? 0) > 0 && (
                <p className="text-[10px] font-bold uppercase tracking-wider text-faint">
                  Dead wall {session.dead_wall?.length}
                </p>
              )}
              <WallPreview remaining={session.wall.length} />
            </div>

            {(session.dora_indicators?.length ?? 0) > 0 && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-bg)] p-3 space-y-2">
                <p className="label-caps">Dora</p>
                <div className="flex justify-center gap-1">
                  {session.dora_indicators?.map((tile, index) => (
                    <MiniTile key={`${tile}-${index}`} tile={tile} />
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-bg)] p-3 space-y-2">
              <p className="label-caps">Table discard</p>
              {lastDiscard ? (
                <>
                  <div className="flex justify-center">
                    <TileButton tile={lastDiscard.tile} />
                  </div>
                  <p className="text-xs text-faint">by {lastDiscardPlayer?.name ?? 'Player'}</p>
                </>
              ) : (
                <p className="text-sm text-faint">No discard yet</p>
              )}
            </div>

            {canDiscard && (
              <p className="text-xs font-semibold text-[var(--primary)]">
                {dragTile ? 'Release here to discard.' : 'Drag a hand tile here, or tap a tile below.'}
              </p>
            )}
          </div>
        </div>

        <div className="sm:col-start-3 sm:row-start-2">{seatPanel('south')}</div>
        <div className="sm:col-start-2 sm:row-start-3">{seatPanel('east')}</div>
      </div>
    </MahjongCard>
  )
}

export function MahjongGamePanel({
  session,
  states,
  players,
  myPlayerId,
  isViewer,
  secondsLeft,
  hasTimer,
  urgent,
  acting,
  onDiscard,
  onClaim,
  onRiichi,
  onPass,
}: {
  session: MahjongSession
  states: MahjongPlayerState[]
  players: Player[]
  myPlayerId: string | null
  isViewer?: boolean
  secondsLeft: number
  hasTimer: boolean
  urgent: boolean
  acting?: boolean
  onDiscard?: (tile: string) => void
  onClaim?: (claimType: MahjongClaimType, tiles?: string[]) => void
  onRiichi?: () => void
  onPass?: () => void
}) {
  const [dragTile, setDragTile] = useState<string | null>(null)
  const currentPlayerId = currentMahjongPlayerId(session)
  const currentPlayer = players.find((p) => p.id === currentPlayerId)
  const myState = myPlayerId ? states.find((s) => s.player_id === myPlayerId) : undefined
  const isMyTurn = !!myPlayerId && currentPlayerId === myPlayerId && !isViewer
  const myClaimOptions = myPlayerId ? mahjongClaimOptionsForPlayer(session, states, myPlayerId) : []
  const mySelfKongOptions = session.phase === 'discard' && isMyTurn ? mahjongSelfKongOptions(myState) : []
  const canRiichi =
    session.ruleset === 'riichi' &&
    !!myState &&
    session.phase === 'discard' &&
    isMyTurn &&
    !myState.riichi_declared &&
    myState.melds.every((meld) => !meld.from_player_id || meld.concealed) &&
    isTenpai(myState.hand, myState.melds)
  const canSelfWin =
    !!myState &&
    session.phase === 'discard' &&
    isMyTurn &&
    canDeclareMahjongForRuleset(myState.hand, myState.melds, session.ruleset)

  return (
    <div className="space-y-4">
      <MahjongTurnBar
        turnPlayerName={currentPlayer?.name}
        isMyTurn={isMyTurn}
        phase={session.phase}
        secondsLeft={secondsLeft}
        hasTimer={hasTimer}
        urgent={urgent}
      />

      <MahjongTableBoard
        session={session}
        states={states}
        players={players}
        myPlayerId={myPlayerId}
        currentPlayerId={currentPlayerId}
        canDiscard={isMyTurn && session.phase === 'discard' && !acting}
        dragTile={dragTile}
        onDropDiscard={(tile) => {
          setDragTile(null)
          onDiscard?.(tile)
        }}
      />

      {session.status_message && (
        <p className="text-center text-sm text-muted rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)] px-3 py-2">
          {session.status_message}
        </p>
      )}

      {myState && !isViewer && (
        <MahjongCard className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="label-caps">Your hand</p>
            <p className="text-xs text-faint">{myState.hand.length} tiles</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sortMahjongTiles(myState.hand).map((tile, index) => (
              <TileButton
                key={`${tile}-${index}`}
                tile={tile}
                onClick={isMyTurn && session.phase === 'discard' ? () => onDiscard?.(tile) : undefined}
                draggable={isMyTurn && session.phase === 'discard'}
                onDragStart={() => setDragTile(tile)}
                onDragEnd={() => setDragTile(null)}
                title={isMyTurn && session.phase === 'discard' ? 'Tap or drag to discard' : undefined}
                disabled={acting}
              />
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {canSelfWin && (
              <button
                type="button"
                onClick={() => onClaim?.('mahjong')}
                disabled={acting}
                className="btn-primary py-2.5 text-sm"
              >
                Mahjong
              </button>
            )}
            {canRiichi && (
              <button type="button" onClick={onRiichi} disabled={acting} className="btn-secondary py-2.5 text-sm">
                Riichi
              </button>
            )}
            {mySelfKongOptions.map((option) => (
              <button
                key={`self-kong-${option.source}-${option.tiles?.join('-')}`}
                type="button"
                onClick={() => onClaim?.('kong', option.tiles)}
                disabled={acting}
                className="btn-secondary py-2.5 text-sm"
              >
                {option.source === 'added' ? 'ADD KONG' : 'KONG'}{' '}
                {option.tiles?.[0] ? mahjongTileShortLabel(option.tiles[0]) : ''}
              </button>
            ))}
            {myClaimOptions.map((option) => (
              <button
                key={`${option.type}-${option.tiles?.join('-') ?? 'win'}`}
                type="button"
                onClick={() => onClaim?.(option.type, option.tiles)}
                disabled={acting}
                className={option.type === 'mahjong' ? 'btn-primary py-2.5 text-sm' : 'btn-secondary py-2.5 text-sm'}
              >
                {claimButtonLabel(option)}
              </button>
            ))}
            {session.phase === 'claim' && myClaimOptions.length > 0 && (
              <button type="button" onClick={onPass} disabled={acting} className="btn-secondary py-2.5 text-sm">
                Pass
              </button>
            )}
          </div>
          {isMyTurn && session.phase === 'discard' && (
            <p className="text-center text-xs text-faint">Tap a tile, or drag it to the center discard zone.</p>
          )}
        </MahjongCard>
      )}

      {isViewer && <p className="text-center text-xs text-faint">Viewer mode hides private hands.</p>}
    </div>
  )
}
