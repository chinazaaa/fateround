import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useToast } from '@/components/ui/Toast'
import { centeredContent } from '@/constants/layout'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles, useThemeMode } from '@/constants/theme-context'
import { apiUrl } from '@/lib/config'
import { authHeaders } from '@/lib/identity'
import {
  fetchShopCatalog,
  postEquip,
  postPurchase,
  type ShopCatalog,
  type ShopItem,
  type EquipSlot,
} from '@/lib/coins/shop-api'
import { findAnimation, findCardTemplate, findFrame, findNameColor, type ShopKind } from '@/lib/coins/shop-catalog'
import { COIN_EVENTS, trackCoinEvent } from '@/lib/coins/analytics'
import { emitCoinsAwarded } from '@/lib/coins/earn-events'

/**
 * Mobile mirror of `src/components/coins/ShopClient.tsx`.
 *
 * Behaviour parity is non-negotiable — same categories, same Owned (N)
 * chip, same tile grid, same confirm-dialog with balance-after preview,
 * same insufficient-funds CTA ("Play a game to earn more" → /browse),
 * same outcome-first purchase routing. The two Phase 3 lessons are
 * enforced here:
 *   1. Client sends {kind, slug} only — server resolves price.
 *   2. Purchase routing checks `data.outcome` first, NOT `res.ok` first
 *      (402 for insufficient_funds makes res.ok=false but is the "not
 *      enough coins" branch, not the server_error one).
 */

const CATEGORIES: { key: ShopKind; label: string }[] = [
  { key: 'theme', label: 'Game themes' },
  { key: 'animation', label: 'Winner animations' },
  { key: 'frame', label: 'Avatar frames' },
  { key: 'name_color', label: 'Name colors' },
  { key: 'card_template', label: 'Card templates' },
  { key: 'streak_freeze', label: 'Streak freeze' },
  { key: 'library_pack', label: 'Library packs' },
  { key: 'edition', label: 'Editions' },
]

function isEquippable(kind: ShopKind): boolean {
  return kind === 'frame' || kind === 'name_color' || kind === 'animation' || kind === 'card_template'
}

function labelForKind(kind: ShopKind): string {
  return CATEGORIES.find((c) => c.key === kind)?.label ?? kind
}

export default function ShopScreen() {
  const router = useRouter()
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const toast = useToast()

  const [catalog, setCatalog] = useState<ShopCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ShopKind | 'all'>('all')
  // Cross-cuts kind filter — same pattern as web ShopClient.
  const [ownedOnly, setOwnedOnly] = useState(false)
  const [pending, setPending] = useState<ShopItem | null>(null)
  const [busy, setBusy] = useState(false)
  // Anonymous flag is NOT in the /api/shop/catalog profile payload, so an
  // ensureServerIdentity() Supabase anon session would otherwise slip past
  // the `profile == null` check and see the buy tiles (which then reject
  // server-side with an ugly error). Fetch /api/profile/me alongside for
  // the flag — matches web's `!profile || profile.is_anonymous` gate.
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false)

  const load = useCallback(
    async (opts?: { background?: boolean }) => {
      const background = opts?.background === true
      if (!background) setLoading(true)
      try {
        const [data, meRes] = await Promise.all([
          fetchShopCatalog(),
          (async () => {
            const headers = await authHeaders()
            if (!headers) return null
            try {
              const r = await fetch(apiUrl('/api/profile/me'), { headers })
              if (!r.ok) return null
              return (await r.json()) as { profile?: { is_anonymous?: boolean } | null }
            } catch {
              return null
            }
          })(),
        ])
        if (!data) {
          toast.error('Could not load the shop — try again')
          return
        }
        setCatalog(data)
        setIsAnonymous(Boolean(meRes?.profile?.is_anonymous))
      } finally {
        if (!background) setLoading(false)
      }
    },
    [toast]
  )

  // First-focus dedupe: useEffect fires load() on mount AND useFocusEffect
  // fires again on first focus. Skip the first focus tick so mount only
  // fetches the catalog once; subsequent focus events (returning from
  // /browse or a game) still trigger a background refresh.
  const focusPrimedRef = useRef(false)

  useEffect(() => {
    void load()
    trackCoinEvent(COIN_EVENTS.shopViewed, { entry_point: 'nav_click' })
  }, [load])

  // Refresh on focus so a purchase made on web (or a coin earned in a
  // just-played game) shows up when the shop tab comes back to front.
  useFocusEffect(
    useCallback(() => {
      if (!focusPrimedRef.current) {
        focusPrimedRef.current = true
        return
      }
      void load({ background: true })
    }, [load])
  )

  const items = catalog?.items ?? []
  const kindFiltered = filter === 'all' ? items : items.filter((i) => i.kind === filter)
  const visible = ownedOnly ? kindFiltered.filter((i) => i.owned) : kindFiltered
  const availableKinds = useMemo(() => new Set(items.map((i) => i.kind)), [items])
  const ownedCount = useMemo(() => items.filter((i) => i.owned).length, [items])

  const profile = catalog?.profile ?? null
  const balance = profile?.coins ?? 0
  // Guests: no server-side profile row, OR the Supabase session is
  // anonymous. Matches web ShopClient's `!profile || profile.is_anonymous`.
  const isGuest = profile == null || isAnonymous

  const equippedFor = useCallback(
    (item: ShopItem): boolean => {
      if (!profile) return false
      if (item.kind === 'frame') return profile.equipped_frame === item.slug
      if (item.kind === 'name_color') return profile.equipped_name_color === item.slug
      if (item.kind === 'animation') return profile.equipped_animation === item.slug
      if (item.kind === 'card_template') return profile.equipped_card_template === item.slug
      return false
    },
    [profile]
  )

  const equipItem = useCallback(
    async (item: ShopItem) => {
      if (!isEquippable(item.kind)) return
      const { ok, error } = await postEquip(item.kind as EquipSlot, item.slug)
      // Server can 403 "Not owned" when the catalog is stale. Gate the
      // toast + analytics on res.ok so a false-positive doesn't fire —
      // this is the second Phase 3 lesson.
      if (!ok) {
        toast.error(error ?? 'Could not equip — try again')
        await load({ background: true })
        return
      }
      trackCoinEvent(COIN_EVENTS.shopItemEquipped, { item_kind: item.kind, item_slug: item.slug })
      toast.success(`Equipped ${item.name}`)
      await load({ background: true })
    },
    [load, toast]
  )

  const openConfirm = useCallback(
    (item: ShopItem) => {
      if (isGuest) return
      trackCoinEvent(COIN_EVENTS.shopItemViewed, {
        item_kind: item.kind,
        item_slug: item.slug,
        item_price: item.price,
        owned: item.owned,
        interaction: 'open',
      })
      if (item.owned && isEquippable(item.kind) && !equippedFor(item)) {
        void equipItem(item)
        return
      }
      if (item.owned) return
      setPending(item)
      trackCoinEvent(COIN_EVENTS.shopItemPurchaseStarted, {
        item_kind: item.kind,
        item_slug: item.slug,
        item_price: item.price,
        balance_before: balance,
      })
    },
    [balance, equipItem, equippedFor, isGuest]
  )

  const confirmPurchase = useCallback(async () => {
    if (!pending || busy) return
    const item = pending
    setBusy(true)
    try {
      const { ok, data } = await postPurchase(item.kind, item.slug)
      // Outcome-first routing — see the header comment (Phase 3 lesson #2).
      // 402 makes res.ok=false for a clean insufficient_funds; reading
      // res.ok first would mis-toast "Purchase failed".
      if (data.outcome === 'insufficient_funds') {
        trackCoinEvent(COIN_EVENTS.shopItemPurchaseFailed, {
          item_kind: item.kind,
          item_slug: item.slug,
          item_price: item.price,
          reason: 'insufficient_funds',
        })
        const needed = item.price - balance
        toast.error(`Not enough coins — ${needed} more needed.`)
      } else if (data.outcome === 'already_owned') {
        trackCoinEvent(COIN_EVENTS.shopItemPurchaseFailed, {
          item_kind: item.kind,
          item_slug: item.slug,
          item_price: item.price,
          reason: 'already_owned',
        })
        toast.error('Already owned.')
      } else if (!ok || !data.outcome || data.outcome === 'server_error') {
        trackCoinEvent(COIN_EVENTS.shopItemPurchaseFailed, {
          item_kind: item.kind,
          item_slug: item.slug,
          item_price: item.price,
          reason: 'server_error',
        })
        toast.error(data.error ?? 'Purchase failed — try again')
      } else {
        trackCoinEvent(COIN_EVENTS.shopItemPurchased, {
          item_kind: item.kind,
          item_slug: item.slug,
          item_price: item.price,
          balance_after: data.new_balance ?? 0,
        })
        toast.success(`Purchased ${item.name}.`)
        // Empty-lines coins-awarded is the reserved "purchase happened"
        // signal — CoinChip + any mounted ownership hook refetch on it.
        // Never emit non-empty lines here (would double-fire coins_earned).
        emitCoinsAwarded({ lines: [], total: 0 })
      }
      // Only close the dialog once the server has actually answered —
      // any outcome the RPC returned (ok / insufficient / already_owned /
      // server_error) is a definitive answer worth clearing on. A network
      // exception below leaves `pending` set so the user can retry the
      // same purchase in place (matches web ShopClient — it only clears
      // pending inside the try block, not in finally).
      setPending(null)
      await load({ background: true })
    } catch {
      trackCoinEvent(COIN_EVENTS.shopItemPurchaseFailed, {
        item_kind: item.kind,
        item_slug: item.slug,
        item_price: item.price,
        reason: 'network_error',
      })
      toast.error('Network error — try again')
    } finally {
      setBusy(false)
    }
  }, [balance, busy, load, pending, toast])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          style={styles.backBtn}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.pageTitle}>Shop</Text>
        {/* Spacer so title stays visually centered against the back chevron. */}
        <View style={styles.topBarSpacer} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : isGuest ? (
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.card}>
            <Text style={styles.body}>
              Save your profile to earn coins and unlock cosmetics that follow you across every game.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
              onPress={() => router.push('/profile')}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>Get started</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.balanceRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>Your balance</Text>
              <Text style={styles.balanceValue}>🪙 {balance.toLocaleString()}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
              onPress={() => router.push('/profile?tab=coins' as never)}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryBtnText}>View history</Text>
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <FilterChip active={filter === 'all'} onPress={() => setFilter('all')}>
              All
            </FilterChip>
            {CATEGORIES.filter((c) => availableKinds.has(c.key)).map((c) => (
              <FilterChip key={c.key} active={filter === c.key} onPress={() => setFilter(c.key)}>
                {c.label}
              </FilterChip>
            ))}
            {ownedCount > 0 ? (
              <FilterChip active={ownedOnly} onPress={() => setOwnedOnly((v) => !v)}>
                {`Owned (${ownedCount})`}
              </FilterChip>
            ) : null}
          </ScrollView>

          {visible.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.bodyMuted}>Nothing in this category yet — check back after the next drop.</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {visible.map((item) => (
                <ShopTile
                  key={`${item.kind}:${item.slug}`}
                  item={item}
                  equipped={equippedFor(item)}
                  onPress={() => openConfirm(item)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <PurchaseConfirmDialog
        item={pending}
        balance={balance}
        busy={busy}
        onCancel={() => !busy && setPending(null)}
        onConfirm={() => void confirmPurchase()}
        onOpenBrowse={() => {
          if (!busy) setPending(null)
          router.push('/browse')
        }}
      />
    </SafeAreaView>
  )
}

function FilterChip({
  active,
  onPress,
  children,
}: {
  active: boolean
  onPress: () => void
  children: React.ReactNode
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{children}</Text>
    </Pressable>
  )
}

function ShopTile({ item, equipped, onPress }: { item: ShopItem; equipped: boolean; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles)
  const owned = item.owned || equipped
  const seasonal = (item.preview as { seasonal?: boolean } | undefined)?.seasonal === true
  const dimmed = owned && !isEquippable(item.kind)
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, dimmed && styles.tileDimmed, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.price} coins${owned ? ' (owned)' : ''}`}
    >
      <View style={styles.tileHeader}>
        <View style={styles.tileHeaderText}>
          <Text style={styles.tileTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.tileKind}>
            {labelForKind(item.kind)}
            {item.gameType ? ` · ${item.gameType}` : ''}
          </Text>
        </View>
        <View style={styles.tileBadgeStack}>
          {seasonal ? (
            <View style={styles.seasonalBadge}>
              <Text style={styles.seasonalBadgeText}>Seasonal</Text>
            </View>
          ) : null}
          {owned ? (
            <View style={styles.ownedBadge}>
              <Text style={styles.ownedBadgeText}>{equipped ? 'Equipped' : 'Owned'}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <TilePreview item={item} />

      <View style={styles.tileFooter}>
        <Text style={styles.tilePrice}>🪙 {item.price.toLocaleString()}</Text>
        {!owned ? <Text style={styles.tileAction}>Buy</Text> : null}
        {owned && isEquippable(item.kind) && !equipped ? <Text style={styles.tileAction}>Equip</Text> : null}
      </View>
    </Pressable>
  )
}

function TilePreview({ item }: { item: ShopItem }) {
  const styles = useThemedStyles(makeStyles)
  const { scheme } = useThemeMode()
  if (item.kind === 'frame') {
    const frame = findFrame(item.slug)
    const color = frame?.ring.color ?? '#888'
    return (
      <View style={styles.previewWrap}>
        <View style={[styles.frameRing, { borderColor: color }]}>
          <View style={styles.frameInner}>
            <Text style={styles.frameInitial}>P</Text>
          </View>
        </View>
      </View>
    )
  }
  if (item.kind === 'name_color') {
    const spec = findNameColor(item.slug)
    const color = scheme === 'dark' ? spec?.dark : spec?.light
    return (
      <View style={styles.previewWrap}>
        <Text style={[styles.namePreview, color ? { color } : null]}>Player</Text>
      </View>
    )
  }
  if (item.kind === 'animation') {
    const anim = findAnimation(item.slug)
    return (
      <View style={styles.animPreview}>
        <Text style={styles.previewLabel}>{anim?.name ?? 'Preview'}</Text>
      </View>
    )
  }
  if (item.kind === 'card_template') {
    const tpl = findCardTemplate(item.slug)
    return (
      <View style={styles.cardPreview}>
        <Text style={styles.previewLabel}>{tpl?.name ?? 'Results card'}</Text>
      </View>
    )
  }
  return null
}

function PurchaseConfirmDialog({
  item,
  balance,
  busy,
  onCancel,
  onConfirm,
  onOpenBrowse,
}: {
  item: ShopItem | null
  balance: number
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
  onOpenBrowse: () => void
}) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const visible = item !== null
  const price = item?.price ?? 0
  const balanceAfter = balance - price
  const insufficient = balanceAfter < 0

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onCancel}>
        <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
          {item ? (
            <>
              <Text style={styles.dialogTitle}>Confirm purchase</Text>
              <Text style={styles.bodyMuted}>
                {item.name} · 🪙 {price.toLocaleString()}
              </Text>

              <View style={styles.balanceBox}>
                <View style={styles.balanceLine}>
                  <Text style={styles.balanceLabel}>Balance</Text>
                  <Text style={styles.balanceAmount}>🪙 {balance.toLocaleString()}</Text>
                </View>
                <View style={styles.balanceLine}>
                  <Text style={styles.balanceLabel}>After</Text>
                  <Text style={[styles.balanceAmount, insufficient && styles.balanceInsufficient]}>
                    🪙 {balanceAfter.toLocaleString()}
                  </Text>
                </View>
              </View>

              {item.kind === 'streak_freeze' ? (
                <Text style={styles.bodyMuted}>One-shot. Consumed the next time you miss a daily challenge.</Text>
              ) : null}

              {insufficient ? (
                <Text style={styles.insufficient}>
                  {`Not enough coins — ${price - balance} more needed. `}
                  <Text style={styles.link} onPress={onOpenBrowse}>
                    Play a game to earn more
                  </Text>
                  {'.'}
                </Text>
              ) : null}

              <View style={styles.dialogActions}>
                <Pressable
                  style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed, busy && styles.disabled]}
                  onPress={onCancel}
                  disabled={busy}
                >
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && styles.pressed,
                    (busy || insufficient) && styles.disabled,
                  ]}
                  onPress={onConfirm}
                  disabled={busy || insufficient}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Buy</Text>}
                </Pressable>
              </View>
            </>
          ) : null}
        </Pressable>
      </Pressable>
      {/* Referenced only so `theme` is not unused when the dialog is closed. */}
      {theme.primary ? null : null}
    </Modal>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space.md,
      paddingVertical: theme.space.sm,
    },
    topBarSpacer: { width: 44 },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    backGlyph: { color: theme.text, fontSize: 28, fontWeight: '400' },
    pageTitle: {
      color: theme.text,
      fontSize: theme.type.section.size,
      fontWeight: theme.type.section.weight,
    },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    container: {
      padding: theme.space.md,
      gap: theme.space.md,
      paddingBottom: theme.space.xl,
      ...centeredContent,
    },
    balanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.md,
      backgroundColor: theme.bgElevated,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      padding: theme.space.md,
    },
    eyebrow: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    balanceValue: {
      color: theme.text,
      fontSize: 26,
      fontWeight: '900',
      marginTop: 2,
      fontVariant: ['tabular-nums'],
    },
    chipRow: {
      gap: 6,
      paddingVertical: 2,
      paddingRight: theme.space.md,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    chipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    chipText: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
    chipTextActive: { color: '#fff' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
    tile: {
      flexBasis: '48%',
      flexGrow: 1,
      minWidth: 160,
      backgroundColor: theme.bgElevated,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      padding: theme.space.md,
      gap: theme.space.sm,
    },
    tileDimmed: { opacity: 0.7 },
    tileHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.space.xs },
    tileHeaderText: { flex: 1, minWidth: 0 },
    tileTitle: { color: theme.text, fontSize: 14, fontWeight: '800' },
    tileKind: {
      color: theme.textFaint,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: 2,
    },
    tileBadgeStack: { alignItems: 'flex-end', gap: 4 },
    seasonalBadge: {
      borderWidth: 1,
      borderColor: 'rgba(200,16,46,0.6)',
      backgroundColor: 'rgba(200,16,46,0.1)',
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    seasonalBadgeText: {
      color: '#C8102E',
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    ownedBadge: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    ownedBadgeText: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    tileFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    tilePrice: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    tileAction: { color: theme.primary, fontSize: 12, fontWeight: '800' },
    previewWrap: { alignItems: 'center', paddingVertical: theme.space.xs },
    frameRing: {
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 3,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
    },
    frameInner: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: theme.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    frameInitial: { color: theme.primaryMuted, fontSize: 16, fontWeight: '800' },
    namePreview: { fontSize: 20, fontWeight: '900' },
    animPreview: {
      height: 56,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardPreview: {
      height: 56,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      backgroundColor: theme.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewLabel: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
    card: {
      backgroundColor: theme.bgElevated,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      padding: theme.space.md,
      gap: theme.space.sm,
    },
    body: { color: theme.text, fontSize: 15, lineHeight: 22 },
    bodyMuted: { color: theme.textMuted, fontSize: 13, lineHeight: 19 },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.space.md,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 88,
    },
    primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
    secondaryBtn: {
      backgroundColor: theme.surface,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: theme.space.md,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 88,
    },
    secondaryBtnText: { color: theme.text, fontSize: 14, fontWeight: '700' },
    pressed: { opacity: 0.7 },
    disabled: { opacity: 0.5 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: theme.space.lg,
    },
    dialog: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: theme.bgElevated,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.border,
      padding: theme.space.lg,
      gap: theme.space.sm,
    },
    dialogTitle: { color: theme.text, fontSize: 20, fontWeight: '900' },
    balanceBox: {
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      padding: theme.space.sm,
      gap: 4,
    },
    balanceLine: { flexDirection: 'row', justifyContent: 'space-between' },
    balanceLabel: { color: theme.textMuted, fontSize: 14 },
    balanceAmount: { color: theme.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
    balanceInsufficient: { color: theme.error },
    insufficient: { color: theme.error, fontSize: 13, lineHeight: 19 },
    link: { color: theme.primary, textDecorationLine: 'underline', fontWeight: '700' },
    dialogActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.space.sm,
      marginTop: theme.space.sm,
    },
  })
