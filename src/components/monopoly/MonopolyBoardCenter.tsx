'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MonopolyDiceRoll, MonopolyYourTokenChip } from '@/components/monopoly/MonopolyBoard'
import { MonopolyJailCardInventory } from '@/components/monopoly/MonopolyChrome'
import { useMonopolyDeadlineTimer } from '@/hooks/useMonopolyModalTimer'
import { computeRent, parseBuildings, parseMortgaged } from '@/lib/monopoly-rent'
import {
  currentPlayerId,
  MONOPOLY_JAIL_FINE,
  parsePropertyOwners,
  spaceAt,
  type MonopolyColorGroup,
} from '@/lib/monopoly'
import {
  canonicalToDisplayMoney,
  displayToCanonicalMoney,
  formatThemedMoney,
  formatThemedText,
  getBoardPalette,
  themedSpaceName,
} from '@/components/monopoly/monopoly-themes'
import type { MonopolyBoard, MonopolyPlayerState, Player } from '@/types'
import { shortSpaceName } from '@/components/monopoly/monopoly-ui'

type PostAction = (url: string, body?: Record<string, unknown>) => Promise<void>

function BoardTimer({ seconds }: { seconds: number }) {
  if (seconds <= 0) return null
  const urgent = seconds <= 5
  return (
    <span
      className={[
        'rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums',
        urgent ? 'bg-red-500/30 text-red-100 animate-pulse' : 'bg-emerald-950/50 text-emerald-100',
      ].join(' ')}
    >
      {seconds}s
    </span>
  )
}

function BoardPrimaryButton({
  children,
  onClick,
  disabled,
  loading,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-emerald-950 px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold transition-colors w-full"
    >
      {loading ? '…' : children}
    </button>
  )
}

function BoardSecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-emerald-300/40 bg-emerald-900/70 hover:bg-emerald-800/80 disabled:opacity-40 text-emerald-50 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold transition-colors w-full"
    >
      {children}
    </button>
  )
}

export function MonopolyBoardCenter({
  board,
  myPlayerId,
  myState,
  players,
  acting,
  postAction,
  colorBarClass,
  layout = 'board',
  themeId,
  forcedAuctions,
}: {
  board: MonopolyBoard
  myPlayerId: string | null
  myState: MonopolyPlayerState | undefined
  players: Player[]
  acting: boolean
  postAction: PostAction
  colorBarClass: (color?: MonopolyColorGroup) => string
  layout?: 'board' | 'dock'
  themeId?: string | null
  forcedAuctions?: boolean
}) {
  const palette = getBoardPalette(themeId)
  const turnPlayerId = currentPlayerId(board)
  const isMyTurn = turnPlayerId === myPlayerId && !myState?.bankrupt

  const owners = parsePropertyOwners(board.property_owners)
  const buildings = parseBuildings(board.property_buildings)
  const mortgaged = parseMortgaged(board.mortgaged_properties)
  const pendingSpace = board.pending_space != null ? spaceAt(board.pending_space) : null

  const rentOwnerId =
    board.phase === 'pay_rent' && board.pending_space != null ? owners[String(board.pending_space)] : null
  const rentOwner = rentOwnerId ? players.find((p) => p.id === rentOwnerId) : null
  const rentAmount =
    board.pending_debt?.debt_type === 'rent' && board.pending_debt?.amount != null
      ? board.pending_debt.amount
      : pendingSpace && rentOwnerId
        ? computeRent(pendingSpace, owners, rentOwnerId, board.last_dice?.total ?? 2, buildings, mortgaged)
        : 0

  const auction = board.auction_state
  const auctionSpace = auction ? spaceAt(auction.space_index) : null
  const isMyAuctionTurn = auction?.current_bidder_id === myPlayerId
  const [bidAmount, setBidAmount] = useState('')

  const debt = board.pending_debt
  const isMyDebt = debt?.player_id === myPlayerId
  const debtAmount = debt?.amount ?? 0
  const debtCreditor = debt?.creditor_player_id ? players.find((p) => p.id === debt.creditor_player_id) : null

  const showRaiseFunds = !!(isMyDebt && board.phase === 'raise_funds' && debt)
  const showBuy = !!(isMyTurn && board.phase === 'buy' && pendingSpace)
  const showRent = !!(isMyTurn && board.phase === 'pay_rent' && pendingSpace)
  const showJail = !!(isMyTurn && board.phase === 'jail' && myState?.in_jail)
  const showAuction = !!(board.phase === 'auction' && auction && isMyAuctionTurn)
  const showRoll = !!(isMyTurn && board.phase === 'roll' && !myState?.in_jail)

  const actingRef = useRef(acting)
  useEffect(() => {
    actingRef.current = acting
  }, [acting])

  const autoBuyAuction = useCallback(() => {
    if (!actingRef.current) void postAction('/api/monopoly/buy', { decision: 'auction' })
  }, [postAction])

  const autoPayRent = useCallback(() => {
    if (!actingRef.current) void postAction('/api/monopoly/rent')
  }, [postAction])

  const autoAuctionPass = useCallback(() => {
    if (!actingRef.current) void postAction('/api/monopoly/auction', { action: 'pass' })
  }, [postAction])

  const autoRoll = useCallback(() => {
    if (!actingRef.current) void postAction('/api/monopoly/roll')
  }, [postAction])

  const autoForfeit = useCallback(() => {
    if (!actingRef.current) void postAction('/api/monopoly/forfeit')
  }, [postAction])

  const deadline = board.turn_deadline_at ?? null
  const buySeconds = useMonopolyDeadlineTimer(deadline, showBuy, autoBuyAuction)
  const rentSeconds = useMonopolyDeadlineTimer(deadline, showRent, autoPayRent)
  const raiseFundsSeconds = useMonopolyDeadlineTimer(deadline, showRaiseFunds, autoForfeit)
  const rollSeconds = useMonopolyDeadlineTimer(deadline, showRoll, autoRoll)
  const jailSeconds = useMonopolyDeadlineTimer(deadline, showJail, autoRoll)
  const auctionSeconds = useMonopolyDeadlineTimer(deadline, showAuction, autoAuctionPass)

  const actionSeconds = showBuy
    ? buySeconds
    : showRent
      ? rentSeconds
      : showRaiseFunds
        ? raiseFundsSeconds
        : showRoll
          ? rollSeconds
          : showJail
            ? jailSeconds
            : showAuction
              ? auctionSeconds
              : 0

  const phaseColorBar =
    (showBuy || showRent) && pendingSpace?.color
      ? colorBarClass(pendingSpace.color)
      : showRaiseFunds && debt?.space_index != null && spaceAt(debt.space_index).color
        ? colorBarClass(spaceAt(debt.space_index).color)
        : showAuction && auctionSpace?.color
          ? colorBarClass(auctionSpace.color)
          : null

  const isDock = layout === 'dock'
  const shellClass = isDock
    ? 'glass-card rounded-2xl p-4 space-y-3 text-center w-full'
    : 'flex flex-col items-center justify-center h-full w-full min-w-0 px-0.5 sm:px-2 py-0.5 sm:py-2 text-center overflow-hidden'
  const panelClass = isDock
    ? 'w-full space-y-2'
    : 'mt-0.5 sm:mt-1.5 w-full max-w-[11rem] sm:max-w-[12rem] space-y-0.5 sm:space-y-1.5'
  const widePanelClass = isDock
    ? 'w-full space-y-2'
    : 'mt-0.5 sm:mt-1.5 w-full max-w-[12rem] sm:max-w-[13rem] space-y-0.5 sm:space-y-1.5'
  const rollPanelClass = isDock
    ? 'w-full space-y-1.5'
    : 'mt-0.5 sm:mt-2 w-full max-w-[9rem] sm:max-w-[10rem] space-y-0.5 sm:space-y-1'
  const labelClass = isDock
    ? 'text-[10px] uppercase tracking-wider text-muted'
    : `text-[10px] uppercase tracking-wider ${palette.centerSubtleText}`
  const titleClass = isDock
    ? 'text-sm font-bold text-[var(--foreground)] leading-tight truncate'
    : `text-xs sm:text-sm font-bold ${palette.centerText} leading-tight truncate`
  const subtleClass = isDock
    ? 'text-xs text-muted leading-snug'
    : `text-[10px] ${palette.centerSubtleText} leading-snug`
  const priceClass = isDock
    ? 'text-lg font-black text-[var(--primary)] tabular-nums'
    : `text-base sm:text-xl font-black ${palette.centerPriceText} tabular-nums`
  const debtPriceClass = isDock
    ? 'text-lg font-black text-red-500 tabular-nums'
    : `text-base sm:text-xl font-black ${palette.centerDebtPriceText} tabular-nums`

  return (
    <div className={shellClass}>
      {isDock && myState && (myState.get_out_of_jail_free ?? 0) > 0 && (
        <MonopolyJailCardInventory count={myState.get_out_of_jail_free} themeId={themeId} />
      )}

      {myPlayerId && myState && !myState.bankrupt && !isDock && (
        <div className="mb-0.5 sm:mb-2 shrink-0 space-y-0.5 sm:space-y-1 max-w-full">
          <MonopolyYourTokenChip players={players} playerId={myPlayerId} playerOrder={myState.player_order} compact />
          <p className={`hidden sm:block text-[10px] ${palette.centerSubtleText} leading-snug`}>
            Currently on{' '}
            <span className={`font-bold ${palette.centerText}`}>
              {themedSpaceName(spaceAt(Number(myState.position)).name, Number(myState.position), themeId)}
            </span>
          </p>
        </div>
      )}

      {myState && !isDock && (
        <div className="mb-0.5 sm:mb-1.5 shrink-0 max-w-full">
          <p
            className={`hidden sm:block text-[8px] sm:text-[10px] font-semibold uppercase tracking-widest ${palette.centerSubtleText} leading-none`}
          >
            {myState.bankrupt ? 'Bankrupt' : 'Your cash'}
          </p>
          <p
            className={[
              'text-xs sm:text-xl font-black tabular-nums leading-tight mt-0.5',
              myState.bankrupt ? palette.centerDebtPriceText : palette.centerPriceText,
            ].join(' ')}
          >
            {formatThemedMoney(myState.cash, themeId)}
          </p>
          {(myState.get_out_of_jail_free ?? 0) > 0 && (
            <div className="mt-1 flex justify-center">
              <MonopolyJailCardInventory count={myState.get_out_of_jail_free} compact themeId={themeId} />
            </div>
          )}
        </div>
      )}

      {phaseColorBar && !isDock && <div className={['h-1 w-10 sm:w-16 rounded-full mb-1', phaseColorBar].join(' ')} />}

      {!showBuy && !showRent && !showRaiseFunds && !showJail && !showAuction && (
        <MonopolyDiceRoll dice={board.last_dice} rolling={acting} compact={!isDock} />
      )}

      {actionSeconds > 0 && (
        <div className="mt-1">
          <BoardTimer seconds={actionSeconds} />
        </div>
      )}

      {showRoll && (
        <div className={rollPanelClass}>
          <BoardPrimaryButton onClick={() => postAction('/api/monopoly/roll')} loading={acting}>
            🎲 Roll
          </BoardPrimaryButton>
          {myState && !(myState.passed_go_once ?? false) && (
            <p
              className={[
                `${palette.centerSubtleText} leading-snug text-center`,
                isDock ? 'text-xs text-muted' : 'text-[9px]',
              ].join(' ')}
            >
              {formatThemedText(
                'Pass GO once before buying, paying tax, drawing cards, or collecting GO salary',
                themeId
              )}
            </p>
          )}
        </div>
      )}

      {showBuy && pendingSpace && (
        <div className={panelClass}>
          <p className={labelClass}>For sale</p>
          <p className={titleClass}>
            <span className="hidden sm:inline">{themedSpaceName(pendingSpace.name, pendingSpace.index, themeId)}</span>
            <span className="sm:hidden">{shortSpaceName(pendingSpace.name, 16, pendingSpace.index, themeId)}</span>
          </p>
          <p className={priceClass}>{formatThemedMoney(pendingSpace.price ?? 0, themeId)}</p>
          {pendingSpace.rent != null && (
            <p className={subtleClass}>Rent {formatThemedMoney(pendingSpace.rent, themeId)}</p>
          )}
          <div className="space-y-1.5 pt-0.5">
            <BoardPrimaryButton
              onClick={() => postAction('/api/monopoly/buy', { decision: 'buy' })}
              loading={acting}
              disabled={(myState?.cash ?? 0) < (pendingSpace.price ?? 0)}
            >
              Buy
            </BoardPrimaryButton>
            <div className={forcedAuctions ? 'mt-1.5' : 'grid grid-cols-2 gap-1.5'}>
              <BoardSecondaryButton
                onClick={() => postAction('/api/monopoly/buy', { decision: 'auction' })}
                disabled={acting}
              >
                Auction
              </BoardSecondaryButton>
              {!forcedAuctions && (
                <BoardSecondaryButton
                  onClick={() => postAction('/api/monopoly/buy', { decision: 'pass' })}
                  disabled={acting}
                >
                  Pass
                </BoardSecondaryButton>
              )}
            </div>
          </div>
        </div>
      )}

      {showRent && pendingSpace && (
        <div className={panelClass}>
          <p className={labelClass}>Rent Due</p>
          <p className={titleClass}>
            <span className="hidden sm:inline">{themedSpaceName(pendingSpace.name, pendingSpace.index, themeId)}</span>
            <span className="sm:hidden">{shortSpaceName(pendingSpace.name, 16, pendingSpace.index, themeId)}</span>
          </p>
          <p className={debtPriceClass}>{formatThemedMoney(rentAmount, themeId)}</p>
          <p className={isDock ? 'text-xs text-muted truncate' : 'text-xs text-muted truncate'}>
            Owner: {rentOwner?.name ?? 'Someone'}
          </p>
          <div className="space-y-1.5 pt-0.5">
            <BoardPrimaryButton onClick={() => postAction('/api/monopoly/rent', {})} loading={acting} disabled={acting}>
              Pay Rent
            </BoardPrimaryButton>
          </div>
        </div>
      )}

      {showRaiseFunds && debt && (
        <div className={widePanelClass}>
          <p className={labelClass}>Debt Due</p>
          <p className={titleClass}>Owed to {debtCreditor ? debtCreditor.name : 'Bank'}</p>
          <p className={debtPriceClass}>{formatThemedMoney(debtAmount, themeId)}</p>
          <p className={isDock ? 'text-xs text-muted leading-tight' : 'text-xs text-muted leading-snug'}>
            Mortgage properties or sell houses to raise cash.
          </p>
          <div className="space-y-1.5 pt-0.5">
            <BoardPrimaryButton
              onClick={() => postAction('/api/monopoly/settle-debt', { action: 'pay' })}
              loading={acting}
              disabled={acting || (myState?.cash ?? 0) < debtAmount}
            >
              Pay Debt
            </BoardPrimaryButton>
          </div>
        </div>
      )}

      {showJail && (
        <div className={panelClass}>
          <p className={labelClass}>In Jail</p>
          <p className={titleClass}>{themedSpaceName('Jail', 10, themeId)}</p>
          <p className={isDock ? 'text-xs text-muted leading-tight' : 'text-xs text-muted leading-snug'}>
            Attempt {(myState?.jail_turns ?? 0) + 1}/3 — roll once for doubles, or pay{' '}
            {formatThemedMoney(MONOPOLY_JAIL_FINE, themeId)} now.
          </p>
          <div className="space-y-1.5 pt-0.5">
            <div className="grid grid-cols-2 gap-1.5">
              <BoardPrimaryButton onClick={() => postAction('/api/monopoly/roll')} loading={acting} disabled={acting}>
                Roll Doubles
              </BoardPrimaryButton>
              <BoardSecondaryButton
                onClick={() => postAction('/api/monopoly/jail', { method: 'pay' })}
                disabled={acting || (myState?.cash ?? 0) < MONOPOLY_JAIL_FINE}
              >
                Pay {formatThemedMoney(MONOPOLY_JAIL_FINE, themeId)}
              </BoardSecondaryButton>
            </div>
            {myState && (myState.get_out_of_jail_free ?? 0) > 0 && (
              <BoardSecondaryButton
                onClick={() => postAction('/api/monopoly/jail', { method: 'card' })}
                disabled={acting}
              >
                Use Card ({myState.get_out_of_jail_free})
              </BoardSecondaryButton>
            )}
          </div>
        </div>
      )}

      {showAuction && auction && auctionSpace && (
        <div className={panelClass}>
          <p className={labelClass}>Auction</p>
          <p className={titleClass}>
            <span className="hidden sm:inline">{themedSpaceName(auctionSpace.name, auctionSpace.index, themeId)}</span>
            <span className="sm:hidden">{shortSpaceName(auctionSpace.name, 16, auctionSpace.index, themeId)}</span>
          </p>
          <p className={subtleClass}>
            High: {auction.high_bid > 0 ? formatThemedMoney(auction.high_bid, themeId) : 'None'}
          </p>
          <input
            type="number"
            min={canonicalToDisplayMoney(auction.high_bid + 1, themeId)}
            step={canonicalToDisplayMoney(1, themeId)}
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            placeholder={`Min ${formatThemedMoney(auction.high_bid + 1, themeId)}`}
            className="input-field w-full py-1 text-xs text-center"
          />
          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <BoardPrimaryButton
              onClick={() =>
                postAction('/api/monopoly/auction', {
                  action: 'bid',
                  amount: displayToCanonicalMoney(Number(bidAmount), themeId) || undefined,
                })
              }
              loading={acting}
              disabled={!bidAmount || displayToCanonicalMoney(Number(bidAmount), themeId) <= auction.high_bid}
            >
              Bid
            </BoardPrimaryButton>
            <BoardSecondaryButton
              onClick={() => postAction('/api/monopoly/auction', { action: 'pass' })}
              disabled={acting}
            >
              Pass
            </BoardSecondaryButton>
          </div>
        </div>
      )}

      {board.phase === 'auction' && auction && !isMyAuctionTurn && (
        <div className={isDock ? 'space-y-1' : 'mt-1.5 space-y-0.5'}>
          <p className={labelClass}>Auction</p>
          <p
            className={
              isDock ? 'text-xs text-muted leading-snug' : `text-[11px] ${palette.centerSubtleText} leading-snug`
            }
          >
            {auctionSpace ? themedSpaceName(auctionSpace.name, auctionSpace.index, themeId) : ''}
            <br />
            {players.find((p) => p.id === auction.current_bidder_id)?.name ?? 'Someone'}&apos;s bid
          </p>
        </div>
      )}
    </div>
  )
}
