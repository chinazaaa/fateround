'use client'

import {
  MONOPOLY_BOARD,
  MONOPOLY_COLOR_CLASSES,
  parsePropertyOwners,
  playerProperties,
  spaceAt,
  type MonopolyColorGroup,
} from '@/lib/monopoly'
import type { MonopolyPlayerState, Player } from '@/types'
import {
  DICE_PIPS,
  boardEdgeForSpace,
  boardSpaceLines,
  spaceIcon,
  tokenColorForOrder,
} from '@/components/monopoly/monopoly-ui'

function colorBar(color?: MonopolyColorGroup): string {
  if (!color) return 'bg-neutral-400/80'
  return MONOPOLY_COLOR_CLASSES[color] ?? 'bg-neutral-400'
}

function playerOrderMap(states: MonopolyPlayerState[]): Map<string, number> {
  return new Map(states.map((s) => [s.player_id, s.player_order]))
}

function playerName(players: Player[], id: string): string {
  return players.find((p) => p.id === id)?.name ?? '?'
}

function playerInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

export function MonopolyDiceFace({ value, rolling }: { value: number; rolling?: boolean }) {
  const pips = DICE_PIPS[value] ?? DICE_PIPS[1]!
  return (
    <div
      className={[
        'relative h-14 w-14 rounded-xl bg-gradient-to-br from-white to-neutral-100 shadow-lg',
        'border-2 border-neutral-200 flex items-center justify-center',
        rolling ? 'animate-pulse scale-105' : '',
      ].join(' ')}
      aria-label={`Die showing ${value}`}
    >
      <div className="grid grid-cols-3 grid-rows-3 gap-0.5 h-9 w-9">
        {Array.from({ length: 9 }, (_, i) => {
          const row = Math.floor(i / 3)
          const col = i % 3
          const show = pips.some(([r, c]) => r === row && c === col)
          return (
            <div key={i} className="flex items-center justify-center">
              {show ? <div className="h-2 w-2 rounded-full bg-neutral-900 shadow-sm" /> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function MonopolyDiceRoll({
  dice,
  rolling,
}: {
  dice: { d1: number; d2: number; doubles?: boolean } | null | undefined
  rolling?: boolean
}) {
  if (!dice) {
    return (
      <div className="flex items-center justify-center gap-3">
        <MonopolyDiceFace value={1} rolling={rolling} />
        <MonopolyDiceFace value={1} rolling={rolling} />
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center justify-center gap-3">
        <MonopolyDiceFace value={dice.d1} rolling={rolling} />
        <MonopolyDiceFace value={dice.d2} rolling={rolling} />
      </div>
      <p className="text-sm font-bold text-muted tabular-nums">
        {dice.d1 + dice.d2}
        {dice.doubles ? ' · Doubles!' : ''}
      </p>
    </div>
  )
}

function BoardSpaceCell({
  spaceIndex,
  states,
  players,
  owners,
  highlightIndex,
  edge,
}: {
  spaceIndex: number
  states: MonopolyPlayerState[]
  players: Player[]
  owners: Record<string, string>
  highlightIndex?: number | null
  edge: ReturnType<typeof boardEdgeForSpace>
}) {
  const space = spaceAt(spaceIndex)
  const ownerId = owners[String(spaceIndex)]
  const orderMap = playerOrderMap(states)
  const tokens = states.filter((s) => !s.bankrupt && s.position === spaceIndex)
  const highlighted = highlightIndex === spaceIndex
  const isCorner = edge === 'corner'
  const icon = spaceIcon(space.type)
  const lines = boardSpaceLines(space.name, space.type)

  return (
    <div
      title={space.name}
      className={[
        'relative flex overflow-hidden rounded-[3px] border bg-[#faf8f2] text-neutral-900 shadow-sm',
        'transition-all duration-200 h-full w-full',
        highlighted
          ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-emerald-900 z-10'
          : 'border-neutral-300/80',
        isCorner ? 'flex-col' : edge === 'bottom' || edge === 'top' ? 'flex-col' : 'flex-row',
      ].join(' ')}
    >
      {edge === 'bottom' && space.color && <div className={['h-2 w-full shrink-0', colorBar(space.color)].join(' ')} />}
      {edge === 'top' && space.color && <div className={['order-last h-2 w-full shrink-0', colorBar(space.color)].join(' ')} />}
      {edge === 'left' && space.color && <div className={['w-2 h-full shrink-0', colorBar(space.color)].join(' ')} />}
      {edge === 'right' && space.color && <div className={['order-last w-2 h-full shrink-0', colorBar(space.color)].join(' ')} />}
      {isCorner && !space.color && <div className="h-1 shrink-0 bg-neutral-200" />}

      <div className="flex flex-1 min-w-0 min-h-0 flex-col items-center justify-center gap-px p-0.5">
        {isCorner && icon && <span className="text-base sm:text-lg leading-none">{icon}</span>}
        {!isCorner && space.price != null && !ownerId && (
          <span className="text-[7px] sm:text-[8px] font-bold text-neutral-500 leading-none">£{space.price}</span>
        )}
        <div className="flex flex-col items-center justify-center leading-[1.08] gap-px">
          {lines.map((line, i) => (
            <span
              key={i}
              className={[
                'font-bold text-neutral-800 text-center',
                isCorner ? 'text-[9px] sm:text-[10px]' : 'text-[7px] sm:text-[8px]',
              ].join(' ')}
            >
              {line}
            </span>
          ))}
        </div>
      </div>

      {ownerId && (
        <div
          className={[
            'absolute z-[1] rounded-sm px-0.5 py-px text-[6px] font-bold text-white leading-none max-w-[90%] truncate',
            tokenColorForOrder(orderMap.get(ownerId) ?? 0).bg,
            edge === 'bottom' ? 'bottom-0.5 left-0.5 right-0.5' : '',
            edge === 'top' ? 'top-0.5 left-0.5 right-0.5' : '',
            edge === 'left' ? 'left-1 bottom-0.5' : '',
            edge === 'right' ? 'right-1 bottom-0.5' : '',
            isCorner ? 'bottom-0.5 left-0.5 right-0.5' : '',
          ].join(' ')}
        >
          {playerName(players, ownerId).slice(0, 6)}
        </div>
      )}

      {tokens.length > 0 && (
        <div
          className={[
            'absolute z-[2] flex gap-0.5',
            edge === 'bottom' ? 'top-0.5 right-0.5' : '',
            edge === 'top' ? 'bottom-0.5 right-0.5' : '',
            edge === 'left' ? 'top-0.5 right-0.5' : '',
            edge === 'right' ? 'top-0.5 left-0.5' : '',
            isCorner ? 'top-1 right-1' : '',
          ].join(' ')}
        >
          {tokens.map((t) => {
            const c = tokenColorForOrder(t.player_order)
            return (
              <span
                key={t.player_id}
                className={[
                  'flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-black ring-1',
                  c.bg,
                  c.ring,
                  'text-white shadow-md',
                ].join(' ')}
                title={playerName(players, t.player_id)}
              >
                {playerInitial(playerName(players, t.player_id))}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

const BOTTOM_SPACES = [9, 8, 7, 6, 5, 4, 3, 2, 1] as const
const LEFT_SPACES = [11, 12, 13, 14, 15, 16, 17, 18, 19] as const
const TOP_SPACES = [21, 22, 23, 24, 25, 26, 27, 28, 29] as const
const RIGHT_SPACES = [31, 32, 33, 34, 35, 36, 37, 38, 39] as const

function BoardCellWrapper({
  spaceIndex,
  states,
  players,
  owners,
  highlightIndex,
}: {
  spaceIndex: number
  states: MonopolyPlayerState[]
  players: Player[]
  owners: Record<string, string>
  highlightIndex?: number | null
}) {
  return (
    <BoardSpaceCell
      spaceIndex={spaceIndex}
      states={states}
      players={players}
      owners={owners}
      highlightIndex={highlightIndex}
      edge={boardEdgeForSpace(spaceIndex)}
    />
  )
}

export function MonopolyClassicBoard({
  states,
  players,
  propertyOwners,
  highlightIndex,
  center,
}: {
  states: MonopolyPlayerState[]
  players: Player[]
  propertyOwners: Record<string, string> | unknown
  highlightIndex?: number | null
  center?: React.ReactNode
}) {
  const owners = parsePropertyOwners(propertyOwners)

  return (
    <div className="mx-auto w-full max-w-[min(100vw-1rem,580px)]">
      <div
        className={[
          'relative aspect-square rounded-2xl p-1.5 sm:p-2.5',
          'bg-gradient-to-br from-emerald-800 via-emerald-900 to-teal-950',
          'border-[3px] border-amber-700/90 shadow-[0_20px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12)]',
        ].join(' ')}
      >
        <div className="flex h-full w-full flex-col gap-0.5 sm:gap-1">
          {/* Top row: Free Parking — properties — Go To Jail */}
          <div className="flex h-[13%] min-h-[44px] gap-0.5 sm:gap-1">
            <div className="aspect-square h-full shrink-0">
              <BoardCellWrapper spaceIndex={20} states={states} players={players} owners={owners} highlightIndex={highlightIndex} />
            </div>
            <div className="flex flex-1 gap-0.5 sm:gap-1">
              {TOP_SPACES.map((idx) => (
                <div key={idx} className="flex-1 min-w-0">
                  <BoardCellWrapper spaceIndex={idx} states={states} players={players} owners={owners} highlightIndex={highlightIndex} />
                </div>
              ))}
            </div>
            <div className="aspect-square h-full shrink-0">
              <BoardCellWrapper spaceIndex={30} states={states} players={players} owners={owners} highlightIndex={highlightIndex} />
            </div>
          </div>

          {/* Middle: left column — center — right column */}
          <div className="flex min-h-0 flex-1 gap-0.5 sm:gap-1">
            <div className="flex w-[13%] min-w-[36px] shrink-0 flex-col gap-0.5 sm:gap-1">
              {LEFT_SPACES.map((idx) => (
                <div key={idx} className="flex-1 min-h-0">
                  <BoardCellWrapper spaceIndex={idx} states={states} players={players} owners={owners} highlightIndex={highlightIndex} />
                </div>
              ))}
            </div>

            <div
              className={[
                'flex flex-1 flex-col items-center justify-center rounded-xl min-w-0',
                'bg-gradient-to-br from-emerald-700/90 to-emerald-950/95',
                'border border-emerald-600/40 shadow-inner p-2 sm:p-4 text-center',
              ].join(' ')}
            >
              {center ?? (
                <>
                  <p className="text-xl sm:text-2xl font-black tracking-tight text-amber-300 drop-shadow-sm">
                    MONOPOLY
                  </p>
                  <p className="text-[9px] sm:text-[10px] text-emerald-200/70 mt-0.5 uppercase tracking-[0.15em]">
                    Property Trading Game
                  </p>
                </>
              )}
            </div>

            <div className="flex w-[13%] min-w-[36px] shrink-0 flex-col gap-0.5 sm:gap-1">
              {RIGHT_SPACES.map((idx) => (
                <div key={idx} className="flex-1 min-h-0">
                  <BoardCellWrapper spaceIndex={idx} states={states} players={players} owners={owners} highlightIndex={highlightIndex} />
                </div>
              ))}
            </div>
          </div>

          {/* Bottom row: Jail — properties — GO */}
          <div className="flex h-[13%] min-h-[44px] gap-0.5 sm:gap-1">
            <div className="aspect-square h-full shrink-0">
              <BoardCellWrapper spaceIndex={10} states={states} players={players} owners={owners} highlightIndex={highlightIndex} />
            </div>
            <div className="flex flex-1 gap-0.5 sm:gap-1">
              {BOTTOM_SPACES.map((idx) => (
                <div key={idx} className="flex-1 min-w-0">
                  <BoardCellWrapper spaceIndex={idx} states={states} players={players} owners={owners} highlightIndex={highlightIndex} />
                </div>
              ))}
            </div>
            <div className="aspect-square h-full shrink-0">
              <BoardCellWrapper spaceIndex={0} states={states} players={players} owners={owners} highlightIndex={highlightIndex} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function MonopolyCurrentSpace({
  index,
  ownerName,
}: {
  index: number
  ownerName?: string | null
}) {
  const space = spaceAt(index)
  const icon = spaceIcon(space.type)

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--card-strong)] shadow-[var(--card-shadow)]">
      {space.color ? (
        <div className={['h-2.5 w-full', colorBar(space.color)].join(' ')} />
      ) : (
        <div className="h-2 w-full bg-gradient-to-r from-[var(--primary)] to-[var(--primary-strong)]" />
      )}
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          {icon && (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-inset-bg)] text-xl">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              You landed on
            </p>
            <p className="mt-0.5 text-xl sm:text-2xl font-black text-[var(--foreground)] leading-tight">{space.name}</p>
            {space.price != null && (
              <p className="mt-2 text-sm text-muted">
                {ownerName ? (
                  <>
                    Owned by <span className="font-bold text-[var(--foreground)]">{ownerName}</span>
                    {space.rent != null ? ` · Rent £${space.rent}` : ''}
                  </>
                ) : (
                  <>
                    For sale · <span className="font-bold text-[var(--marry)]">£{space.price}</span>
                    {space.rent != null ? ` · Rent £${space.rent}` : ''}
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function MonopolyMyProperties({
  playerId,
  propertyOwners,
  players,
}: {
  playerId: string
  propertyOwners: Record<string, string> | unknown
  players: Player[]
}) {
  const owners = parsePropertyOwners(propertyOwners)
  const props = playerProperties(owners, playerId)

  return (
    <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--card-strong)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-3">
        My properties ({props.length})
      </p>
      {props.length === 0 ? (
        <p className="text-sm text-faint text-center py-3">No properties yet — start buying!</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
          {props.map((space) => (
            <div
              key={space.index}
              className="flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] px-3 py-2"
            >
              {space.color && (
                <span className={['h-8 w-1.5 shrink-0 rounded-full', colorBar(space.color)].join(' ')} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[var(--foreground)] truncate">{space.name}</p>
                <p className="text-[10px] text-faint">
                  £{space.price}
                  {space.rent != null ? ` · Rent $${space.rent}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function MonopolyPlayerList({
  states,
  players,
  currentPlayerId,
  propertyOwners,
  myPlayerId,
}: {
  states: MonopolyPlayerState[]
  players: Player[]
  currentPlayerId?: string | null
  propertyOwners: Record<string, string> | unknown
  myPlayerId?: string | null
}) {
  const owners = parsePropertyOwners(propertyOwners)

  return (
    <div className="space-y-2">
      {states
        .slice()
        .sort((a, b) => a.player_order - b.player_order)
        .map((state) => {
          const player = players.find((p) => p.id === state.player_id)
          const name = player?.name ?? 'Player'
          const props = playerProperties(owners, state.player_id)
          const isTurn = state.player_id === currentPlayerId
          const isMe = state.player_id === myPlayerId
          const token = tokenColorForOrder(state.player_order)

          return (
            <div
              key={state.player_id}
              className={[
                'flex items-center gap-3 rounded-2xl border px-3 py-3 transition-all',
                isMe
                  ? 'border-[color-mix(in_srgb,var(--primary)_40%,var(--border-strong))] bg-[color-mix(in_srgb,var(--primary)_10%,var(--surface-inset-bg))] ring-1 ring-[color-mix(in_srgb,var(--primary)_20%,transparent)]'
                  : isTurn
                    ? 'border-[color-mix(in_srgb,var(--marry)_45%,var(--border-strong))] bg-[color-mix(in_srgb,var(--marry)_10%,var(--surface-inset-bg))] shadow-[var(--card-shadow-glow)]'
                    : 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
                state.bankrupt ? 'opacity-40 grayscale' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black ring-2 shadow-lg',
                  token.bg,
                  token.ring,
                  'text-white',
                ].join(' ')}
              >
                {playerInitial(name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="font-bold truncate text-[var(--foreground)]">
                    {name}
                    {isMe && (
                      <span className="ml-1.5 text-xs font-normal text-[var(--primary)]">(you)</span>
                    )}
                  </p>
                  {isTurn && (
                    <span className="rounded-full bg-[color-mix(in_srgb,var(--marry)_20%,transparent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--marry)]">
                      Turn
                    </span>
                  )}
                  {state.in_jail && (
                    <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-bold text-orange-500">
                      Jail
                    </span>
                  )}
                  {state.bankrupt && (
                    <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-500">
                      Out
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5 text-faint">
                  {props.length} propert{props.length === 1 ? 'y' : 'ies'} · Space {state.position}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase tracking-wide text-faint">
                  Cash
                </p>
                <p className="text-lg font-black tabular-nums text-[var(--primary)]">£{state.cash.toLocaleString('en-GB')}</p>
              </div>
            </div>
          )
        })}
    </div>
  )
}

/** Legacy grid — kept for fallback / compact list view */
export function MonopolyBoardGrid(props: Parameters<typeof MonopolyClassicBoard>[0]) {
  return <MonopolyClassicBoard {...props} />
}
