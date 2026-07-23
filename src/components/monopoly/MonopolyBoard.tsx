'use client'
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'

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
import {
  MONOPOLY_HOTEL_LEVEL,
  MONOPOLY_MAX_HOUSES_PER_PROPERTY,
  mortgageValue,
  countOwnedInGroup,
} from '@/lib/monopoly-board'
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
  mobileBoardSpaceLines,
  shortSpaceName,
  shortPlayerName,
  spaceIcon,
  tokenColorForOrder,
} from '@/components/monopoly/monopoly-ui'

function colorBar(color?: MonopolyColorGroup): string {
  if (!color) return 'bg-neutral-400/80'
  return MONOPOLY_COLOR_CLASSES[color] ?? 'bg-neutral-400'
}

// ---------------------------------------------------------------------------
// Title Deed — full rent schedule grid for the property inspection modal
// ---------------------------------------------------------------------------

interface TitleDeedRow {
  label: string
  value: string
  active?: boolean
  section?: boolean
}

function TitleDeedSection({
  space,
  themeId,
  owners,
  buildings,
  ownerId,
}: {
  space: MonopolySpace
  themeId?: string | null
  owners: Record<string, string>
  buildings: Record<string, number>
  ownerId?: string
}) {
  const fmt = (amount: number) => formatThemedMoney(amount, themeId)
  const rows: TitleDeedRow[] = []

  if (space.type === 'property' && space.rentTable && space.houseCost != null) {
    const level = buildingLevel(buildings, space.index)

    rows.push({ label: 'Price', value: fmt(space.price!), section: true })
    rows.push({ label: 'Site rent', value: fmt(space.rentTable[0]!), active: !!ownerId && level === 0 })
    for (let h = 1; h < MONOPOLY_HOTEL_LEVEL; h++) {
      rows.push({
        label: `With ${h} house${h > 1 ? 's' : ''}`,
        value: fmt(space.rentTable[h]!),
        active: !!ownerId && level === h,
      })
    }
    rows.push({
      label: 'With hotel',
      value: fmt(space.rentTable[MONOPOLY_HOTEL_LEVEL]!),
      active: !!ownerId && level === MONOPOLY_HOTEL_LEVEL,
    })
    rows.push({ label: 'Mortgage value', value: fmt(mortgageValue(space)), section: true })
    rows.push({ label: 'House cost', value: fmt(space.houseCost) })
    rows.push({ label: 'Hotel cost', value: fmt(space.houseCost) })
  } else if (space.type === 'station') {
    const ownedCount = ownerId ? countOwnedInGroup(owners, ownerId, 'station') : 0
    const baseRent = space.rent ?? 25

    rows.push({ label: 'Price', value: fmt(space.price!), section: true })
    for (let n = 1; n <= 4; n++) {
      const rent = baseRent * 2 ** (n - 1)
      rows.push({
        label: `${n} station${n > 1 ? 's' : ''} owned`,
        value: fmt(rent),
        active: !!ownerId && ownedCount === n,
      })
    }
    rows.push({ label: 'Mortgage value', value: fmt(mortgageValue(space)), section: true })
  } else if (space.type === 'utility') {
    const ownedCount = ownerId ? countOwnedInGroup(owners, ownerId, 'utility') : 0

    rows.push({ label: 'Price', value: fmt(space.price!), section: true })
    rows.push({
      label: '1 utility owned',
      value: '4× dice roll',
      active: !!ownerId && ownedCount === 1,
    })
    rows.push({
      label: '2 utilities owned',
      value: '10× dice roll',
      active: !!ownerId && ownedCount === 2,
    })
    rows.push({ label: 'Mortgage value', value: fmt(mortgageValue(space)), section: true })
  }

  if (rows.length === 0) return null

  return (
    <div className="mt-3 rounded-xl border border-[var(--border-strong)] overflow-hidden">
      {rows.map((row, i) => (
        <div
          key={i}
          className={[
            'flex items-center justify-between px-3 py-1.5 text-xs sm:text-sm',
            i > 0 ? 'border-t border-[var(--border-strong)]/50' : '',
            row.active ? 'bg-[var(--primary)]/10 font-bold text-[var(--foreground)]' : 'text-muted',
            row.section ? 'font-semibold text-[var(--foreground)]' : '',
          ].join(' ')}
        >
          <span>{row.label}</span>
          <span className={row.active ? 'text-[var(--primary)]' : ''}>{row.value}</span>
        </div>
      ))}
    </div>
  )
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
  onClick,
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
  onClick?: () => void
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
  const mobileLines = mobileBoardSpaceLines(space.name, space.type, spaceIndex, themeId)
  const rentLabel = boardTileRentLabel(space, ownerId, owners, buildings, mortgaged, diceTotal, themeId)
  const palette = getBoardPalette(themeId)
  const lineClass = [
    `font-extrabold ${palette.tileText} ${palette.tileFont ?? ''} leading-[1.05]`,
    isCorner ? 'text-[8px] sm:text-[10px]' : 'text-[7.2px] sm:text-[9px] md:text-[9.5px]',
  ].join(' ')

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={themedSpaceName(space.name, spaceIndex, themeId)}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
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
        <div className="hidden sm:flex flex-col items-center justify-center gap-px min-w-0 max-w-full px-px text-center overflow-hidden">
          {lines.map((line, i) => (
            <span key={i} className={[lineClass, 'max-w-full break-words tracking-tight'].join(' ')}>
              {line}
            </span>
          ))}
        </div>
        <div
          className={[
            'flex sm:hidden flex-col items-center justify-center gap-0.5 min-w-0 max-w-full max-h-full px-1 py-1 text-center overflow-hidden',
            edge === 'top' || edge === 'bottom' ? '[writing-mode:vertical-rl] rotate-180' : '',
          ].join(' ')}
        >
          {mobileLines.map((line, i) => (
            <span
              key={i}
              className={[
                lineClass,
                edge === 'top' || edge === 'bottom'
                  ? 'max-h-full tracking-tighter'
                  : 'max-w-full truncate tracking-tighter',
              ].join(' ')}
            >
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
  onClick,
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
  onClick?: () => void
}) {
  return (
    <BoardSpaceCell
      onClick={onClick}
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
  const [selectedSpace, setSelectedSpace] = useState<number | null>(null)
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
      <Modal open={selectedSpace !== null} onClose={() => setSelectedSpace(null)} title="Space Info">
        {selectedSpace !== null && (
          <div className="w-full">
            <MonopolyCurrentSpace
              index={selectedSpace}
              ownerName={owners[String(selectedSpace)] ? playerName(players, owners[String(selectedSpace)]) : null}
              propertyOwners={owners}
              propertyBuildings={buildings}
              mortgagedProperties={mortgaged}
              lastDiceTotal={lastDiceTotal}
              themeId={themeId}
            />
          </div>
        )}
      </Modal>
      <div
        className={[
          'relative w-full aspect-[7/8] sm:aspect-square overflow-hidden rounded-xl sm:rounded-2xl',
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
        {p.customDecoration === 'arctic' && (
          <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
            {/* Frost vignette & slight grain */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(30,78,107,0.2)_100%)] dark:bg-[radial-gradient(circle_at_center,transparent_15%,rgba(10,26,42,0.85)_100%)] mix-blend-multiply dark:mix-blend-normal" />

            {/* Glacial Rift Shards, Frost Filigree Corners & Arctic Streamlines */}
            <svg
              className="absolute inset-0 w-full h-full text-[#1E4E6B]/25 dark:text-[#3FA9A0]/25"
              viewBox="0 0 400 400"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Glacial Rift Shards / Floating Ice Floes */}
              <polygon
                points="40,90 70,85 85,110 50,120"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="4 2"
                opacity="0.4"
              />
              <polygon
                points="310,60 350,50 365,80 320,95"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="4 2"
                opacity="0.4"
              />
              <polygon
                points="55,280 90,270 105,305 65,315"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="4 2"
                opacity="0.4"
              />
              <polygon
                points="320,290 360,280 375,310 330,325"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="4 2"
                opacity="0.4"
              />

              {/* Soft Glacial Fissures / Contour Cracks */}
              <path
                d="M -50 80 Q 100 50 200 130 T 450 100 M -50 260 Q 80 320 220 270 T 450 340"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="14 8"
                opacity="0.6"
              />
              <path
                d="M 60 -50 Q 130 140 90 240 T 160 450 M 350 -50 Q 320 120 380 280 T 320 450"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeDasharray="8 8"
                opacity="0.5"
              />

              {/* Arctic Wind / Glacial Streamlines */}
              <path d="M 20 180 Q 120 160 220 190 T 380 170" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
              <path d="M 20 220 Q 180 240 280 210 T 380 230" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />

              {/* Intricate Nordic Frost Filigree Corners & Crystal Runes */}
              {/* Top-Left */}
              <path
                d="M 12 48 L 12 12 L 48 12 M 12 12 L 35 35 M 12 28 L 28 12 M 12 38 L 38 12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <circle cx="35" cy="35" r="2.5" fill="currentColor" opacity="0.6" />
              {/* Top-Right */}
              <path
                d="M 388 48 L 388 12 L 352 12 M 388 12 L 365 35 M 388 28 L 372 12 M 388 38 L 362 12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <circle cx="365" cy="35" r="2.5" fill="currentColor" opacity="0.6" />
              {/* Bottom-Left */}
              <path
                d="M 12 352 L 12 388 L 48 388 M 12 388 L 35 365 M 12 372 L 28 388 M 12 362 L 38 388"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <circle cx="35" cy="365" r="2.5" fill="currentColor" opacity="0.6" />
              {/* Bottom-Right */}
              <path
                d="M 388 352 L 388 388 L 352 388 M 388 388 L 365 365 M 388 372 L 372 388 M 388 362 L 362 388"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <circle cx="365" cy="365" r="2.5" fill="currentColor" opacity="0.6" />
            </svg>

            {/* Intricate Glacial Border Frames */}
            <div className="absolute inset-0.5 sm:inset-1 rounded-lg sm:rounded-xl border-2 sm:border-[3px] border-[#1E4E6B]/50 dark:border-[#3FA9A0]/45 shadow-[inset_0_0_12px_rgba(63,169,160,0.2)]" />
            {/* Geometric Lattice / Chevron Border */}
            <div className="absolute inset-1.5 sm:inset-2 rounded sm:rounded-lg border-2 border-dashed border-[#1E4E6B]/40 dark:border-[#D8E6E8]/30" />
            <div className="absolute inset-2.5 sm:inset-3 rounded border border-dotted border-[#5C6B73]/35 dark:border-[#3FA9A0]/25" />
          </div>
        )}
        {p.customDecoration === 'naija' && (
          <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
            {/* Subtle Ankara Wax-Print geometric pattern & fabric-grain texture */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(0,135,81,0.12)_100%)] dark:bg-[radial-gradient(circle_at_center,transparent_15%,rgba(11,31,22,0.85)_100%)] mix-blend-multiply dark:mix-blend-normal" />

            {/* Fabric Grain & Ankara Border Geometric Frieze */}
            <svg
              className="absolute inset-0 w-full h-full text-[#008751]/20 dark:text-[#D9A441]/20"
              viewBox="0 0 400 400"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <pattern id="ankara-grain" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path d="M 0 5 L 10 5 M 5 0 L 5 10" stroke="currentColor" strokeWidth="0.4" opacity="0.4" />
                  <circle cx="5" cy="5" r="0.8" fill="currentColor" opacity="0.3" />
                </pattern>
              </defs>
              <rect width="400" height="400" fill="url(#ankara-grain)" />
              {/* Geometric Wax-Print Edge Pattern */}
              <rect
                x="6"
                y="6"
                width="388"
                height="388"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="6 4"
                opacity="0.7"
              />
              <rect x="12" y="12" width="376" height="376" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
              {/* Corner Ankara Motifs */}
              <polygon points="12,12 30,12 12,30" fill="currentColor" opacity="0.3" />
              <polygon points="388,12 370,12 388,30" fill="currentColor" opacity="0.3" />
              <polygon points="12,388 30,388 12,370" fill="currentColor" opacity="0.3" />
              <polygon points="388,388 370,388 388,370" fill="currentColor" opacity="0.3" />
            </svg>

            {/* Thin wax-print border frames */}
            <div className="absolute inset-1 sm:inset-1.5 rounded-lg sm:rounded-xl border border-[#008751]/40 dark:border-[#D9A441]/40" />
            <div className="absolute inset-2 sm:inset-2.5 rounded sm:rounded-lg border border-dashed border-[#B5622A]/40 dark:border-[#D9A441]/30" />
          </div>
        )}

        <style>{`
          .monopoly-grid-tracks {
            grid-template-columns: minmax(0, 1.85fr) repeat(9, minmax(0, 1fr)) minmax(0, 1.85fr);
            grid-template-rows: minmax(0, 1.85fr) repeat(9, minmax(0, 1.25fr)) minmax(0, 1.85fr);
          }
          @media (min-width: 640px) {
            .monopoly-grid-tracks {
              grid-template-columns: minmax(0, 1.55fr) repeat(9, minmax(0, 1fr)) minmax(0, 1.55fr);
              grid-template-rows: minmax(0, 1.55fr) repeat(9, minmax(0, 1fr)) minmax(0, 1.55fr);
            }
          }
        `}</style>
        <div className="absolute inset-[3px] sm:inset-2.5 grid gap-[0.5px] sm:gap-1 z-10 monopoly-grid-tracks">
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
            {p.customDecoration === 'arctic' && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden z-0">
                {/* Multi-Layered Aurora Borealis, 3-Depth Alpine Peaks & Polaris Constellation */}
                <svg
                  className="absolute inset-0 w-full h-full text-[#1E4E6B]/30 dark:text-[#3FA9A0]/35"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Background Towering Summits */}
                  <path
                    d="M 0 80 L 15 55 L 28 68 L 42 42 L 55 60 L 70 38 L 85 58 L 100 48 L 100 100 L 0 100 Z"
                    fill="currentColor"
                    opacity="0.12"
                  />
                  {/* Mid-Ground Glacial Peaks with Ice Caps */}
                  <path
                    d="M 0 85 L 12 65 L 25 74 L 38 50 L 52 68 L 65 45 L 78 64 L 90 52 L 100 70 L 100 100 L 0 100 Z"
                    fill="currentColor"
                    opacity="0.22"
                  />
                  {/* Forefront Jagged Ridges */}
                  <path
                    d="M 0 92 L 18 75 L 32 84 L 48 62 L 60 78 L 75 58 L 88 72 L 100 80 L 100 100 L 0 100 Z"
                    fill="currentColor"
                    opacity="0.35"
                  />
                  {/* Vertical Glacial Crevasse Lines */}
                  <path
                    d="M 38 50 L 38 100 M 65 45 L 65 100 M 78 64 L 78 100 M 42 42 L 42 100 M 70 38 L 70 100"
                    stroke="currentColor"
                    strokeWidth="0.4"
                    opacity="0.3"
                  />

                  {/* Multi-Layered Flowing Aurora Borealis Curtains */}
                  <path
                    d="M -10 32 Q 20 10 50 28 T 110 15"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                    className="animate-[pulse_4s_ease-in-out_infinite]"
                    opacity="0.25"
                  />
                  <path
                    d="M -10 40 Q 30 18 60 34 T 110 22"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray="8 4"
                    className="animate-[pulse_5s_ease-in-out_infinite_1s]"
                    opacity="0.35"
                  />
                  <path
                    d="M -10 22 Q 35 32 70 12 T 110 30"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="animate-[pulse_6s_ease-in-out_infinite_2s]"
                    opacity="0.2"
                  />
                  <path
                    d="M -10 48 Q 25 28 55 44 T 110 32"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="animate-[pulse_4.5s_ease-in-out_infinite_0.5s]"
                    opacity="0.28"
                  />

                  {/* Celestial Polar Constellations & Polaris (North Star) */}
                  {/* Polaris (North Star) with glowing diamond rays */}
                  <g className="animate-[pulse_3s_ease-in-out_infinite]">
                    <circle cx="75" cy="18" r="1.8" fill="currentColor" />
                    <path d="M 75 13 L 75 23 M 70 18 L 80 18" stroke="currentColor" strokeWidth="0.6" />
                  </g>
                  {/* Ursa Major / Big Dipper constellation lines pointing to Polaris */}
                  <path
                    d="M 18 28 L 25 26 L 32 30 L 38 36 L 48 34 L 48 42 L 38 36"
                    stroke="currentColor"
                    strokeWidth="0.4"
                    strokeDasharray="1 1"
                    opacity="0.5"
                  />
                  <circle cx="18" cy="28" r="0.8" fill="currentColor" opacity="0.7" />
                  <circle cx="25" cy="26" r="0.8" fill="currentColor" opacity="0.7" />
                  <circle cx="32" cy="30" r="0.8" fill="currentColor" opacity="0.7" />
                  <circle cx="38" cy="36" r="1" fill="currentColor" opacity="0.8" />
                  <circle cx="48" cy="34" r="1" fill="currentColor" opacity="0.8" />
                  <circle cx="48" cy="42" r="1" fill="currentColor" opacity="0.8" />
                  {/* Pointer stars line to Polaris */}
                  <path
                    d="M 48 34 L 75 18"
                    stroke="currentColor"
                    strokeWidth="0.3"
                    strokeDasharray="2 2"
                    opacity="0.4"
                  />
                </svg>
              </div>
            )}
            {p.customDecoration === 'naija' && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden z-0">
                {/* Subtle Ankara rays and River Y / Eagle Motif */}
                <svg
                  className="w-48 h-48 sm:w-72 sm:h-72 text-[#008751]/15 dark:text-[#D9A441]/20"
                  viewBox="0 0 100 100"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Subtle Geometric Radiance / Sun Rays */}
                  <circle
                    cx="50"
                    cy="50"
                    r="44"
                    stroke="currentColor"
                    strokeWidth="0.5"
                    strokeDasharray="3 3"
                    opacity="0.6"
                  />
                  <circle cx="50" cy="50" r="32" stroke="currentColor" strokeWidth="0.3" opacity="0.4" />

                  {/* The Niger & Benue River Confluence 'Y' Mark */}
                  <path
                    d="M 20 25 Q 35 38 50 52 Q 65 38 80 25 L 75 20 Q 62 33 50 45 Q 38 33 25 20 Z"
                    fill="currentColor"
                    opacity="0.8"
                  />
                  <path d="M 46 50 L 54 50 L 54 85 L 46 85 Z" fill="currentColor" opacity="0.8" />
                  <path d="M 48 50 L 52 50 L 52 85 L 48 85" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />

                  {/* Understated Geometric Eagle Silhouette Presiding Above */}
                  <path
                    d="M 50 15 L 62 23 L 68 18 L 56 26 L 50 28 L 44 26 L 32 18 L 38 23 Z"
                    fill="currentColor"
                    opacity="0.9"
                  />
                  {/* Tiny wreath diamond under eagle */}
                  <polygon points="50,29 53,31 50,33 47,31" fill="currentColor" opacity="0.7" />
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
                <BoardCellWrapper onClick={() => setSelectedSpace(spaceIndex)} spaceIndex={spaceIndex} {...cellProps} />
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
  title,
}: {
  index: number
  ownerName?: string | null
  propertyOwners?: unknown
  propertyBuildings?: unknown
  mortgagedProperties?: unknown
  lastDiceTotal?: number
  compact?: boolean
  themeId?: string | null
  title?: string
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

  const level = buildingLevel(buildings, index)
  const levelLabel = level === MONOPOLY_HOTEL_LEVEL ? '🏨 Hotel' : level > 0 ? `${level} 🏠` : null
  const fullDetailLine = levelLabel ? `${detailLine || ''} · ${levelLabel}` : detailLine

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
            <p className="text-[9px] font-semibold uppercase tracking-widest text-muted leading-none">
              {title ?? 'You landed on'}
            </p>
            <p
              className={`text-sm font-black text-[var(--foreground)] truncate leading-tight mt-0.5 ${getBoardPalette(themeId).tileFont ?? ''}`}
            >
              <span className="hidden sm:inline">{themedSpaceName(space.name, index, themeId)}</span>
              <span className="sm:hidden">{shortSpaceName(space.name, 16, index, themeId)}</span>
            </p>
            {fullDetailLine && <p className="text-[11px] text-muted truncate leading-snug mt-0.5">{fullDetailLine}</p>}
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
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">{title ?? 'You landed on'}</p>
            <p
              className={`mt-0.5 text-xl sm:text-2xl font-black text-[var(--foreground)] leading-tight ${getBoardPalette(themeId).tileFont ?? ''}`}
            >
              <span className="hidden sm:inline">{themedSpaceName(space.name, index, themeId)}</span>
              <span className="sm:hidden">{shortSpaceName(space.name, 18, index, themeId)}</span>
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
                {levelLabel && (
                  <>
                    {' '}
                    · <span className="font-bold text-[var(--foreground)]">{levelLabel}</span>
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
                {levelLabel && (
                  <>
                    {' '}
                    · <span className="font-bold text-[var(--foreground)]">{levelLabel}</span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        <TitleDeedSection space={space} themeId={themeId} owners={owners} buildings={buildings} ownerId={ownerId} />
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
                  <span className="hidden sm:inline">{themedSpaceName(space.name, space.index, themeId)}</span>
                  <span className="sm:hidden">{shortSpaceName(space.name, 14, space.index, themeId)}</span>
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
                    <span className="hidden sm:inline">{name}</span>
                    <span className="sm:hidden">{shortPlayerName(name, 12)}</span>
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
