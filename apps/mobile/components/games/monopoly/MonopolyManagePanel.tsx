import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { MonopolyBoard, MonopolyPlayerState, Player } from '@fateround/shared'
import {
  mortgageValue,
  unmortgageCost,
  type MonopolyColorGroup,
} from '@fateround/shared/monopoly-board'
import { MONOPOLY_COLOR_HEX } from '@fateround/shared/monopoly-board-layout'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { SelectField, type SelectOption } from '@/components/create/SelectField'
import { formatThemedMoney, themedSpaceName } from './monopoly-theme'
import { buildColorPortfolio, type ColorPortfolioStatus } from './color-portfolio'
import { MonopolyTradeReview } from './MonopolyTradeReview'
import {
  buildColorGroupStatuses,
  buildingLevel,
  canAddHotel,
  canAddHouse,
  canRemoveHotel,
  canRemoveHouse,
  computeRent,
  COLOR_GROUP_LABELS,
  normalizePendingTrade,
  ownedColorGroups,
  parseBuildings,
  parseMortgaged,
  parsePropertyOwners,
  playerProperties,
  propertiesInGroupForPlayer,
  tradeSideHasValue,
} from './manage-logic'

export type BuildAction = 'buy_house' | 'sell_house' | 'buy_hotel' | 'sell_hotel'
export type MortgageAction = 'mortgage' | 'unmortgage'
export type TradeProposal = {
  toPlayerId: string
  offerCash: number
  requestCash: number
  offerProperties: number[]
  requestProperties: number[]
  offerGetOutCards: number
  requestGetOutCards: number
}

export function MonopolyManagePanel({
  board,
  myPlayerId,
  myState,
  states,
  players,
  acting,
  themeId,
  onBuild,
  onMortgage,
  onProposeTrade,
  onCancelTrade,
  onRepairTrade,
}: {
  board: MonopolyBoard
  myPlayerId: string | null
  myState: MonopolyPlayerState | undefined
  states: MonopolyPlayerState[]
  players: Player[]
  acting: boolean
  themeId?: string | null
  onBuild: (spaceIndex: number, action: BuildAction) => void
  onMortgage: (spaceIndex: number, action: MortgageAction) => void
  onProposeTrade: (proposal: TradeProposal) => void
  onCancelTrade: () => void
  onRepairTrade: () => void
}) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()

  const [tradeTarget, setTradeTarget] = useState('')
  const [offerCash, setOfferCash] = useState('')
  const [requestCash, setRequestCash] = useState('')
  const [offerProps, setOfferProps] = useState<number[]>([])
  const [requestProps, setRequestProps] = useState<number[]>([])
  const [offerJailCards, setOfferJailCards] = useState(0)
  const [requestJailCards, setRequestJailCards] = useState(0)
  const [tradeConfirmOpen, setTradeConfirmOpen] = useState(false)
  const [confirmOneWayGift, setConfirmOneWayGift] = useState(false)

  const pendingTrade = normalizePendingTrade(board.pending_trade)
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
    onRepairTrade()
  }, [stalePendingTrade, pendingTradeKey, myPlayerId, onRepairTrade])

  if (!myPlayerId || !myState || myState.bankrupt) {
    return (
      <View style={styles.card}>
        <Text style={styles.mutedCenter}>You&apos;re out of this game.</Text>
      </View>
    )
  }

  const owners = parsePropertyOwners(board.property_owners)
  const buildings = parseBuildings(board.property_buildings)
  const mortgaged = parseMortgaged(board.mortgaged_properties)
  const mine = playerProperties(owners, myPlayerId)
  const theirs = tradeTarget ? playerProperties(owners, tradeTarget) : []
  const myJailCards = myState.get_out_of_jail_free ?? 0
  const targetJailCards = tradeTarget
    ? states.find((s) => s.player_id === tradeTarget)?.get_out_of_jail_free ?? 0
    : 0
  const housesInBank = board.houses_in_bank ?? 32
  const hotelsInBank = board.hotels_in_bank ?? 12

  // Dropdown options for the trade partner (mirrors web's `<select>`): a
  // "Trade with…" placeholder followed by every tradeable player — all players
  // except me and anyone bankrupt.
  const tradeTargetOptions: SelectOption<string>[] = [
    { value: '', label: 'Trade with…' },
    ...players
      .filter((p) => p.id !== myPlayerId && !states.find((s) => s.player_id === p.id)?.bankrupt)
      .map((p) => ({ value: p.id, label: p.name })),
  ]

  const toggleProp = (list: number[], setList: (v: number[]) => void, idx: number) => {
    setList(list.includes(idx) ? list.filter((i) => i !== idx) : [...list, idx])
    setTradeConfirmOpen(false)
    setConfirmOneWayGift(false)
  }

  const targetName = tradeTarget ? players.find((p) => p.id === tradeTarget)?.name ?? 'player' : ''
  const parsedOfferCash = Math.max(0, Math.floor(Number(offerCash) || 0))
  const parsedRequestCash = Math.max(0, Math.floor(Number(requestCash) || 0))
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
    onProposeTrade({
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

  const statusByGroup = buildColorGroupStatuses(owners, myPlayerId)
  const myGroups = ownedColorGroups(owners, myPlayerId)
  const stationAndUtilityProps = mine.filter((s) => s.type === 'station' || s.type === 'utility')

  // Full colour-set portfolio (all groups, with the streets still needed) —
  // mirrors web MonopolyColorPortfolio / ColorSetRow.
  const playerNames = new Map(players.map((p) => [p.id, p.name]))
  const portfolio = buildColorPortfolio(owners, myPlayerId, playerNames)
  const streetSets = portfolio.filter((s) => s.group !== 'station' && s.group !== 'utility')
  const specialSets = portfolio.filter((s) => s.group === 'station' || s.group === 'utility')
  const completeSetCount = streetSets.filter((s) => s.complete).length
  const inProgressSetCount = streetSets.filter((s) => s.owned > 0 && !s.complete).length

  const renderColorSetCard = (status: ColorPortfolioStatus) => {
    const inactive = status.owned === 0
    return (
      <View
        key={status.group}
        style={[
          styles.setCard,
          inactive ? styles.setCardInactive : status.complete ? styles.setCardComplete : null,
        ]}
      >
        <View style={[styles.setCardBar, { backgroundColor: MONOPOLY_COLOR_HEX[status.group] }]} />
        <View style={styles.setCardBody}>
          <View style={styles.setCardHeader}>
            <Text style={styles.setCardName} numberOfLines={1}>
              {status.label}
            </Text>
            <Text style={styles.setCardCount}>
              {status.owned}/{status.total}
              {status.complete ? <Text style={styles.setCardCheck}> ✓</Text> : null}
            </Text>
          </View>
          {!inactive && status.missing.length > 0 ? (
            <Text style={styles.setCardNeed}>
              <Text style={styles.setCardNeedLabel}>Need: </Text>
              {status.missing.map((m, i) => (
                <Text key={m.index}>
                  {i > 0 ? ', ' : ''}
                  <Text style={styles.setCardNeedStreet}>{themedSpaceName(m.name, m.index, themeId)}</Text>
                  <Text style={styles.setCardNeedOwner}>
                    {m.heldBy === 'other' && m.ownerName ? ` (${m.ownerName})` : ' (bank)'}
                  </Text>
                </Text>
              ))}
            </Text>
          ) : null}
          {inactive ? <Text style={styles.setCardEmpty}>None owned yet</Text> : null}
        </View>
      </View>
    )
  }

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
      <View key={space.index} style={styles.propCard}>
        {space.color ? (
          <View style={[styles.propColorBar, { backgroundColor: MONOPOLY_COLOR_HEX[space.color] }]} />
        ) : null}
        <View style={styles.propBody}>
          <View style={styles.propHeader}>
            <Text style={styles.propName}>{themedSpaceName(space.name, space.index, themeId)}</Text>
            <Text style={styles.propMeta}>{isMortgaged ? 'Mortgaged' : levelLabel}</Text>
          </View>
          <Text style={styles.propRent}>
            {isMortgaged
              ? `No rent while mortgaged · unmortgage for ${formatThemedMoney(unmortgageCost(space), themeId)}`
              : currentRent != null
                ? `Current rent ${formatThemedMoney(currentRent, themeId)}`
                : ''}
          </Text>
          <View style={styles.propActions}>
            {canHouse ? (
              <Pressable
                disabled={acting}
                onPress={() => onBuild(space.index, 'buy_house')}
                style={[styles.chip, styles.chipPrimary, acting && styles.disabled]}
              >
                <Text style={styles.chipPrimaryText}>+ House {formatThemedMoney(space.houseCost ?? 0, themeId)}</Text>
              </Pressable>
            ) : null}
            {canHotel ? (
              <Pressable
                disabled={acting}
                onPress={() => onBuild(space.index, 'buy_hotel')}
                style={[styles.chip, styles.chipPrimary, acting && styles.disabled]}
              >
                <Text style={styles.chipPrimaryText}>+ Hotel</Text>
              </Pressable>
            ) : null}
            {canRemoveHouse(space.index, myPlayerId, owners, buildings) ? (
              <Pressable
                disabled={acting}
                onPress={() => onBuild(space.index, 'sell_house')}
                style={[styles.chip, styles.chipSecondary, acting && styles.disabled]}
              >
                <Text style={styles.chipSecondaryText}>Sell house</Text>
              </Pressable>
            ) : null}
            {canRemoveHotel(space.index, myPlayerId, owners, buildings) ? (
              <Pressable
                disabled={acting}
                onPress={() => onBuild(space.index, 'sell_hotel')}
                style={[styles.chip, styles.chipSecondary, acting && styles.disabled]}
              >
                <Text style={styles.chipSecondaryText}>Sell hotel</Text>
              </Pressable>
            ) : null}
            {!isMortgaged && level === 0 ? (
              <Pressable
                disabled={acting}
                onPress={() => onMortgage(space.index, 'mortgage')}
                style={[styles.chip, styles.chipSecondary, acting && styles.disabled]}
              >
                <Text style={styles.chipSecondaryText}>Mortgage {formatThemedMoney(mortgageValue(space), themeId)}</Text>
              </Pressable>
            ) : null}
            {isMortgaged ? (
              <Pressable
                disabled={acting}
                onPress={() => onMortgage(space.index, 'unmortgage')}
                style={[styles.chip, styles.chipSecondary, acting && styles.disabled]}
              >
                <Text style={styles.chipSecondaryText}>Unmortgage</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    )
  }

  const renderCheckRow = (
    space: { index: number; name: string },
    list: number[],
    setList: (v: number[]) => void
  ) => {
    const checked = list.includes(space.index)
    return (
      <Pressable key={space.index} style={styles.checkRow} onPress={() => toggleProp(list, setList, space.index)}>
        <View style={[styles.checkbox, checked && styles.checkboxOn]}>
          {checked ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
        <Text style={styles.checkLabel}>{themedSpaceName(space.name, space.index, themeId)}</Text>
      </Pressable>
    )
  }

  return (
    <View style={styles.card}>
      {/* Inventory */}
      <View style={styles.section}>
        <Text style={styles.labelCaps}>Inventory</Text>
        <Text style={styles.inventoryText}>
          {myJailCards > 0
            ? `🎟️ ${myJailCards} Get Out of Jail card${myJailCards === 1 ? '' : 's'}`
            : 'No Get Out of Jail cards'}
        </Text>
      </View>

      {/* Colour-set portfolio */}
      <View style={styles.section}>
        <View style={styles.setHeaderRow}>
          <Text style={styles.labelCaps}>Colour sets</Text>
          <Text style={styles.setHeaderMeta}>
            {completeSetCount} complete
            {inProgressSetCount > 0 ? ` · ${inProgressSetCount} in progress` : ''}
          </Text>
        </View>
        <View style={styles.setGrid}>{streetSets.map(renderColorSetCard)}</View>
        <View style={styles.setGrid}>{specialSets.map(renderColorSetCard)}</View>
      </View>

      {/* Your properties */}
      <View style={[styles.section, styles.divider]}>
        {mine.length === 0 ? (
          <>
            <Text style={styles.labelCaps}>Build &amp; trade</Text>
            <Text style={styles.muted}>
              Land on unowned properties and tap Buy when prompted. Once you own every street in a color group, come
              back here to add houses and hotels.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.labelCaps}>Your properties</Text>
            <Text style={styles.muted}>Grouped by color. Own a full set (✓) to build houses and hotels.</Text>
            {myGroups.map((group) => {
              const status = statusByGroup.get(group)!
              const groupProps = propertiesInGroupForPlayer(owners, myPlayerId, group)
              return (
                <View key={group} style={styles.groupBlock}>
                  <View style={styles.groupHeader}>
                    <View style={[styles.groupSwatch, { backgroundColor: MONOPOLY_COLOR_HEX[group] }]} />
                    <Text style={styles.groupTitle}>
                      {COLOR_GROUP_LABELS[group]}
                      {status.complete ? <Text style={styles.groupCheck}> ✓</Text> : null}
                    </Text>
                    <Text style={styles.groupCount}>
                      {status.owned}/{status.total}
                    </Text>
                  </View>
                  {groupProps.map(renderPropertyCard)}
                </View>
              )
            })}
            {stationAndUtilityProps.length > 0 ? (
              <View style={styles.groupBlock}>
                <Text style={styles.groupTitle}>Stations &amp; utilities</Text>
                {stationAndUtilityProps.map(renderPropertyCard)}
              </View>
            ) : null}
          </>
        )}
      </View>

      {/* Trade */}
      <View style={[styles.section, styles.divider]}>
        {stalePendingTrade ? (
          <Text style={styles.infoBox}>Clearing a stale trade — a player left the game.</Text>
        ) : null}

        {activePendingTrade?.from_player_id === myPlayerId ? (
          <View style={styles.pendingBox}>
            <Text style={styles.muted}>
              Waiting for{' '}
              <Text style={styles.strong}>
                {players.find((p) => p.id === activePendingTrade.to_player_id)?.name ?? 'player'}
              </Text>{' '}
              to accept or decline:
            </Text>
            <MonopolyTradeReview
              themeId={themeId}
              giveLabel="You give"
              getLabel="You get"
              giveCash={activePendingTrade.offer_cash}
              giveProps={activePendingTrade.offer_properties}
              giveJailCards={activePendingTrade.offer_get_out_cards}
              getCash={activePendingTrade.request_cash}
              getProps={activePendingTrade.request_properties}
              getJailCards={activePendingTrade.request_get_out_cards ?? 0}
            />
            <Pressable
              disabled={acting}
              onPress={onCancelTrade}
              style={[styles.wideBtn, styles.secondaryBtn, acting && styles.disabled]}
            >
              <Text style={styles.secondaryBtnText}>Cancel offer</Text>
            </Pressable>
          </View>
        ) : null}

        {activePendingTrade?.to_player_id === myPlayerId ? (
          <View style={styles.pendingBoxAlt}>
            <Text style={styles.muted}>
              Trade from{' '}
              <Text style={styles.strong}>
                {players.find((p) => p.id === activePendingTrade.from_player_id)?.name ?? 'player'}
              </Text>{' '}
              — review all items in the popup before accepting:
            </Text>
            <MonopolyTradeReview
              themeId={themeId}
              giveLabel="You pay"
              getLabel="You receive"
              giveCash={activePendingTrade.request_cash}
              giveProps={activePendingTrade.request_properties}
              giveJailCards={activePendingTrade.request_get_out_cards ?? 0}
              getCash={activePendingTrade.offer_cash}
              getProps={activePendingTrade.offer_properties}
              getJailCards={activePendingTrade.offer_get_out_cards}
            />
          </View>
        ) : null}

        {pendingTradeBlocksOthers && activePendingTrade ? (
          <Text style={styles.infoBox}>
            A trade between{' '}
            {players.find((p) => p.id === activePendingTrade.from_player_id)?.name ?? 'player'} and{' '}
            {players.find((p) => p.id === activePendingTrade.to_player_id)?.name ?? 'player'} is in progress — new
            offers are paused until it finishes.
          </Text>
        ) : null}

        {!activePendingTrade ? (
          <View style={styles.section}>
            <Text style={styles.labelCaps}>Propose a trade</Text>
            <Text style={styles.muted}>
              Pick what you give and what you get back — cash, properties, or Get Out of Jail cards. Both sides must be
              filled in for a normal swap.
            </Text>

            <SelectField
              value={tradeTarget}
              title="Trade with"
              options={tradeTargetOptions}
              onChange={(v) => {
                setTradeTarget(v)
                setRequestProps([])
                setRequestJailCards(0)
                setTradeConfirmOpen(false)
                setConfirmOneWayGift(false)
              }}
            />

            {tradeTarget ? (
              <>
                <View style={styles.tradeGrid}>
                  <View style={[styles.tradeSide, styles.tradeGive]}>
                    <Text style={[styles.tradeSideLabel, styles.giveText]}>You give</Text>
                    <TextInput
                      style={styles.cashInput}
                      value={offerCash}
                      onChangeText={(v) => {
                        setOfferCash(v)
                        setTradeConfirmOpen(false)
                      }}
                      keyboardType="number-pad"
                      placeholder="Cash amount"
                      placeholderTextColor={theme.textFaint}
                    />
                    {mine.length > 0 ? (
                      <>
                        <Text style={styles.miniLabel}>Your properties</Text>
                        {mine.map((s) => renderCheckRow(s, offerProps, setOfferProps))}
                      </>
                    ) : (
                      <Text style={styles.muted}>You don&apos;t own any properties to offer.</Text>
                    )}
                    {myJailCards > 0 ? (
                      <Pressable
                        style={styles.checkRow}
                        onPress={() => {
                          setOfferJailCards(offerJailCards > 0 ? 0 : 1)
                          setTradeConfirmOpen(false)
                          setConfirmOneWayGift(false)
                        }}
                      >
                        <View style={[styles.checkbox, offerJailCards > 0 && styles.checkboxOn]}>
                          {offerJailCards > 0 ? <Text style={styles.checkMark}>✓</Text> : null}
                        </View>
                        <Text style={styles.checkLabel}>Include 1 Get Out of Jail card</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={[styles.tradeSide, styles.tradeGet]}>
                    <Text style={[styles.tradeSideLabel, styles.getText]}>You get from {targetName}</Text>
                    <TextInput
                      style={styles.cashInput}
                      value={requestCash}
                      onChangeText={(v) => {
                        setRequestCash(v)
                        setTradeConfirmOpen(false)
                      }}
                      keyboardType="number-pad"
                      placeholder="Cash amount"
                      placeholderTextColor={theme.textFaint}
                    />
                    {theirs.length > 0 ? (
                      <>
                        <Text style={styles.miniLabel}>Their properties</Text>
                        {theirs.map((s) => renderCheckRow(s, requestProps, setRequestProps))}
                      </>
                    ) : (
                      <Text style={styles.muted}>They don&apos;t own any properties yet.</Text>
                    )}
                    {targetJailCards > 0 ? (
                      <Pressable
                        style={styles.checkRow}
                        onPress={() => {
                          setRequestJailCards(requestJailCards > 0 ? 0 : 1)
                          setTradeConfirmOpen(false)
                          setConfirmOneWayGift(false)
                        }}
                      >
                        <View style={[styles.checkbox, requestJailCards > 0 && styles.checkboxOn]}>
                          {requestJailCards > 0 ? <Text style={styles.checkMark}>✓</Text> : null}
                        </View>
                        <Text style={styles.checkLabel}>Ask for 1 Get Out of Jail card</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <MonopolyTradeReview
                  themeId={themeId}
                  giveLabel="You give"
                  getLabel={`You get from ${targetName}`}
                  giveCash={parsedOfferCash}
                  giveProps={offerProps}
                  giveJailCards={offerJailCards}
                  getCash={parsedRequestCash}
                  getProps={requestProps}
                  getJailCards={requestJailCards}
                />

                {isOneWayGift || isOneWayReceive ? (
                  <Pressable
                    style={styles.checkRow}
                    onPress={() => {
                      setConfirmOneWayGift(!confirmOneWayGift)
                      setTradeConfirmOpen(false)
                    }}
                  >
                    <View style={[styles.checkbox, confirmOneWayGift && styles.checkboxOn]}>
                      {confirmOneWayGift ? <Text style={styles.checkMark}>✓</Text> : null}
                    </View>
                    <Text style={styles.checkLabel}>
                      I understand this is one-way —{' '}
                      {isOneWayGift
                        ? 'I am giving items away without receiving anything.'
                        : 'I am asking for items without giving anything.'}
                    </Text>
                  </Pressable>
                ) : null}

                {!tradeConfirmOpen ? (
                  <Pressable
                    disabled={acting || !canOpenConfirm}
                    onPress={() => setTradeConfirmOpen(true)}
                    style={[styles.wideBtn, styles.secondaryBtn, (acting || !canOpenConfirm) && styles.disabled]}
                  >
                    <Text style={styles.secondaryBtnText}>Review trade offer</Text>
                  </Pressable>
                ) : (
                  <View style={styles.confirmBox}>
                    <Text style={styles.strong}>Send this offer to {targetName}?</Text>
                    <MonopolyTradeReview
                      themeId={themeId}
                      giveLabel="You give"
                      getLabel={`You get from ${targetName}`}
                      giveCash={parsedOfferCash}
                      giveProps={offerProps}
                      giveJailCards={offerJailCards}
                      getCash={parsedRequestCash}
                      getProps={requestProps}
                      getJailCards={requestJailCards}
                    />
                    <View style={styles.confirmActions}>
                      <Pressable
                        disabled={acting}
                        onPress={sendTradeOffer}
                        style={[styles.wideBtn, styles.flexBtn, styles.primaryBtn, acting && styles.disabled]}
                      >
                        <Text style={styles.primaryBtnText}>Yes, send offer</Text>
                      </Pressable>
                      <Pressable
                        disabled={acting}
                        onPress={() => setTradeConfirmOpen(false)}
                        style={[styles.wideBtn, styles.flexBtn, styles.secondaryBtn, acting && styles.disabled]}
                      >
                        <Text style={styles.secondaryBtnText}>Go back</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { backgroundColor: theme.surface, borderRadius: 14, padding: 14, gap: 14 },
    section: { gap: 8 },
    divider: { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12 },
    labelCaps: { color: theme.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    muted: { color: theme.textMuted, fontSize: 13, lineHeight: 18 },
    mutedCenter: { color: theme.textMuted, fontSize: 14, textAlign: 'center' },
    strong: { color: theme.text, fontWeight: '700' },
    inventoryText: { color: theme.text, fontSize: 14, fontWeight: '600' },

    setHeaderRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 6,
    },
    setHeaderMeta: { color: theme.textMuted, fontSize: 10 },
    setGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    setCard: {
      width: '48%',
      flexGrow: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      overflow: 'hidden',
    },
    setCardInactive: { opacity: 0.55 },
    setCardComplete: { borderColor: theme.primary },
    setCardBar: { height: 8, width: '100%' },
    setCardBody: { paddingHorizontal: 10, paddingVertical: 8, gap: 3 },
    setCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
    setCardName: { color: theme.text, fontSize: 13, fontWeight: '700', flexShrink: 1 },
    setCardCount: { color: theme.text, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
    setCardCheck: { color: theme.primary },
    setCardNeed: { color: theme.textMuted, fontSize: 10, lineHeight: 15 },
    setCardNeedLabel: { color: theme.textMuted, fontWeight: '700' },
    setCardNeedStreet: { color: theme.text },
    setCardNeedOwner: { color: theme.textFaint },
    setCardEmpty: { color: theme.textFaint, fontSize: 10 },

    groupBlock: { gap: 8, marginTop: 4 },
    groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    groupSwatch: { width: 14, height: 14, borderRadius: 3 },
    groupTitle: { color: theme.text, fontSize: 13, fontWeight: '700', flex: 1 },
    groupCheck: { color: theme.primary },
    groupCount: { color: theme.textMuted, fontSize: 12, fontWeight: '600' },

    propCard: { borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.bg, overflow: 'hidden' },
    propColorBar: { height: 6, width: '100%' },
    propBody: { padding: 10, gap: 6 },
    propHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    propName: { color: theme.text, fontSize: 14, fontWeight: '700', flex: 1 },
    propMeta: { color: theme.textMuted, fontSize: 12 },
    propRent: { color: theme.textFaint, fontSize: 11, lineHeight: 15 },
    propActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    chipPrimary: { backgroundColor: theme.primary },
    chipPrimaryText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    chipSecondary: { backgroundColor: theme.border },
    chipSecondaryText: { color: theme.text, fontSize: 11, fontWeight: '600' },

    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
    checkbox: {
      width: 18,
      height: 18,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxOn: { backgroundColor: theme.primary, borderColor: theme.primary },
    checkMark: { color: '#fff', fontSize: 12, fontWeight: '800', lineHeight: 14 },
    checkLabel: { color: theme.text, fontSize: 12, flex: 1 },
    miniLabel: { color: theme.textFaint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },

    targetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    targetChip: { borderRadius: 20, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 6 },
    targetChipOn: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    targetChipText: { color: theme.text, fontSize: 13, fontWeight: '600' },
    targetChipTextOn: { color: theme.primaryMuted },

    tradeGrid: { flexDirection: 'row', gap: 8 },
    tradeSide: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 10, gap: 6 },
    tradeGive: { borderColor: '#ef444440', backgroundColor: '#ef44440d' },
    tradeGet: { borderColor: '#10b98140', backgroundColor: '#10b9810d' },
    tradeSideLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    giveText: { color: '#f87171' },
    getText: { color: '#34d399' },
    cashInput: {
      backgroundColor: theme.bg,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 8,
      color: theme.text,
      fontSize: 14,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },

    infoBox: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    pendingBox: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      backgroundColor: theme.primarySoft,
      padding: 12,
      gap: 8,
    },
    pendingBoxAlt: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      padding: 12,
      gap: 8,
    },
    confirmBox: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      padding: 12,
      gap: 10,
    },
    confirmActions: { flexDirection: 'row', gap: 8 },

    wideBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    flexBtn: { flex: 1 },
    primaryBtn: { backgroundColor: theme.primary },
    // white on the solid rose button — intentional
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    secondaryBtn: { backgroundColor: theme.border },
    secondaryBtnText: { color: theme.text, fontWeight: '600', fontSize: 14 },
    disabled: { opacity: 0.5 },
  })
