'use client'

import { useEffect, useRef, useState } from 'react'
import { Exchange01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  MonopolyModal,
  MonopolyPrimaryButton,
  MonopolySecondaryButton,
  MonopolyJailCardInventory,
} from '@/components/monopoly/MonopolyChrome'
import { canAddHotel, canAddHouse, canRemoveHotel, canRemoveHouse } from '@/lib/monopoly-build'
import { buildingLevel, computeRent, parseBuildings, parseMortgaged } from '@/lib/monopoly-rent'
import {
  MonopolyColorBar,
  MonopolyColorPortfolio,
  MonopolyColorSetDots,
  colorBarClass,
} from '@/components/monopoly/MonopolyColorPortfolio'
import {
  buildColorGroupStatuses,
  ownedColorGroups,
  propertiesInGroupForPlayer,
  COLOR_GROUP_LABELS,
} from '@/lib/monopoly-color-portfolio'
import {
  mortgageValue,
  parsePropertyOwners,
  playerProperties,
  unmortgageCost,
  type MonopolyColorGroup,
} from '@/lib/monopoly'
import { monopolyTokenEmoji } from '@/lib/monopoly-tokens'
import {
  canonicalToDisplayMoney,
  displayToCanonicalMoney,
  formatThemedMoney,
  formatThemedText,
  themedSpaceName,
} from '@/components/monopoly/monopoly-themes'
import {
  buildTradeSideItems,
  normalizePendingTrade,
  normalizeTradePropertyList,
  tradeSideHasValue,
} from '@/lib/monopoly-trade-messages'
import type { MonopolyBoard, MonopolyPlayerState, Player } from '@/types'

type PostAction = (url: string, body?: Record<string, unknown>) => Promise<void>

function TradeSideItems({
  cash,
  propertyIndexes,
  jailCards = 0,
  compact = false,
  themeId,
}: {
  cash: number
  propertyIndexes: unknown
  jailCards?: number
  compact?: boolean
  themeId?: string | null
}) {
  const items = buildTradeSideItems(cash, propertyIndexes, jailCards)
  if (items.length === 0) {
    return <p className={`text-muted italic ${compact ? 'text-xs' : 'text-sm'}`}>Nothing</p>
  }

  return (
    <ul
      className={`space-y-0.5 ${compact ? 'text-xs' : 'text-sm'} font-semibold text-[var(--foreground)] leading-snug`}
    >
      {items.map((item) => {
        if (item.kind === 'cash') {
          return (
            <li key="cash">
              <span className="text-muted font-normal">Cash </span>
              {formatThemedMoney(item.amount, themeId)}
            </li>
          )
        }
        if (item.kind === 'property' && 'name' in item && 'index' in item) {
          return <li key={`prop-${item.index}`}>{themedSpaceName(item.name, item.index, themeId)}</li>
        }
        return (
          <li key="jail">
            {formatThemedText(`${item.count} skip-the-queue card${item.count === 1 ? '' : 's'}`, themeId)}
          </li>
        )
      })}
    </ul>
  )
}

function tradeSideCountLabel(
  cash: number,
  propertyIndexes: unknown,
  jailCards = 0,
  themeId?: string | null
): string | null {
  const propertyCount = normalizeTradePropertyList(propertyIndexes).length
  const parts: string[] = []
  if (propertyCount > 0) parts.push(`${propertyCount} propert${propertyCount === 1 ? 'y' : 'ies'}`)
  if (cash > 0) parts.push('cash')
  if (jailCards > 0)
    parts.push(formatThemedText(`${jailCards} skip-the-queue card${jailCards === 1 ? '' : 's'}`, themeId))
  if (parts.length === 0) return null
  return parts.join(' · ')
}

function TradeExchangeReview({
  giveLabel,
  getLabel,
  giveCash,
  giveProps,
  getCash,
  getProps,
  giveJailCards = 0,
  getJailCards = 0,
  compact = false,
  themeId,
}: {
  giveLabel: string
  getLabel: string
  giveCash: number
  giveProps: unknown
  getCash: number
  getProps: unknown
  giveJailCards?: number
  getJailCards?: number
  compact?: boolean
  themeId?: string | null
}) {
  const oneSidedGift =
    tradeSideHasValue(giveCash, giveProps, giveJailCards) && !tradeSideHasValue(getCash, getProps, getJailCards)
  const oneSidedReceive =
    tradeSideHasValue(getCash, getProps, getJailCards) && !tradeSideHasValue(giveCash, giveProps, giveJailCards)
  const giveCountLabel = tradeSideCountLabel(giveCash, giveProps, giveJailCards, themeId)
  const getCountLabel = tradeSideCountLabel(getCash, getProps, getJailCards, themeId)

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-xl border border-red-500/30 bg-red-500/8 p-2.5 sm:p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/90">{giveLabel}</p>
            {giveCountLabel && <p className="text-[10px] font-semibold text-red-300/90 shrink-0">{giveCountLabel}</p>}
          </div>
          <div className="mt-1">
            <TradeSideItems
              cash={giveCash}
              propertyIndexes={giveProps}
              jailCards={giveJailCards}
              compact={compact}
              themeId={themeId}
            />
          </div>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-2.5 sm:p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {getLabel}
            </p>
            {getCountLabel && (
              <p className="text-[10px] font-semibold text-emerald-600/90 dark:text-emerald-300/90 shrink-0">
                {getCountLabel}
              </p>
            )}
          </div>
          <div className="mt-1">
            <TradeSideItems
              cash={getCash}
              propertyIndexes={getProps}
              jailCards={getJailCards}
              compact={compact}
              themeId={themeId}
            />
          </div>
        </div>
      </div>
      {oneSidedGift && (
        <p className="text-xs text-red-400 leading-relaxed rounded-lg border border-red-500/25 bg-red-500/8 px-3 py-2">
          You are not asking for anything in return — this is a one-way gift, not a swap.
        </p>
      )}
      {oneSidedReceive && (
        <p className="text-xs text-amber-600 dark:text-amber-300 leading-relaxed rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2">
          You are not offering anything — you would only receive from them.
        </p>
      )}
    </div>
  )
}

export function MonopolyTurnModals({
  board,
  myPlayerId,
  players,
  acting,
  postAction,
  themeId,
}: {
  board: MonopolyBoard | null
  myPlayerId: string | null
  myState?: MonopolyPlayerState | undefined
  players: Player[]
  acting: boolean
  postAction: PostAction
  colorBarClass?: (color?: MonopolyColorGroup) => string
  themeId?: string | null
}) {
  const [tradeMinimized, setTradeMinimized] = useState(false)
  const previousTradeRef = useRef<string | null>(null)

  const trade = board?.pending_trade ? normalizePendingTrade(board.pending_trade) : null
  const tradeFrom = trade ? players.find((p) => p.id === trade.from_player_id) : null
  const tradeTo = trade ? players.find((p) => p.id === trade.to_player_id) : null
  const showTradeModal = !!(trade && trade.to_player_id === myPlayerId && tradeFrom && tradeTo)
  const receiveCount = trade
    ? buildTradeSideItems(trade.offer_cash, trade.offer_properties, trade.offer_get_out_cards).length
    : 0
  const payCount = trade
    ? buildTradeSideItems(trade.request_cash, trade.request_properties, trade.request_get_out_cards ?? 0).length
    : 0

  const tradeSig = trade ? JSON.stringify(trade) : null

  useEffect(() => {
    if (showTradeModal && tradeSig !== previousTradeRef.current) {
      setTradeMinimized(false)
      previousTradeRef.current = tradeSig
    }
  }, [showTradeModal, tradeSig])

  return (
    <>
      {showTradeModal &&
        trade &&
        (tradeMinimized ? (
          <div
            className="fr-portal animate-in fade-in slide-in-from-bottom-4 duration-200"
            style={{
              position: 'fixed',
              bottom: 'calc(11.5rem + env(safe-area-inset-bottom))',
              right: '1rem',
              zIndex: 9999,
            }}
          >
            <button
              type="button"
              onClick={() => setTradeMinimized(false)}
              className="flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--marry)_35%,var(--border-strong))] bg-[var(--surface)] p-1.5 pr-4 shadow-[var(--card-shadow-strong)] transition-transform hover:scale-105 active:scale-95 animate-intermittent-shake"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--marry)] text-[var(--background)] shadow-[0_2px_8px_color-mix(in_srgb,var(--marry)_40%,transparent)]">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 3h5v5" />
                  <path d="M8 3H3v5" />
                  <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
                  <path d="m15 9 6-6" />
                </svg>
              </span>
              <span className="text-sm font-bold text-[var(--foreground)]">Incoming trade</span>
            </button>
          </div>
        ) : (
          <MonopolyModal
            open
            subtitle="Review every item before you accept"
            title={`Trade from ${tradeFrom?.name ?? 'player'}`}
            headerAction={
              <button
                type="button"
                onClick={() => setTradeMinimized(true)}
                className="group flex h-10 items-center justify-center rounded-full border-2 border-[var(--border-strong)] bg-[var(--card)] px-4 text-sm font-bold text-[var(--foreground)] shadow-[var(--card-shadow-strong)] transition-all hover:scale-105 hover:border-[var(--primary)] hover:text-[var(--primary)] active:scale-95"
                title="Minimize trade offer"
                aria-label="Minimize trade offer"
              >
                <span>Hide</span>
              </button>
            }
          >
            <p className="text-sm text-muted leading-relaxed">
              If you accept, everything listed below happens immediately. Decline if the count or items look wrong.
            </p>
            {receiveCount > 0 && (
              <p className="text-sm font-semibold text-[var(--foreground)]">
                You receive {receiveCount} item{receiveCount === 1 ? '' : 's'} in this trade.
              </p>
            )}
            {payCount > 0 && (
              <p className="text-sm font-semibold text-[var(--foreground)]">
                You pay {payCount} item{payCount === 1 ? '' : 's'} in this trade.
              </p>
            )}
            <div className="pt-2 max-h-[min(50vh,18rem)] overflow-y-auto">
              <TradeExchangeReview
                giveLabel="You pay"
                getLabel="You receive"
                giveCash={trade.request_cash}
                giveProps={trade.request_properties}
                giveJailCards={trade.request_get_out_cards ?? 0}
                getCash={trade.offer_cash}
                getProps={trade.offer_properties}
                getJailCards={trade.offer_get_out_cards}
                themeId={themeId}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-3">
              <button
                type="button"
                className="btn-primary w-full py-2.5 text-sm"
                onClick={() => postAction('/api/monopoly/trade', { accept: true })}
                disabled={acting}
              >
                {acting ? '…' : 'Accept'}
              </button>
              <button
                type="button"
                className="btn-secondary w-full py-2.5 text-sm"
                onClick={() => postAction('/api/monopoly/trade', { accept: false })}
                disabled={acting}
              >
                Decline
              </button>
            </div>
          </MonopolyModal>
        ))}
    </>
  )
}

function TradeTargetSelector({
  players,
  myPlayerId,
  tradeTarget,
  states,
  owners,
  boardSize,
  themeId,
  onSelectTarget,
}: {
  players: Player[]
  myPlayerId: string
  tradeTarget: string
  states: MonopolyPlayerState[]
  owners: Record<string, string>
  boardSize: 40 | 48
  themeId?: string | null
  onSelectTarget: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const selectedPlayer = players.find((p) => p.id === tradeTarget)
  const selectedState = selectedPlayer ? states.find((s) => s.player_id === selectedPlayer.id) : null
  const selectedPropsCount = selectedPlayer ? playerProperties(owners, selectedPlayer.id, boardSize).length : 0

  const availablePlayers = players.filter((p) => p.id !== myPlayerId)

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger Button — compact layout */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] hover:bg-[color-mix(in_srgb,var(--primary)_6%,var(--surface-inset-bg))] px-3 py-2 text-left transition-all shadow-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)] text-xs"
      >
        {selectedPlayer ? (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-sm">
              {monopolyTokenEmoji(selectedPlayer.monopoly_token)}
            </span>
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <span className="font-bold text-body truncate">{selectedPlayer.name}</span>
              <span className="text-[11px] text-muted truncate">
                ({selectedState ? formatThemedMoney(selectedState.cash, themeId) : ''} • {selectedPropsCount}{' '}
                {selectedPropsCount === 1 ? 'prop' : 'props'})
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--primary)]">
              <HugeiconsIcon icon={Exchange01Icon} size={14} />
            </span>
            <span>Trade with…</span>
          </div>
        )}
        <span
          className={`text-muted transition-transform duration-200 ${open ? 'rotate-180 text-[var(--primary)]' : ''}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {/* Floating Custom Menu Popover */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-1 shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="max-h-52 overflow-y-auto space-y-0.5 scrollbar-thin">
            {/* "Trade with..." reset option */}
            <button
              type="button"
              onClick={() => {
                onSelectTarget('')
                setOpen(false)
              }}
              className={[
                'w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition-all',
                !tradeTarget
                  ? 'bg-[color-mix(in_srgb,var(--primary)_12%,var(--surface))] text-[var(--primary)]'
                  : 'text-muted hover:bg-[color-mix(in_srgb,var(--primary)_6%,var(--surface))]',
              ].join(' ')}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--primary)]">
                <HugeiconsIcon icon={Exchange01Icon} size={13} />
              </span>
              <span>Trade with…</span>
            </button>

            {/* Player options */}
            {availablePlayers.map((p) => {
              const tokenEmoji = monopolyTokenEmoji(p.monopoly_token)
              const pState = states.find((s) => s.player_id === p.id)
              const pPropsCount = playerProperties(owners, p.id, boardSize).length
              const cashText = pState ? formatThemedMoney(pState.cash, themeId) : ''
              const isBankrupt = pState?.bankrupt ?? false
              const isSelected = p.id === tradeTarget

              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={isBankrupt}
                  onClick={() => {
                    onSelectTarget(p.id)
                    setOpen(false)
                  }}
                  className={[
                    'w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-all text-xs',
                    isBankrupt
                      ? 'opacity-40 cursor-not-allowed bg-[var(--surface-sunken)]'
                      : isSelected
                        ? 'bg-[color-mix(in_srgb,var(--primary)_14%,var(--surface))] border border-[color-mix(in_srgb,var(--primary)_25%,transparent)] font-bold'
                        : 'hover:bg-[color-mix(in_srgb,var(--primary)_6%,var(--surface))] font-medium',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-sm">
                      {tokenEmoji}
                    </span>
                    <div className="min-w-0 flex-1 flex items-center gap-1.5">
                      <span className="font-bold text-body truncate">{p.name}</span>
                      <span className="text-[11px] text-muted truncate">
                        {isBankrupt
                          ? '(Bankrupt)'
                          : `${cashText} • ${pPropsCount} ${pPropsCount === 1 ? 'prop' : 'props'}`}
                      </span>
                    </div>
                  </div>
                  {isSelected && <span className="text-[var(--primary)] text-xs font-bold shrink-0">✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function MonopolyManagePanel({
  board,
  myPlayerId,
  myState,
  states,
  players,
  acting,
  postAction,
  themeId,
}: {
  board: MonopolyBoard | null
  myPlayerId: string | null
  myState: MonopolyPlayerState | undefined
  states: MonopolyPlayerState[]
  players: Player[]
  acting: boolean
  postAction: PostAction
  themeId?: string | null
}) {
  const [tradeTarget, setTradeTarget] = useState('')
  const [offerCash, setOfferCash] = useState('')
  const [requestCash, setRequestCash] = useState('')
  const [offerProps, setOfferProps] = useState<number[]>([])
  const [requestProps, setRequestProps] = useState<number[]>([])
  const [offerJailCards, setOfferJailCards] = useState(0)
  const [requestJailCards, setRequestJailCards] = useState(0)
  const [tradeConfirmOpen, setTradeConfirmOpen] = useState(false)
  const [confirmOneWayGift, setConfirmOneWayGift] = useState(false)

  const pendingTrade = board?.pending_trade ? normalizePendingTrade(board.pending_trade) : null
  const pendingTradeKey = pendingTrade ? `${pendingTrade.from_player_id}:${pendingTrade.to_player_id}` : null
  const stalePendingTrade =
    !!pendingTrade &&
    (!players.some((p) => p.id === pendingTrade.from_player_id) ||
      !players.some((p) => p.id === pendingTrade.to_player_id))
  const repairedTradeKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!stalePendingTrade || !pendingTradeKey || !myPlayerId) return
    if (repairedTradeKeyRef.current === pendingTradeKey) return
    repairedTradeKeyRef.current = pendingTradeKey
    void postAction('/api/monopoly/trade', { repair: true })
  }, [stalePendingTrade, pendingTradeKey, myPlayerId, postAction])

  if (!board || !myPlayerId || !myState || myState.bankrupt) {
    return (
      <div className="glass-card p-5 text-center space-y-2">
        <p className="text-sm text-muted">You&apos;re out of this game.</p>
      </div>
    )
  }

  const owners = parsePropertyOwners(board.property_owners)
  const boardSize = board.board_size ?? 40
  const buildings = parseBuildings(board.property_buildings)
  const mortgaged = parseMortgaged(board.mortgaged_properties)
  const mine = playerProperties(owners, myPlayerId, boardSize)
  const theirs = tradeTarget ? playerProperties(owners, tradeTarget, boardSize) : []
  const myJailCards = myState.get_out_of_jail_free ?? 0
  const targetJailCards = tradeTarget ? (states.find((s) => s.player_id === tradeTarget)?.get_out_of_jail_free ?? 0) : 0
  const housesInBank = board.houses_in_bank ?? 32
  const hotelsInBank = board.hotels_in_bank ?? 12

  const toggleProp = (list: number[], setList: (v: number[]) => void, idx: number) => {
    setList(list.includes(idx) ? list.filter((i) => i !== idx) : [...list, idx])
    setTradeConfirmOpen(false)
    setConfirmOneWayGift(false)
  }

  const targetName = tradeTarget ? (players.find((p) => p.id === tradeTarget)?.name ?? 'player') : ''
  const parsedOfferCash = displayToCanonicalMoney(Number(offerCash) || 0, themeId)
  const parsedRequestCash = displayToCanonicalMoney(Number(requestCash) || 0, themeId)
  const givingSomething = tradeSideHasValue(parsedOfferCash, offerProps, offerJailCards)
  const gettingSomething = tradeSideHasValue(parsedRequestCash, requestProps, requestJailCards)
  const isOneWayGift = givingSomething && !gettingSomething
  const isOneWayReceive = gettingSomething && !givingSomething
  const tradeIsEmpty = !givingSomething && !gettingSomething
  const canOpenConfirm =
    !!tradeTarget && !tradeIsEmpty && (!isOneWayGift || confirmOneWayGift) && (!isOneWayReceive || confirmOneWayGift)

  const resetTradeForm = () => {
    setOfferCash('')
    setRequestCash('')
    setOfferProps([])
    setRequestProps([])
    setOfferJailCards(0)
    setRequestJailCards(0)
    setTradeConfirmOpen(false)
    setConfirmOneWayGift(false)
  }

  const sendTradeOffer = () => {
    void postAction('/api/monopoly/trade', {
      toPlayerId: tradeTarget,
      offerCash: parsedOfferCash,
      requestCash: parsedRequestCash,
      offerProperties: offerProps,
      requestProperties: requestProps,
      offerGetOutCards: offerJailCards,
      requestGetOutCards: requestJailCards,
    })
    resetTradeForm()
  }

  const activePendingTrade = stalePendingTrade ? null : pendingTrade
  const pendingTradeBlocksOthers =
    activePendingTrade &&
    activePendingTrade.from_player_id !== myPlayerId &&
    activePendingTrade.to_player_id !== myPlayerId

  const tradeSection = (
    <div className="space-y-3">
      {stalePendingTrade && (
        <p className="text-xs text-muted leading-relaxed rounded-lg border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] px-3 py-2">
          Clearing a stale trade — a player left the game.
        </p>
      )}

      {activePendingTrade?.from_player_id === myPlayerId && (
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--primary)_35%,var(--border-strong))] bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] p-3 space-y-2">
          <p className="text-sm text-muted">
            Waiting for{' '}
            <strong className="text-[var(--foreground)]">
              {players.find((p) => p.id === activePendingTrade.to_player_id)?.name ?? 'player'}
            </strong>{' '}
            to accept or decline:
          </p>
          <TradeExchangeReview
            compact
            giveLabel="You give"
            getLabel="You get"
            giveCash={activePendingTrade.offer_cash}
            giveProps={activePendingTrade.offer_properties}
            giveJailCards={activePendingTrade.offer_get_out_cards}
            getCash={activePendingTrade.request_cash}
            getProps={activePendingTrade.request_properties}
            getJailCards={activePendingTrade.request_get_out_cards ?? 0}
            themeId={themeId}
          />
          <MonopolySecondaryButton
            onClick={() => postAction('/api/monopoly/trade', { cancel: true })}
            disabled={acting}
          >
            Cancel offer
          </MonopolySecondaryButton>
        </div>
      )}

      {activePendingTrade?.to_player_id === myPlayerId && (
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--marry)_35%,var(--border-strong))] bg-[color-mix(in_srgb,var(--marry)_8%,transparent)] p-3 space-y-2">
          <p className="text-sm text-muted">
            Trade from{' '}
            <strong className="text-[var(--foreground)]">
              {players.find((p) => p.id === activePendingTrade.from_player_id)?.name ?? 'player'}
            </strong>{' '}
            — review all items in the popup before accepting:
          </p>
          <TradeExchangeReview
            compact
            giveLabel="You pay"
            getLabel="You receive"
            giveCash={activePendingTrade.request_cash}
            giveProps={activePendingTrade.request_properties}
            giveJailCards={activePendingTrade.request_get_out_cards ?? 0}
            getCash={activePendingTrade.offer_cash}
            getProps={activePendingTrade.offer_properties}
            getJailCards={activePendingTrade.offer_get_out_cards}
            themeId={themeId}
          />
        </div>
      )}

      {pendingTradeBlocksOthers && activePendingTrade && (
        <p className="text-xs text-muted leading-relaxed rounded-lg border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] px-3 py-2">
          A trade between{' '}
          <strong className="text-body">
            {players.find((p) => p.id === activePendingTrade.from_player_id)?.name ?? 'player'}
          </strong>{' '}
          and{' '}
          <strong className="text-body">
            {players.find((p) => p.id === activePendingTrade.to_player_id)?.name ?? 'player'}
          </strong>{' '}
          is in progress — new offers are paused until it finishes.
        </p>
      )}

      {!activePendingTrade && (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[var(--foreground)]">Propose a trade</p>
            <p className="text-xs text-muted leading-relaxed">
              {formatThemedText(
                'Pick what you give and what you get back — cash, properties, or skip-the-queue cards. Both sides must be filled in for a normal swap.',
                themeId
              )}
            </p>
          </div>
          <TradeTargetSelector
            players={players}
            myPlayerId={myPlayerId}
            tradeTarget={tradeTarget}
            states={states}
            owners={owners}
            boardSize={boardSize}
            themeId={themeId}
            onSelectTarget={(id) => {
              setTradeTarget(id)
              setRequestProps([])
              setRequestJailCards(0)
              setTradeConfirmOpen(false)
              setConfirmOneWayGift(false)
            }}
          />

          {tradeTarget && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/90">You give</p>
                  <input
                    type="number"
                    min={0}
                    step={canonicalToDisplayMoney(1, themeId)}
                    value={offerCash}
                    onChange={(e) => {
                      setOfferCash(e.target.value)
                      setTradeConfirmOpen(false)
                    }}
                    placeholder="Cash amount"
                    className="input-field text-sm w-full"
                  />
                  {mine.length > 0 ? (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      <p className="text-[10px] uppercase text-faint font-semibold">Your properties</p>
                      {mine.map((s) => (
                        <label key={s.index} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={offerProps.includes(s.index)}
                            onChange={() => toggleProp(offerProps, setOfferProps, s.index)}
                          />
                          {themedSpaceName(s.name, s.index, themeId)}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">You don&apos;t own any properties to offer.</p>
                  )}
                  {myJailCards > 0 && (
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={offerJailCards > 0}
                        onChange={(e) => {
                          setOfferJailCards(e.target.checked ? 1 : 0)
                          setTradeConfirmOpen(false)
                          setConfirmOneWayGift(false)
                        }}
                      />
                      {formatThemedText('Include 1 skip-the-queue card', themeId)}
                    </label>
                  )}
                </div>

                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    You get from {targetName}
                  </p>
                  <input
                    type="number"
                    min={0}
                    step={canonicalToDisplayMoney(1, themeId)}
                    value={requestCash}
                    onChange={(e) => {
                      setRequestCash(e.target.value)
                      setTradeConfirmOpen(false)
                    }}
                    placeholder="Cash amount"
                    className="input-field text-sm w-full"
                  />
                  {theirs.length > 0 ? (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      <p className="text-[10px] uppercase text-faint font-semibold">Their properties</p>
                      {theirs.map((s) => (
                        <label key={s.index} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={requestProps.includes(s.index)}
                            onChange={() => toggleProp(requestProps, setRequestProps, s.index)}
                          />
                          {themedSpaceName(s.name, s.index, themeId)}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">They don&apos;t own any properties yet.</p>
                  )}
                  {targetJailCards > 0 && (
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={requestJailCards > 0}
                        onChange={(e) => {
                          setRequestJailCards(e.target.checked ? 1 : 0)
                          setTradeConfirmOpen(false)
                          setConfirmOneWayGift(false)
                        }}
                      />
                      {formatThemedText('Ask for 1 skip-the-queue card', themeId)}
                    </label>
                  )}
                </div>
              </div>

              <TradeExchangeReview
                compact
                giveLabel="You give"
                getLabel={`You get from ${targetName}`}
                giveCash={parsedOfferCash}
                giveProps={offerProps}
                giveJailCards={offerJailCards}
                getCash={parsedRequestCash}
                getProps={requestProps}
                getJailCards={requestJailCards}
                themeId={themeId}
              />

              {(isOneWayGift || isOneWayReceive) && (
                <label className="flex items-start gap-2 text-xs text-muted leading-relaxed">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={confirmOneWayGift}
                    onChange={(e) => {
                      setConfirmOneWayGift(e.target.checked)
                      setTradeConfirmOpen(false)
                    }}
                  />
                  <span>
                    I understand this is one-way —{' '}
                    {isOneWayGift
                      ? 'I am giving items away without receiving anything.'
                      : 'I am asking for items without giving anything.'}
                  </span>
                </label>
              )}

              {!tradeConfirmOpen ? (
                <button
                  type="button"
                  disabled={acting || !canOpenConfirm}
                  className="btn-secondary w-full py-2.5 text-sm"
                  onClick={() => setTradeConfirmOpen(true)}
                >
                  Review trade offer
                </button>
              ) : (
                <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] p-3 space-y-3">
                  <p className="text-sm font-semibold text-[var(--foreground)]">Send this offer to {targetName}?</p>
                  <TradeExchangeReview
                    giveLabel="You give"
                    getLabel={`You get from ${targetName}`}
                    giveCash={parsedOfferCash}
                    giveProps={offerProps}
                    giveJailCards={offerJailCards}
                    getCash={parsedRequestCash}
                    getProps={requestProps}
                    getJailCards={requestJailCards}
                    themeId={themeId}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={acting}
                      className="btn-primary w-full py-2.5 text-sm"
                      onClick={sendTradeOffer}
                    >
                      Yes, send offer
                    </button>
                    <button
                      type="button"
                      disabled={acting}
                      className="btn-secondary w-full py-2.5 text-sm"
                      onClick={() => setTradeConfirmOpen(false)}
                    >
                      Go back
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )

  const playerNames = new Map(players.map((p) => [p.id, p.name]))
  const groupStatuses = buildColorGroupStatuses(owners, myPlayerId, playerNames, boardSize)
  const statusByGroup = new Map(groupStatuses.map((s) => [s.group, s]))
  const myGroups = ownedColorGroups(owners, myPlayerId, boardSize)
  const stationAndUtilityProps = mine.filter((s) => s.type === 'station' || s.type === 'utility')

  const renderPropertyCard = (space: (typeof mine)[number]) => {
    const level = buildingLevel(buildings, space.index)
    const isMortgaged = mortgaged[String(space.index)]
    const levelLabel = level === 5 ? '🏨 Hotel' : level > 0 ? `${level} 🏠` : 'Unimproved'
    const currentRent = isMortgaged
      ? null
      : computeRent(space, owners, myPlayerId, board.last_dice?.total ?? 2, buildings, mortgaged, boardSize)
    const canHouse = canAddHouse(space.index, myPlayerId, owners, buildings, mortgaged, housesInBank, boardSize)
    const canHotel = canAddHotel(space.index, myPlayerId, owners, buildings, mortgaged, hotelsInBank, boardSize)

    return (
      <div
        key={space.index}
        className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] overflow-hidden"
      >
        {space.color && <MonopolyColorBar color={space.color} />}
        <div className="p-3 space-y-2">
          <div className="flex justify-between gap-2">
            <span className="font-semibold text-sm text-[var(--foreground)]">
              {themedSpaceName(space.name, space.index, themeId)}
            </span>
            <span className="text-xs text-muted shrink-0">{isMortgaged ? 'Mortgaged' : levelLabel}</span>
          </div>
          <p className="text-[11px] text-faint leading-relaxed">
            {isMortgaged ? (
              <>No rent while mortgaged · unmortgage for {formatThemedMoney(unmortgageCost(space), themeId)}</>
            ) : currentRent != null ? (
              <>Current rent {formatThemedMoney(currentRent, themeId)}</>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {canHouse && (
              <button
                type="button"
                disabled={acting}
                onClick={() => postAction('/api/monopoly/build', { spaceIndex: space.index, action: 'buy_house' })}
                className="btn-primary btn-fit px-3 py-1.5 text-xs"
              >
                + House {formatThemedMoney(space.houseCost ?? 0, themeId)}
              </button>
            )}
            {canHotel && (
              <button
                type="button"
                disabled={acting}
                onClick={() => postAction('/api/monopoly/build', { spaceIndex: space.index, action: 'buy_hotel' })}
                className="btn-primary btn-fit px-3 py-1.5 text-xs"
              >
                + Hotel
              </button>
            )}
            {canRemoveHouse(space.index, myPlayerId, owners, buildings) && (
              <button
                type="button"
                disabled={acting}
                onClick={() => postAction('/api/monopoly/build', { spaceIndex: space.index, action: 'sell_house' })}
                className="btn-secondary btn-fit px-2.5 py-1 text-[10px]"
              >
                Sell house
              </button>
            )}
            {canRemoveHotel(space.index, myPlayerId, owners, buildings, housesInBank) && (
              <button
                type="button"
                disabled={acting}
                onClick={() => postAction('/api/monopoly/build', { spaceIndex: space.index, action: 'sell_hotel' })}
                className="btn-secondary btn-fit px-2.5 py-1 text-[10px]"
              >
                Sell hotel
              </button>
            )}
            {!isMortgaged && level === 0 && (
              <button
                type="button"
                disabled={acting}
                onClick={() => postAction('/api/monopoly/mortgage', { spaceIndex: space.index, action: 'mortgage' })}
                className="btn-secondary btn-fit px-2.5 py-1 text-[10px]"
                title={`Get ${formatThemedMoney(mortgageValue(space), themeId)} cash. No rent while mortgaged. Sell all buildings in the colour group first.`}
              >
                Mortgage
              </button>
            )}
            {isMortgaged && (
              <button
                type="button"
                disabled={acting}
                onClick={() => postAction('/api/monopoly/mortgage', { spaceIndex: space.index, action: 'unmortgage' })}
                className="btn-secondary btn-fit px-2.5 py-1 text-[10px]"
              >
                Unmortgage
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="space-y-2">
        <p className="label-caps">Inventory</p>
        <MonopolyJailCardInventory count={myJailCards} showEmpty themeId={themeId} />
      </div>

      <MonopolyColorPortfolio
        propertyOwners={owners}
        myPlayerId={myPlayerId}
        players={players}
        themeId={themeId}
        boardSize={boardSize}
      />

      <div className="space-y-3 pt-2 border-t border-[var(--border-strong)]">
        {mine.length === 0 ? (
          <div className="space-y-2">
            <p className="label-caps">Build &amp; trade</p>
            <p className="text-sm text-muted leading-relaxed">
              Land on unowned properties and tap <strong className="text-body">Buy</strong> when prompted. Once you own
              every street in a colour group, come back here to add <strong className="text-body">houses</strong> and{' '}
              <strong className="text-body">hotels</strong>.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <p className="label-caps">Your properties</p>
              <p className="text-xs text-muted leading-relaxed">
                Grouped by colour. Own a full set (✓) to build houses and hotels.
              </p>
            </div>
            {myGroups.map((group) => {
              const status = statusByGroup.get(group)!
              const groupProps = propertiesInGroupForPlayer(owners, myPlayerId, group, boardSize)
              return (
                <div key={group} className="space-y-2">
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={['h-4 w-4 shrink-0 rounded-sm', colorBarClass(group)].join(' ')} />
                      <span className="text-xs font-bold text-[var(--foreground)] truncate">
                        {COLOR_GROUP_LABELS[group]}
                        {status.complete && <span className="text-[var(--primary)] ml-1">✓</span>}
                      </span>
                    </div>
                    <MonopolyColorSetDots status={status} />
                  </div>
                  <div className="space-y-2">{groupProps.map(renderPropertyCard)}</div>
                </div>
              )
            })}
            {stationAndUtilityProps.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-[var(--foreground)] px-0.5">Stations &amp; utilities</p>
                <div className="space-y-2">{stationAndUtilityProps.map(renderPropertyCard)}</div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="pt-2 border-t border-[var(--border-strong)]">{tradeSection}</div>
    </div>
  )
}
