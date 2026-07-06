'use client'

import {
  MONOPOLY_COLOR_CLASSES,
  parsePropertyOwners,
  playerProperties,
  effectivePropertyOwners,
  spaceAt,
  type MonopolyColorGroup,
  type MonopolySpace,
} from '@/lib/monopoly'
import { computeRent, parseBuildings, parseMortgaged, buildingLevel } from '@/lib/monopoly-rent'
import { MONOPOLY_HOTEL_LEVEL } from '@/lib/monopoly-board'
import { monopolyTokenById, monopolyTokenEmoji } from '@/lib/monopoly-tokens'
import {
  formatThemedMoney,
  themedSpaceName,
  getMonopolyEdition,
  getBoardPalette,
} from '@/components/monopoly/monopoly-themes'
import type { MonopolyPlayerState, Player } from '@/types'
import {
  DICE_PIPS,
  boardEdgeForSpace,
  boardGridCell,
  boardSpaceLines,
  spaceIcon,
  tokenColorForOrder,
} from '@/components/monopoly/monopoly-ui'

function colorBar(color?: MonopolyColorGroup): string {
  if (!color) return 'bg-neutral-400/80'
  return MONOPOLY_COLOR_CLASSES[color] ?? 'bg-neutral-400'
}

function playerPosition(state: MonopolyPlayerState): number {
  return Number(state.position)
}

function playersOnSpace(states: MonopolyPlayerState[], spaceIndex: number): MonopolyPlayerState[] {
  return states.filter((s) => !s.bankrupt && playerPosition(s) === spaceIndex)
}

function playerOrderMap(states: MonopolyPlayerState[]): Map<string, number> {
  return new Map(states.map((s) => [s.player_id, s.player_order]))
}

function playerName(players: Player[], id: string): string {
  return players.find((p) => p.id === id)?.name ?? '?'
}

function playerTokenEmoji(players: Player[], playerId: string, playerOrder: number): string {
  const player = players.find((p) => p.id === playerId)
  return monopolyTokenEmoji(player?.monopoly_token, playerOrder)
}

/** Shows the player's chosen board token — helps them spot themselves on the green board. */
export function MonopolyYourTokenChip({
  players,
  playerId,
  playerOrder,
  compact = false,
}: {
  players: Player[]
  playerId: string
  playerOrder: number
  compact?: boolean
}) {
  const player = players.find((p) => p.id === playerId)
  const emoji = monopolyTokenEmoji(player?.monopoly_token, playerOrder)
  const label = monopolyTokenById(player?.monopoly_token)?.label ?? 'Token'
  const colors = tokenColorForOrder(playerOrder)

  if (compact) {
    return (
      <span
        className={[
          'inline-flex h-8 w-8 items-center justify-center rounded-full text-lg ring-2 shadow-md',
          colors.bg,
          colors.ring,
        ].join(' ')}
        title={`Your token: ${label}`}
      >
        {emoji}
      </span>
    )
  }

  return (
    <div
      className={[
        'inline-flex items-center gap-2 rounded-xl border border-amber-400/40 bg-emerald-950/55 px-2.5 py-1.5 shadow-lg',
      ].join(' ')}
      title={`Your token on the board: ${label}`}
    >
      <span
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl ring-2',
          colors.bg,
          colors.ring,
        ].join(' ')}
      >
        {emoji}
      </span>
      <div className="text-left min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-200/75 leading-none">Your token</p>
        <p className="text-xs font-bold text-white truncate">{label}</p>
      </div>
    </div>
  )
}

function BoardBuildingBadge({
  spaceIndex,
  buildings,
  edge,
}: {
  spaceIndex: number
  buildings: Record<string, number>
  edge: ReturnType<typeof boardEdgeForSpace>
}) {
  const space = spaceAt(spaceIndex)
  if (space.type !== 'property') return null
  const level = buildingLevel(buildings, spaceIndex)
  if (level <= 0) return null

  const positionClass = edge === 'left' ? 'top-0.5 left-1' : edge === 'right' ? 'top-0.5 right-1' : 'top-0.5 left-0.5'

  if (level === MONOPOLY_HOTEL_LEVEL) {
    return (
      <span
        className={['absolute z-[1] text-[9px] sm:text-[10px] leading-none drop-shadow-sm', positionClass].join(' ')}
        title="Hotel"
      >
        🏨
      </span>
    )
  }

  return (
    <span
      className={[
        'absolute z-[1] flex items-center gap-px text-[7px] sm:text-[8px] font-bold leading-none text-amber-900 drop-shadow-sm',
        positionClass,
      ].join(' ')}
      title={`${level} house${level === 1 ? '' : 's'}`}
    >
      <span>{level}</span>
      <span className="text-[8px] sm:text-[9px]">🏠</span>
    </span>
  )
}

export function MonopolyDiceFace({
  value,
  rolling,
  compact = false,
}: {
  value: number
  rolling?: boolean
  compact?: boolean
}) {
  const pips = DICE_PIPS[value] ?? DICE_PIPS[1]!
  const sizeClass = compact ? 'h-9 w-9 rounded-lg' : 'h-14 w-14 rounded-xl'
  const pipGridClass = compact ? 'h-5 w-5 gap-px' : 'h-9 w-9 gap-0.5'
  const pipDotClass = compact ? 'h-1 w-1' : 'h-2 w-2'
  return (
    <div
      className={[
        'relative bg-gradient-to-br from-white to-neutral-100 shadow-lg',
        'border-2 border-neutral-200 flex items-center justify-center',
        sizeClass,
        rolling ? 'animate-pulse scale-105' : '',
      ].join(' ')}
      aria-label={`Die showing ${value}`}
    >
      <div className={['grid grid-cols-3 grid-rows-3', pipGridClass].join(' ')}>
        {Array.from({ length: 9 }, (_, i) => {
          const row = Math.floor(i / 3)
          const col = i % 3
          const show = pips.some(([r, c]) => r === row && c === col)
          return (
            <div key={i} className="flex items-center justify-center">
              {show ? <div className={['rounded-full bg-neutral-900 shadow-sm', pipDotClass].join(' ')} /> : null}
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
  compact = false,
}: {
  dice: { d1: number; d2: number; doubles?: boolean } | null | undefined
  rolling?: boolean
  compact?: boolean
}) {
  const gapClass = compact ? 'gap-2' : 'gap-3'
  if (!dice) {
    return (
      <div className={['flex items-center justify-center', gapClass].join(' ')}>
        <MonopolyDiceFace value={1} rolling={rolling} compact={compact} />
        <MonopolyDiceFace value={1} rolling={rolling} compact={compact} />
      </div>
    )
  }
  return (
    <div className={['flex flex-col items-center', compact ? 'gap-1' : 'gap-2'].join(' ')}>
      <div className={['flex items-center justify-center', gapClass].join(' ')}>
        <MonopolyDiceFace value={dice.d1} rolling={rolling} compact={compact} />
        <MonopolyDiceFace value={dice.d2} rolling={rolling} compact={compact} />
      </div>
      <p className={['font-bold text-muted tabular-nums', compact ? 'text-[10px]' : 'text-sm'].join(' ')}>
        {dice.d1 + dice.d2}
        {dice.doubles ? ' · Doubles!' : ''}
      </p>
    </div>
  )
}

function boardTileRentLabel(
  space: MonopolySpace,
  ownerId: string | undefined,
  owners: Record<string, string>,
  buildings: Record<string, number>,
  mortgaged: Record<string, boolean>,
  diceTotal: number,
  themeId?: string | null
): string | null {
  if (space.type !== 'property' && space.type !== 'station' && space.type !== 'utility') {
    return null
  }
  if (ownerId) {
    if (mortgaged[String(space.index)]) return 'Mortgaged'
    return formatThemedMoney(computeRent(space, owners, ownerId, diceTotal, buildings, mortgaged), themeId)
  }
  if (space.type === 'utility') return '4×/10×'
  if (space.type === 'station') return formatThemedMoney(space.rent ?? 25, themeId)
  if (space.rent != null) return formatThemedMoney(space.rent, themeId)
  return null
}

function BoardSpaceCell({
  spaceIndex,
  states,
  players,
  owners,
  buildings,
  mortgaged,
  diceTotal,
  highlightIndex,
  edge,
  myPlayerId,
  themeId,
}: {
  spaceIndex: number
  states: MonopolyPlayerState[]
  players: Player[]
  owners: Record<string, string>
  buildings: Record<string, number>
  mortgaged: Record<string, boolean>
  diceTotal: number
  highlightIndex?: number | null
  edge: ReturnType<typeof boardEdgeForSpace>
  myPlayerId?: string | null
  themeId?: string | null
}) {
  const space = spaceAt(spaceIndex)
  const ownerId = owners[String(spaceIndex)]
  const ownerLabel = ownerId ? playerName(players, ownerId) : null
  const orderMap = playerOrderMap(states)
  const tokens = playersOnSpace(states, spaceIndex)
  const highlighted = highlightIndex === spaceIndex
  const isCorner = edge === 'corner'
  const icon = spaceIcon(space.type, themeId)
  const lines = boardSpaceLines(space.name, space.type, spaceIndex, themeId)
  const rentLabel = boardTileRentLabel(space, ownerId, owners, buildings, mortgaged, diceTotal, themeId)
  const palette = getBoardPalette(themeId)
  const lineClass = [
    `font-extrabold ${palette.tileText} ${palette.tileFont ?? ''} leading-[1.05]`,
    isCorner ? 'text-[8px] sm:text-[10px]' : 'text-[7.2px] sm:text-[9px] md:text-[9.5px]',
  ].join(' ')

  return (
    <div
      title={themedSpaceName(space.name, spaceIndex, themeId)}
      className={[
        `relative flex overflow-hidden rounded-[2px] sm:rounded-[3px] border ${palette.tileBg} text-neutral-900 shadow-sm`,
        'transition-all duration-200 h-full w-full',
        highlighted
          ? `ring-1 sm:ring-2 ${palette.highlightRing} ring-offset-0 ${palette.highlightOffset} z-10`
          : palette.tileBorder,
        isCorner ? 'flex-col' : edge === 'bottom' || edge === 'top' ? 'flex-col' : 'flex-row',
      ].join(' ')}
    >
      {edge === 'bottom' && space.color && (
        <div className={['h-1 sm:h-2 w-full shrink-0', colorBar(space.color)].join(' ')} />
      )}
      {edge === 'top' && space.color && (
        <div className={['order-last h-1 sm:h-2 w-full shrink-0', colorBar(space.color)].join(' ')} />
      )}
      {edge === 'left' && space.color && (
        <div className={['w-1 sm:w-2 h-full shrink-0', colorBar(space.color)].join(' ')} />
      )}
      {edge === 'right' && space.color && (
        <div className={['order-last w-1 sm:w-2 h-full shrink-0', colorBar(space.color)].join(' ')} />
      )}
      {isCorner && !space.color && <div className={`h-0.5 sm:h-1 shrink-0 ${palette.cornerDivider}`} />}

      <div className="flex flex-1 min-w-0 min-h-0 flex-col items-center justify-center gap-px p-px sm:p-0.5">
        {isCorner && icon && <span className="text-[7px] sm:text-[10.5px] leading-none shrink-0">{icon}</span>}
        {!isCorner && (space.price != null || rentLabel) && (
          <div className="hidden sm:flex flex-col items-center gap-px leading-none">
            {space.price != null && !ownerId && (
              <span
                className={`text-[7.5px] sm:text-[9.5px] md:text-[10.5px] font-black ${palette.priceText} ${palette.tileFont ?? ''}`}
              >
                {formatThemedMoney(space.price!, themeId)}
              </span>
            )}
            {rentLabel && (
              <span
                className={[
                  'text-[6.2px] sm:text-[7.5px] md:text-[8.2px] font-bold tabular-nums',
                  rentLabel === 'Mortgaged' ? 'text-red-600' : palette.rentText,
                  palette.tileFont ?? '',
                ].join(' ')}
              >
                {rentLabel === 'Mortgaged' ? 'Mtg' : rentLabel}
              </span>
            )}
          </div>
        )}
        <div className="flex flex-col items-center justify-center gap-px min-w-0 max-w-full px-px text-center overflow-hidden">
          {lines.map((line, i) => (
            <span key={i} className={[lineClass, 'max-w-full break-all sm:break-words sm:tracking-tight'].join(' ')}>
              {line}
            </span>
          ))}
        </div>
      </div>

      {ownerId && ownerLabel && (
        <div
          title={`Owned by ${ownerLabel}`}
          className={[
            'absolute z-[1] rounded-sm px-px py-px text-[5px] sm:text-[6px] font-extrabold text-white leading-none max-w-[90%] truncate',
            tokenColorForOrder(orderMap.get(ownerId) ?? 0).bg,
            edge === 'bottom' ? 'bottom-px left-px right-px sm:bottom-0.5 sm:left-0.5 sm:right-0.5' : '',
            edge === 'top' ? 'top-px left-px right-px sm:top-0.5 sm:left-0.5 sm:right-0.5' : '',
            edge === 'left' ? 'left-0.5 bottom-px sm:left-1 sm:bottom-0.5' : '',
            edge === 'right' ? 'right-0.5 bottom-px sm:right-1 sm:bottom-0.5' : '',
            isCorner ? 'bottom-px left-px right-px sm:bottom-0.5 sm:left-0.5 sm:right-0.5' : '',
          ].join(' ')}
        >
          {ownerLabel.slice(0, 4)}
        </div>
      )}

      <BoardBuildingBadge spaceIndex={spaceIndex} buildings={buildings} edge={edge} />

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
            const emoji = playerTokenEmoji(players, t.player_id, t.player_order)
            const isMe = myPlayerId != null && t.player_id === myPlayerId
            return (
              <span
                key={t.player_id}
                className={[
                  'flex items-center justify-center rounded-full shadow-md',
                  isMe
                    ? `h-4 w-4 sm:h-6 sm:w-6 text-[9px] sm:text-sm ring-1 sm:ring-2 ${palette.myTokenRing} ring-offset-0 sm:ring-offset-1 ${palette.myTokenOffset} z-10 scale-110`
                    : 'h-3.5 w-3.5 sm:h-5 sm:w-5 text-[8px] sm:text-xs ring-1',
                  c.bg,
                  c.ring,
                ].join(' ')}
                title={isMe ? `You (${playerName(players, t.player_id)})` : playerName(players, t.player_id)}
              >
                {emoji}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BoardCellWrapper({
  spaceIndex,
  states,
  players,
  owners,
  buildings,
  mortgaged,
  diceTotal,
  highlightIndex,
  myPlayerId,
  themeId,
}: {
  spaceIndex: number
  states: MonopolyPlayerState[]
  players: Player[]
  owners: Record<string, string>
  buildings: Record<string, number>
  mortgaged: Record<string, boolean>
  diceTotal: number
  highlightIndex?: number | null
  myPlayerId?: string | null
  themeId?: string | null
}) {
  return (
    <BoardSpaceCell
      spaceIndex={spaceIndex}
      states={states}
      players={players}
      owners={owners}
      buildings={buildings}
      mortgaged={mortgaged}
      diceTotal={diceTotal}
      highlightIndex={highlightIndex}
      myPlayerId={myPlayerId}
      themeId={themeId}
      edge={boardEdgeForSpace(spaceIndex)}
    />
  )
}

const BOARD_SPACE_INDICES = Array.from({ length: 40 }, (_, index) => index)

export function MonopolyClassicBoard({
  states,
  players,
  propertyOwners,
  propertyBuildings,
  mortgagedProperties,
  lastDiceTotal = 2,
  highlightIndex,
  myPlayerId,
  center,
  mobileCenter,
  themeId,
}: {
  states: MonopolyPlayerState[]
  players: Player[]
  propertyOwners: Record<string, string> | unknown
  propertyBuildings?: unknown
  mortgagedProperties?: unknown
  lastDiceTotal?: number
  highlightIndex?: number | null
  myPlayerId?: string | null
  center?: React.ReactNode
  mobileCenter?: React.ReactNode
  themeId?: string | null
}) {
  const owners = effectivePropertyOwners(parsePropertyOwners(propertyOwners), states)
  const buildings = parseBuildings(propertyBuildings)
  const mortgaged = parseMortgaged(mortgagedProperties)
  const cellProps = {
    states,
    players,
    owners,
    buildings,
    mortgaged,
    diceTotal: lastDiceTotal,
    highlightIndex,
    myPlayerId,
    themeId,
  }

  const edition = getMonopolyEdition(themeId)
  const { boardPalette: p } = edition

  const defaultMobileCenter = (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center relative z-10">
      <p className={`${p.titleColor} ${p.titleFont ?? 'text-xs font-black tracking-[0.18em]'}`}>{edition.boardTitle}</p>
      <p className={`${p.subtitleColor} ${p.subtitleFont ?? 'text-[9px] uppercase tracking-widest'}`}>
        {edition.editionSubtitle}
      </p>
    </div>
  )

  const defaultDesktopCenter = center ?? (
    <div className="flex h-full w-full flex-col items-center justify-center relative z-10">
      <p className={`${p.titleColor} drop-shadow-sm ${p.titleFont ?? 'text-xl sm:text-2xl font-black tracking-tight'}`}>
        {edition.boardTitle}
      </p>
      <p
        className={`${p.subtitleColor} mt-0.5 ${p.subtitleFont ?? 'text-[9px] sm:text-[10px] uppercase tracking-[0.15em]'}`}
      >
        {edition.editionSubtitle}
      </p>
    </div>
  )

  return (
    <div className="mx-auto w-full min-w-0 max-w-[740px] lg:max-w-[880px] xl:max-w-[940px]">
      <div
        className={[
          'relative w-full aspect-square overflow-hidden rounded-xl sm:rounded-2xl',
          p.boardBg,
          `border-2 sm:border-[3px] ${p.boardBorder} ${p.boardShadow}`,
        ].join(' ')}
      >
        {p.customDecoration === 'pirate' && (
          <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
            {/* Aged paper grain & vignette */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(43,27,14,0.2)_100%)] dark:bg-[radial-gradient(circle_at_center,transparent_20%,rgba(5,15,30,0.7)_100%)] mix-blend-multiply dark:mix-blend-normal" />
            {/* Outer Nautical Chart Braided Rope Border */}
            <div className="absolute inset-0.5 sm:inset-1 rounded-lg sm:rounded-xl border-2 sm:border-[3px] border-dashed border-[#B8860B]/70 dark:border-[#B8860B]/50" />
            <div className="absolute inset-1.5 sm:inset-2 rounded sm:rounded-lg border border-[#B8860B]/40 dark:border-[#B8860B]/30" />
          </div>
        )}
        <div
          className="absolute inset-[3px] sm:inset-2.5 grid gap-[0.5px] sm:gap-1 z-10"
          style={{
            gridTemplateColumns: 'minmax(0, 1.55fr) repeat(9, minmax(0, 1fr)) minmax(0, 1.55fr)',
            gridTemplateRows: 'minmax(0, 1.55fr) repeat(9, minmax(0, 1fr)) minmax(0, 1.55fr)',
          }}
        >
          <div
            className={[
              'z-0 relative flex min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-md sm:rounded-xl',
              p.centerBg,
              `border ${p.centerBorder} shadow-inner p-1 sm:p-4 text-center`,
            ].join(' ')}
            style={{ gridColumn: '2 / 11', gridRow: '2 / 11' }}
          >
            {p.customDecoration === 'pirate' && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden z-0">
                {/* Faint Compass Rose in center background */}
                <svg
                  className="w-48 h-48 sm:w-72 sm:h-72 text-[#2B1B0E]/10 dark:text-[#B8860B]/15 animate-[spin_240s_linear_infinite]"
                  viewBox="0 0 100 100"
                  fill="currentColor"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    stroke="currentColor"
                    strokeWidth="0.5"
                    fill="none"
                    strokeDasharray="2 2"
                  />
                  <circle cx="50" cy="50" r="35" stroke="currentColor" strokeWidth="0.5" fill="none" />
                  <circle
                    cx="50"
                    cy="50"
                    r="25"
                    stroke="currentColor"
                    strokeWidth="0.3"
                    fill="none"
                    strokeDasharray="1 1"
                  />
                  <polygon points="50,5 45,45 5,50 45,55 50,95 55,55 95,50 55,45" opacity="0.8" />
                  <polygon points="50,18 43,43 18,50 43,57 50,82 57,57 82,50 57,43" opacity="0.4" />
                  <circle cx="50" cy="50" r="4" fill="currentColor" />
                </svg>
                {/* Corner wave lines / rhumb lines */}
                <svg
                  className="absolute inset-0 w-full h-full text-[#2B1B0E]/10 dark:text-[#B8860B]/10"
                  viewBox="0 0 200 200"
                  stroke="currentColor"
                  strokeWidth="0.3"
                  fill="none"
                >
                  <line x1="0" y1="0" x2="200" y2="200" />
                  <line x1="200" y1="0" x2="0" y2="200" />
                  <line x1="100" y1="0" x2="100" y2="200" />
                  <line x1="0" y1="100" x2="200" y2="100" />
                </svg>
              </div>
            )}
            <div className="flex sm:hidden relative z-10 h-full w-full min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden">
              {mobileCenter ?? center ?? defaultMobileCenter}
            </div>
            <div className="hidden sm:flex relative z-10 h-full w-full min-h-0 min-w-0 flex-col items-center justify-center">
              {defaultDesktopCenter}
            </div>
          </div>

          {BOARD_SPACE_INDICES.map((spaceIndex) => {
            const { col, row } = boardGridCell(spaceIndex)
            return (
              <div
                key={spaceIndex}
                className="relative z-[1] min-h-0 min-w-0"
                style={{ gridColumn: col, gridRow: row }}
              >
                <BoardCellWrapper spaceIndex={spaceIndex} {...cellProps} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function MonopolyCurrentSpace({
  index,
  ownerName,
  propertyOwners,
  propertyBuildings,
  mortgagedProperties,
  lastDiceTotal = 2,
  compact = false,
  themeId,
}: {
  index: number
  ownerName?: string | null
  propertyOwners?: unknown
  propertyBuildings?: unknown
  mortgagedProperties?: unknown
  lastDiceTotal?: number
  compact?: boolean
  themeId?: string | null
}) {
  const space = spaceAt(index)
  const icon = spaceIcon(space.type, themeId)
  const owners = parsePropertyOwners(propertyOwners)
  const buildings = parseBuildings(propertyBuildings)
  const mortgaged = parseMortgaged(mortgagedProperties)
  const ownerId = owners[String(index)]
  const rentLabel = boardTileRentLabel(space, ownerId, owners, buildings, mortgaged, lastDiceTotal, themeId)

  const detailLine = (() => {
    if (space.price != null) {
      if (ownerName) {
        if (rentLabel === 'Mortgaged') return `${ownerName} · Mortgaged`
        if (rentLabel) return `${ownerName} · Rent ${rentLabel}`
        return `Owned by ${ownerName}`
      }
      if (rentLabel) return `For sale · ${formatThemedMoney(space.price!, themeId)} · Rent ${rentLabel}`
      return `For sale · ${formatThemedMoney(space.price!, themeId)}`
    }
    if (ownerName && rentLabel && rentLabel !== 'Mortgaged') return `${ownerName} · Rent ${rentLabel}`
    if (ownerName) return `Owned by ${ownerName}`
    if (rentLabel) return `Rent ${rentLabel}`
    return null
  })()

  if (compact) {
    return (
      <div className="overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--card-strong)] shadow-[var(--card-shadow)] min-w-0 h-full flex flex-col">
        {space.color ? (
          <div className={['h-1.5 w-full', colorBar(space.color)].join(' ')} />
        ) : (
          <div className="h-1 w-full bg-gradient-to-r from-[var(--primary)] to-[var(--primary-strong)]" />
        )}
        <div className="flex flex-1 items-center gap-2.5 px-3 py-2 min-h-[3.25rem]">
          {icon && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-inset-bg)] text-lg">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-muted leading-none">You landed on</p>
            <p
              className={`text-sm font-black text-[var(--foreground)] truncate leading-tight mt-0.5 ${getBoardPalette(themeId).tileFont ?? ''}`}
            >
              {themedSpaceName(space.name, index, themeId)}
            </p>
            {detailLine && <p className="text-[11px] text-muted truncate leading-snug mt-0.5">{detailLine}</p>}
          </div>
        </div>
      </div>
    )
  }

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
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">You landed on</p>
            <p
              className={`mt-0.5 text-xl sm:text-2xl font-black text-[var(--foreground)] leading-tight ${getBoardPalette(themeId).tileFont ?? ''}`}
            >
              {themedSpaceName(space.name, index, themeId)}
            </p>
            {space.price != null && (
              <p className="mt-2 text-sm text-muted">
                {ownerName ? (
                  <>
                    Owned by <span className="font-bold text-[var(--foreground)]">{ownerName}</span>
                    {rentLabel && rentLabel !== 'Mortgaged' ? (
                      <>
                        {' '}
                        · Rent <span className="font-bold text-[var(--foreground)]">{rentLabel}</span>
                      </>
                    ) : null}
                    {rentLabel === 'Mortgaged' ? (
                      <>
                        {' '}
                        · <span className="font-bold text-red-500">Mortgaged — no rent</span>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    For sale ·{' '}
                    <span className="font-bold text-[var(--marry)]">{formatThemedMoney(space.price!, themeId)}</span>
                    {rentLabel ? (
                      <>
                        {' '}
                        · Site rent <span className="font-bold text-[var(--foreground)]">{rentLabel}</span>
                      </>
                    ) : null}
                  </>
                )}
              </p>
            )}
            {space.price == null && rentLabel && (
              <p className="mt-2 text-sm text-muted">
                {ownerName ? (
                  <>
                    Owned by <span className="font-bold text-[var(--foreground)]">{ownerName}</span>
                    {rentLabel !== 'Mortgaged' ? (
                      <>
                        {' '}
                        · Rent <span className="font-bold text-[var(--foreground)]">{rentLabel}</span>
                      </>
                    ) : (
                      <>
                        {' '}
                        · <span className="font-bold text-red-500">Mortgaged</span>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    Rent <span className="font-bold text-[var(--foreground)]">{rentLabel}</span>
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
  players: _players,
  themeId,
}: {
  playerId: string
  propertyOwners: Record<string, string> | unknown
  players: Player[]
  themeId?: string | null
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
              {space.color && <span className={['h-8 w-1.5 shrink-0 rounded-full', colorBar(space.color)].join(' ')} />}
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-bold text-[var(--foreground)] truncate ${getBoardPalette(themeId).tileFont ?? ''}`}
                >
                  {themedSpaceName(space.name, space.index, themeId)}
                </p>
                <p className="text-[10px] text-faint">
                  {formatThemedMoney(space.price!, themeId)}
                  {space.rent != null ? ` · Rent ${formatThemedMoney(space.rent, themeId)}` : ''}
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
  themeId,
}: {
  states: MonopolyPlayerState[]
  players: Player[]
  currentPlayerId?: string | null
  propertyOwners: Record<string, string> | unknown
  myPlayerId?: string | null
  themeId?: string | null
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
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl ring-2 shadow-lg',
                  token.bg,
                  token.ring,
                ].join(' ')}
              >
                {playerTokenEmoji(players, state.player_id, state.player_order)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="font-bold truncate text-[var(--foreground)]">
                    {name}
                    {isMe && <span className="ml-1.5 text-xs font-normal text-[var(--primary)]">(you)</span>}
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
                <p className="text-[10px] uppercase tracking-wide text-faint">Cash</p>
                <p className="text-lg font-black tabular-nums text-[var(--primary)]">
                  {formatThemedMoney(state.cash, themeId)}
                </p>
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
