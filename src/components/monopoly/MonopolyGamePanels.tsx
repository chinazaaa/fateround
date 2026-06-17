'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MonopolyModal,
  MonopolyPrimaryButton,
  MonopolySecondaryButton,
} from '@/components/monopoly/MonopolyChrome'
import { formatCardAlertForPlayer } from '@/lib/monopoly-card-messages'
import {
  useMonopolyFixedTimer,
} from '@/hooks/useMonopolyModalTimer'
import { MONOPOLY_CARD_MODAL_SECONDS } from '@/lib/supabase-selects'
import {
  canAddHotel,
  canAddHouse,
  canRemoveHotel,
  canRemoveHouse,
} from '@/lib/monopoly-build'
import {
  buildingLevel,
  computeRent,
  parseBuildings,
  parseMortgaged,
} from '@/lib/monopoly-rent'
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
  currentPlayerId,
  formatMonopolyMoney,
  mortgageValue,
  parsePropertyOwners,
  playerProperties,
  spaceAt,
  unmortgageCost,
  type MonopolyColorGroup,
} from '@/lib/monopoly'
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
}: {
  cash: number
  propertyIndexes: unknown
  jailCards?: number
  compact?: boolean
}) {
  const items = buildTradeSideItems(cash, propertyIndexes, jailCards)
  if (items.length === 0) {
    return <p className={`text-muted italic ${compact ? 'text-xs' : 'text-sm'}`}>Nothing</p>
  }

  return (
    <ul className={`space-y-0.5 ${compact ? 'text-xs' : 'text-sm'} font-semibold text-[var(--foreground)] leading-snug`}>
      {items.map((item) => {
        if (item.kind === 'cash') {
          return (
            <li key="cash">
              <span className="text-muted font-normal">Cash </span>
              {formatMonopolyMoney(item.amount)}
            </li>
          )
        }
        if (item.kind === 'property') {
          return <li key={`prop-${item.index}`}>{item.name}</li>
        }
        return (
          <li key="jail">
            {item.count} Get Out of Jail card{item.count === 1 ? '' : 's'}
          </li>
        )
      })}
    </ul>
  )
}

function tradeSideCountLabel(cash: number, propertyIndexes: unknown, jailCards = 0): string | null {
  const propertyCount = normalizeTradePropertyList(propertyIndexes).length
  const parts: string[] = []
  if (propertyCount > 0) parts.push(`${propertyCount} propert${propertyCount === 1 ? 'y' : 'ies'}`)
  if (cash > 0) parts.push('cash')
  if (jailCards > 0) parts.push(`${jailCards} jail card${jailCards === 1 ? '' : 's'}`)
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
}) {
  const oneSidedGift = tradeSideHasValue(giveCash, giveProps, giveJailCards) && !tradeSideHasValue(getCash, getProps, getJailCards)
  const oneSidedReceive =
    tradeSideHasValue(getCash, getProps, getJailCards) && !tradeSideHasValue(giveCash, giveProps, giveJailCards)
  const giveCountLabel = tradeSideCountLabel(giveCash, giveProps, giveJailCards)
  const getCountLabel = tradeSideCountLabel(getCash, getProps, getJailCards)

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-xl border border-red-500/30 bg-red-500/8 p-2.5 sm:p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/90">{giveLabel}</p>
            {giveCountLabel && (
              <p className="text-[10px] font-semibold text-red-300/90 shrink-0">{giveCountLabel}</p>
            )}
          </div>
          <div className="mt-1">
            <TradeSideItems
              cash={giveCash}
              propertyIndexes={giveProps}
              jailCards={giveJailCards}
              compact={compact}
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

export function MonopolyCardAlertModal({
  board,
  myPlayerId,
  players,
}: {
  board: MonopolyBoard | null
  myPlayerId: string | null
  players: Player[]
}) {
  const event = board?.last_card_event ?? null
  const [dismissedSeq, setDismissedSeq] = useState<number | null>(null)
  const readyRef = useRef(false)
  const prevSeqRef = useRef<number | null>(null)

  useEffect(() => {
    if (!board) return
    const seq = board.last_card_event?.seq ?? null

    if (!readyRef.current) {
      readyRef.current = true
      prevSeqRef.current = seq
      if (seq != null) setDismissedSeq(seq)
      return
    }

    if (seq != null && seq !== prevSeqRef.current) {
      prevSeqRef.current = seq
      setDismissedSeq(null)
    }
  }, [board, board?.last_card_event?.seq])

  const isOpen = !!(event && dismissedSeq !== event.seq)
  const dismiss = useCallback(() => {
    if (event?.seq != null) setDismissedSeq(event.seq)
  }, [event?.seq])

  const cardSecondsLeft = useMonopolyFixedTimer(MONOPOLY_CARD_MODAL_SECONDS, isOpen, dismiss)

  if (!isOpen || !event) return null

  const alert = formatCardAlertForPlayer(event, myPlayerId, players)

  return (
    <MonopolyModal
      open
      subtitle={alert.subtitle}
      title={alert.title}
      timerSecondsLeft={cardSecondsLeft}
    >
      <p className="text-4xl text-center">{alert.emoji}</p>
      <p className="text-sm text-muted text-center leading-relaxed">{alert.body}</p>
      <MonopolyPrimaryButton onClick={dismiss}>Got it</MonopolyPrimaryButton>
    </MonopolyModal>
  )
}

export function MonopolyTurnModals({
  board,
  myPlayerId,
  players,
  acting,
  postAction,
}: {
  board: MonopolyBoard | null
  myPlayerId: string | null
  myState?: MonopolyPlayerState | undefined
  players: Player[]
  acting: boolean
  postAction: PostAction
  colorBarClass?: (color?: MonopolyColorGroup) => string
}) {
  const trade = board?.pending_trade ? normalizePendingTrade(board.pending_trade) : null
  const tradeFrom = trade ? players.find((p) => p.id === trade.from_player_id) : null
  const tradeTo = trade ? players.find((p) => p.id === trade.to_player_id) : null
  const showTradeModal = !!(trade && trade.to_player_id === myPlayerId && tradeFrom && tradeTo)
  const receiveCount = trade
    ? buildTradeSideItems(trade.offer_cash, trade.offer_properties, trade.offer_get_out_cards).length
    : 0

  return (
    <>
      {showTradeModal && trade && (
        <MonopolyModal open subtitle="Review every item before you accept" title={`Trade from ${tradeFrom?.name ?? 'player'}`}>
          <p className="text-sm text-muted leading-relaxed">
            If you accept, everything listed below happens immediately. Decline if the count or items look wrong.
          </p>
          {receiveCount > 0 && (
            <p className="text-sm font-semibold text-[var(--foreground)]">
              You receive {receiveCount} item{receiveCount === 1 ? '' : 's'} in this trade.
            </p>
          )}
          <div className="pt-2 max-h-[min(50vh,18rem)] overflow-y-auto">
            <TradeExchangeReview
              giveLabel="You pay"
              getLabel="You receive"
              giveCash={trade.request_cash}
              giveProps={trade.request_properties}
              getCash={trade.offer_cash}
              getProps={trade.offer_properties}
              getJailCards={trade.offer_get_out_cards}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-3">
            <MonopolyPrimaryButton onClick={() => postAction('/api/monopoly/trade', { accept: true })} loading={acting}>
              Accept trade
            </MonopolyPrimaryButton>
            <MonopolySecondaryButton
              onClick={() => postAction('/api/monopoly/trade', { accept: false })}
              disabled={acting}
            >
              Decline
            </MonopolySecondaryButton>
          </div>
        </MonopolyModal>
      )}
    </>
  )
}

export function MonopolyManagePanel({
  board,
  myPlayerId,
  myState,
  players,
  acting,
  postAction,
}: {
  board: MonopolyBoard | null
  myPlayerId: string | null
  myState: MonopolyPlayerState | undefined
  players: Player[]
  acting: boolean
  postAction: PostAction
}) {
  const [tradeTarget, setTradeTarget] = useState('')
  const [offerCash, setOfferCash] = useState('')
  const [requestCash, setRequestCash] = useState('')
  const [offerProps, setOfferProps] = useState<number[]>([])
  const [requestProps, setRequestProps] = useState<number[]>([])
  const [tradeConfirmOpen, setTradeConfirmOpen] = useState(false)
  const [confirmOneWayGift, setConfirmOneWayGift] = useState(false)

  const pendingTrade = board?.pending_trade ? normalizePendingTrade(board.pending_trade) : null
  const pendingTradeKey = pendingTrade
    ? `${pendingTrade.from_player_id}:${pendingTrade.to_player_id}`
    : null
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
  const buildings = parseBuildings(board.property_buildings)
  const mortgaged = parseMortgaged(board.mortgaged_properties)
  const mine = playerProperties(owners, myPlayerId)
  const theirs = tradeTarget ? playerProperties(owners, tradeTarget) : []
  const housesInBank = board.houses_in_bank ?? 32
  const hotelsInBank = board.hotels_in_bank ?? 12

  const toggleProp = (list: number[], setList: (v: number[]) => void, idx: number) => {
    setList(list.includes(idx) ? list.filter((i) => i !== idx) : [...list, idx])
    setTradeConfirmOpen(false)
    setConfirmOneWayGift(false)
  }

  const targetName = tradeTarget ? players.find((p) => p.id === tradeTarget)?.name ?? 'player' : ''
  const parsedOfferCash = Number(offerCash) || 0
  const parsedRequestCash = Number(requestCash) || 0
  const givingSomething = tradeSideHasValue(parsedOfferCash, offerProps)
  const gettingSomething = tradeSideHasValue(parsedRequestCash, requestProps)
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
            getCash={activePendingTrade.request_cash}
            getProps={activePendingTrade.request_properties}
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
            getCash={activePendingTrade.offer_cash}
            getProps={activePendingTrade.offer_properties}
            getJailCards={activePendingTrade.offer_get_out_cards}
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
              Pick what <strong className="text-body">you give</strong> and what{' '}
              <strong className="text-body">you get back</strong>. Both sides must be filled in for a normal swap.
              Cash-only trades work even if you own no properties.
            </p>
          </div>
          <select
            value={tradeTarget}
            onChange={(e) => {
              setTradeTarget(e.target.value)
              setRequestProps([])
              setTradeConfirmOpen(false)
              setConfirmOneWayGift(false)
            }}
            className="input-field w-full text-sm"
          >
            <option value="">Trade with…</option>
            {players.filter((p) => p.id !== myPlayerId).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {tradeTarget && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/90">You give</p>
                  <input
                    type="number"
                    min={0}
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
                          {s.name}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">You don&apos;t own any properties to offer.</p>
                  )}
                </div>

                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    You get from {targetName}
                  </p>
                  <input
                    type="number"
                    min={0}
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
                          {s.name}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">They don&apos;t own any properties yet.</p>
                  )}
                </div>
              </div>

              <TradeExchangeReview
                compact
                giveLabel="You give"
                getLabel={`You get from ${targetName}`}
                giveCash={parsedOfferCash}
                giveProps={offerProps}
                getCash={parsedRequestCash}
                getProps={requestProps}
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
                    getCash={parsedRequestCash}
                    getProps={requestProps}
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
  const groupStatuses = buildColorGroupStatuses(owners, myPlayerId, playerNames)
  const statusByGroup = new Map(groupStatuses.map((s) => [s.group, s]))
  const myGroups = ownedColorGroups(owners, myPlayerId)
  const stationAndUtilityProps = mine.filter((s) => s.type === 'station' || s.type === 'utility')

  const renderPropertyCard = (space: (typeof mine)[number]) => {
    const level = buildingLevel(buildings, space.index)
    const isMortgaged = mortgaged[String(space.index)]
    const levelLabel = level === 5 ? '🏨 Hotel' : level > 0 ? `${level} 🏠` : 'Unimproved'
    const currentRent = isMortgaged
      ? null
      : computeRent(space, owners, myPlayerId, board.last_dice?.total ?? 2, buildings, mortgaged)
    const canHouse = canAddHouse(space.index, myPlayerId, owners, buildings, mortgaged, housesInBank)
    const canHotel = canAddHotel(space.index, myPlayerId, owners, buildings, mortgaged, hotelsInBank)

    return (
      <div
        key={space.index}
        className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] overflow-hidden"
      >
        {space.color && <MonopolyColorBar color={space.color} />}
        <div className="p-3 space-y-2">
          <div className="flex justify-between gap-2">
            <span className="font-semibold text-sm text-[var(--foreground)]">{space.name}</span>
            <span className="text-xs text-muted shrink-0">{isMortgaged ? 'Mortgaged' : levelLabel}</span>
          </div>
          <p className="text-[11px] text-faint leading-relaxed">
            {isMortgaged ? (
              <>No rent while mortgaged · unmortgage for {formatMonopolyMoney(unmortgageCost(space))}</>
            ) : currentRent != null ? (
              <>Current rent {formatMonopolyMoney(currentRent)}</>
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
                + House {formatMonopolyMoney(space.houseCost ?? 0)}
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
            {canRemoveHotel(space.index, myPlayerId, owners, buildings) && (
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
                title={`Get ${formatMonopolyMoney(mortgageValue(space))} cash. No rent while mortgaged. Sell all buildings in the colour group first.`}
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
      <MonopolyColorPortfolio propertyOwners={owners} myPlayerId={myPlayerId} players={players} />

      <div className="space-y-3 pt-2 border-t border-[var(--border-strong)]">
        {mine.length === 0 ? (
          <div className="space-y-2">
            <p className="label-caps">Build &amp; trade</p>
            <p className="text-sm text-muted leading-relaxed">
              Land on unowned properties and tap <strong className="text-body">Buy</strong> when prompted.
              Once you own every street in a colour group, come back here to add{' '}
              <strong className="text-body">houses</strong> and <strong className="text-body">hotels</strong>.
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
              const groupProps = propertiesInGroupForPlayer(owners, myPlayerId, group)
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
