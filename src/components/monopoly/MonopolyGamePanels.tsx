'use client'

import { useState } from 'react'
import {
  MonopolyGlassCard,
  MonopolyModal,
  MonopolyPrimaryButton,
  MonopolySecondaryButton,
} from '@/components/monopoly/MonopolyChrome'
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
  currentPlayerId,
  formatMonopolyMoney,
  MONOPOLY_JAIL_FINE,
  parsePropertyOwners,
  playerProperties,
  spaceAt,
  type MonopolyColorGroup,
} from '@/lib/monopoly'
import type { MonopolyBoard, MonopolyPlayerState, Player } from '@/types'

type PostAction = (url: string, body?: Record<string, unknown>) => Promise<void>

export function MonopolyTurnModals({
  board,
  myPlayerId,
  myState,
  players,
  acting,
  postAction,
  colorBarClass,
}: {
  board: MonopolyBoard | null
  myPlayerId: string | null
  myState: MonopolyPlayerState | undefined
  players: Player[]
  acting: boolean
  postAction: PostAction
  colorBarClass: (color?: MonopolyColorGroup) => string
}) {
  const turnPlayerId = board ? currentPlayerId(board) : null
  const isMyTurn = turnPlayerId === myPlayerId && !myState?.bankrupt

  const owners = parsePropertyOwners(board?.property_owners)
  const buildings = parseBuildings(board?.property_buildings)
  const mortgaged = parseMortgaged(board?.mortgaged_properties)
  const pendingSpace = board?.pending_space != null ? spaceAt(board.pending_space) : null

  const rentOwnerId =
    board?.phase === 'pay_rent' && board.pending_space != null ? owners[String(board.pending_space)] : null
  const rentOwner = rentOwnerId ? players.find((p) => p.id === rentOwnerId) : null
  const rentAmount =
    pendingSpace && rentOwnerId
      ? computeRent(pendingSpace, owners, rentOwnerId, board?.last_dice?.total ?? 2, buildings, mortgaged)
      : 0

  const auction = board?.auction_state
  const auctionSpace = auction ? spaceAt(auction.space_index) : null
  const isMyAuctionTurn = auction?.current_bidder_id === myPlayerId
  const [bidAmount, setBidAmount] = useState('')

  const trade = board?.pending_trade
  const tradeFrom = trade ? players.find((p) => p.id === trade.from_player_id) : null

  const showBuyModal = !!(isMyTurn && board?.phase === 'buy' && pendingSpace)
  const showRentModal = !!(isMyTurn && board?.phase === 'pay_rent' && pendingSpace)
  const showJailModal = !!(isMyTurn && board?.phase === 'jail' && myState?.in_jail)
  const showAuctionModal = !!(board?.phase === 'auction' && auction && isMyAuctionTurn)
  const showTradeModal = !!(trade && trade.to_player_id === myPlayerId)

  return (
    <>
      <MonopolyModal
        open={showBuyModal}
        subtitle="Property available"
        title={pendingSpace?.name ?? ''}
        colorBar={pendingSpace?.color ? colorBarClass(pendingSpace.color) : undefined}
      >
        <p className="text-center text-3xl font-black text-[var(--marry)]">
          {formatMonopolyMoney(pendingSpace?.price ?? 0)}
        </p>
        {pendingSpace?.rent != null && (
          <p className="text-center text-sm text-muted">Site rent {formatMonopolyMoney(pendingSpace.rent)}</p>
        )}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <MonopolyPrimaryButton
            onClick={() => postAction('/api/monopoly/buy', { buy: true })}
            loading={acting}
            disabled={(myState?.cash ?? 0) < (pendingSpace?.price ?? 0)}
          >
            Buy
          </MonopolyPrimaryButton>
          <MonopolySecondaryButton
            onClick={() => postAction('/api/monopoly/buy', { buy: false })}
            disabled={acting}
          >
            Auction
          </MonopolySecondaryButton>
        </div>
      </MonopolyModal>

      <MonopolyModal
        open={showRentModal}
        subtitle="Rent due"
        title={pendingSpace?.name ?? ''}
        colorBar={pendingSpace?.color ? colorBarClass(pendingSpace.color) : undefined}
      >
        <p className="text-center text-sm text-muted">
          Owned by <span className="font-bold text-[var(--foreground)]">{rentOwner?.name ?? 'another player'}</span>
        </p>
        <p className="text-center text-3xl font-black text-red-500">{formatMonopolyMoney(rentAmount)}</p>
        <MonopolyPrimaryButton
          onClick={() => postAction('/api/monopoly/rent')}
          loading={acting}
          disabled={(myState?.cash ?? 0) < rentAmount}
        >
          Pay {formatMonopolyMoney(rentAmount)}
        </MonopolyPrimaryButton>
      </MonopolyModal>

      <MonopolyModal open={showJailModal} subtitle="In jail" title="🔒 Roll, pay, or use a card">
        <div className="space-y-2">
          <MonopolyPrimaryButton onClick={() => postAction('/api/monopoly/roll')} loading={acting}>
            Roll for doubles
          </MonopolyPrimaryButton>
          <MonopolySecondaryButton
            onClick={() => postAction('/api/monopoly/jail', { method: 'pay' })}
            disabled={acting || (myState?.cash ?? 0) < MONOPOLY_JAIL_FINE}
          >
            Pay {formatMonopolyMoney(MONOPOLY_JAIL_FINE)} fine
          </MonopolySecondaryButton>
          {(myState?.get_out_of_jail_free ?? 0) > 0 && (
            <MonopolySecondaryButton
              onClick={() => postAction('/api/monopoly/jail', { method: 'card' })}
              disabled={acting}
            >
              Use Get Out of Jail Free card
            </MonopolySecondaryButton>
          )}
        </div>
      </MonopolyModal>

      {showAuctionModal && auction && (
        <MonopolyModal
          open
          subtitle="Property auction"
          title={auctionSpace?.name ?? 'Auction'}
          colorBar={auctionSpace?.color ? colorBarClass(auctionSpace.color) : undefined}
        >
          <p className="text-center text-sm text-muted">
            High bid:{' '}
            <span className="font-bold text-[var(--foreground)]">
              {auction.high_bid > 0 ? formatMonopolyMoney(auction.high_bid) : 'None yet'}
            </span>
          </p>
          <input
            type="number"
            min={auction.high_bid + 1}
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            placeholder={`Min ${auction.high_bid + 1}`}
            className="input-field w-full"
          />
          <div className="grid grid-cols-2 gap-2 pt-2">
            <MonopolyPrimaryButton
              onClick={() =>
                postAction('/api/monopoly/auction', { action: 'bid', amount: Number(bidAmount) || undefined })
              }
              loading={acting}
              disabled={!bidAmount || Number(bidAmount) <= auction.high_bid}
            >
              Bid
            </MonopolyPrimaryButton>
            <MonopolySecondaryButton
              onClick={() => postAction('/api/monopoly/auction', { action: 'pass' })}
              disabled={acting}
            >
              Pass
            </MonopolySecondaryButton>
          </div>
        </MonopolyModal>
      )}

      {showTradeModal && trade && (
        <MonopolyModal open subtitle="Trade offer" title={`From ${tradeFrom?.name ?? 'player'}`}>
          <div className="text-sm text-muted space-y-2">
            <p>
              <span className="font-semibold text-[var(--foreground)]">They offer:</span>{' '}
              {formatMonopolyMoney(trade.offer_cash)}
              {trade.offer_properties.length > 0 &&
                ` · ${trade.offer_properties.map((i) => spaceAt(i).name).join(', ')}`}
              {trade.offer_get_out_cards > 0 && ` · ${trade.offer_get_out_cards} jail card(s)`}
            </p>
            <p>
              <span className="font-semibold text-[var(--foreground)]">They want:</span>{' '}
              {formatMonopolyMoney(trade.request_cash)}
              {trade.request_properties.length > 0 &&
                ` · ${trade.request_properties.map((i) => spaceAt(i).name).join(', ')}`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <MonopolyPrimaryButton onClick={() => postAction('/api/monopoly/trade', { accept: true })} loading={acting}>
              Accept
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
  const [offerCash, setOfferCash] = useState('0')
  const [requestCash, setRequestCash] = useState('0')
  const [offerProps, setOfferProps] = useState<number[]>([])
  const [requestProps, setRequestProps] = useState<number[]>([])

  if (!board || !myPlayerId || !myState || myState.bankrupt) return null

  const owners = parsePropertyOwners(board.property_owners)
  const buildings = parseBuildings(board.property_buildings)
  const mortgaged = parseMortgaged(board.mortgaged_properties)
  const mine = playerProperties(owners, myPlayerId)
  const theirs = tradeTarget ? playerProperties(owners, tradeTarget) : []

  const toggleProp = (list: number[], setList: (v: number[]) => void, idx: number) => {
    setList(list.includes(idx) ? list.filter((i) => i !== idx) : [...list, idx])
  }

  if (mine.length === 0) return null

  return (
    <MonopolyGlassCard className="p-4 space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-faint">Manage properties</p>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {mine.map((space) => {
          const level = buildingLevel(buildings, space.index)
          const isMortgaged = mortgaged[String(space.index)]
          const levelLabel = level === 5 ? '🏨 Hotel' : level > 0 ? `${level} 🏠` : 'Unimproved'
          return (
            <div key={space.index} className="rounded-xl border border-[var(--border-strong)] p-3 space-y-2">
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-sm text-[var(--foreground)]">{space.name}</span>
                <span className="text-xs text-muted">{isMortgaged ? 'Mortgaged' : levelLabel}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {canAddHouse(space.index, myPlayerId, owners, buildings, mortgaged, board.houses_in_bank ?? 32) && (
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => postAction('/api/monopoly/build', { spaceIndex: space.index, action: 'buy_house' })}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-[var(--primary)]/20 text-[var(--primary)]"
                  >
                    +House {formatMonopolyMoney(space.houseCost ?? 0)}
                  </button>
                )}
                {canAddHotel(space.index, myPlayerId, owners, buildings, mortgaged, board.hotels_in_bank ?? 12) && (
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => postAction('/api/monopoly/build', { spaceIndex: space.index, action: 'buy_hotel' })}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-[var(--marry)]/20 text-[var(--marry)]"
                  >
                    +Hotel
                  </button>
                )}
                {canRemoveHouse(space.index, myPlayerId, owners, buildings) && (
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => postAction('/api/monopoly/build', { spaceIndex: space.index, action: 'sell_house' })}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-neutral-500/20"
                  >
                    Sell house
                  </button>
                )}
                {canRemoveHotel(space.index, myPlayerId, owners, buildings) && (
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => postAction('/api/monopoly/build', { spaceIndex: space.index, action: 'sell_hotel' })}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-neutral-500/20"
                  >
                    Sell hotel
                  </button>
                )}
                {!isMortgaged && level === 0 && (
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => postAction('/api/monopoly/mortgage', { spaceIndex: space.index, action: 'mortgage' })}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-500/20 text-amber-700"
                  >
                    Mortgage
                  </button>
                )}
                {isMortgaged && (
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => postAction('/api/monopoly/mortgage', { spaceIndex: space.index, action: 'unmortgage' })}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-700"
                  >
                    Unmortgage
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {!board.pending_trade && (
        <div className="pt-2 border-t border-[var(--border-strong)] space-y-2">
          <p className="text-xs font-semibold text-muted">Propose trade</p>
          <select
            value={tradeTarget}
            onChange={(e) => {
              setTradeTarget(e.target.value)
              setRequestProps([])
            }}
            className="input-field w-full text-sm"
          >
            <option value="">Select player</option>
            {players.filter((p) => p.id !== myPlayerId).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              value={offerCash}
              onChange={(e) => setOfferCash(e.target.value)}
              placeholder="Offer £"
              className="input-field text-sm"
            />
            <input
              type="number"
              min={0}
              value={requestCash}
              onChange={(e) => setRequestCash(e.target.value)}
              placeholder="Request £"
              className="input-field text-sm"
            />
          </div>
          {mine.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase text-faint font-semibold">Offer properties</p>
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
          )}
          {theirs.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase text-faint font-semibold">Request properties</p>
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
          )}
          <MonopolySecondaryButton
            disabled={acting || !tradeTarget}
            onClick={() =>
              postAction('/api/monopoly/trade', {
                toPlayerId: tradeTarget,
                offerCash: Number(offerCash) || 0,
                requestCash: Number(requestCash) || 0,
                offerProperties: offerProps,
                requestProperties: requestProps,
              })
            }
          >
            Send trade offer
          </MonopolySecondaryButton>
        </div>
      )}
    </MonopolyGlassCard>
  )
}
