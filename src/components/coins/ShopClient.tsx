'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { authHeaders } from '@/lib/identity'
import { trackEvent, GA_EVENTS } from '@/lib/analytics'
import { useProfile } from '@/hooks/useProfile'
import { emitCoinsAwarded } from '@/lib/coins/earn-events'
import type { CoinAwardWire } from '@/lib/coins/earn-events'
import { findAnimation, findCardTemplate, type ShopKind } from '@/lib/coins/shop-catalog'
import { Avatar } from '@/components/Avatar'
import { PlayerName } from '@/components/PlayerName'
import { Skeleton } from '@/components/Skeleton'

type ShopItem = {
  kind: ShopKind
  slug: string
  name: string
  price: number
  owned: boolean
  gameType?: string
  preview?: Record<string, unknown>
}

type Catalog = {
  items: ShopItem[]
  profile: {
    coins: number
    equipped_frame: string | null
    equipped_name_color: string | null
    equipped_animation: string | null
    equipped_card_template: string | null
    streak_freezes: number
  } | null
}

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

export function ShopClient() {
  const { profile, refresh } = useProfile()
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ShopKind | 'all'>('all')
  const [pending, setPending] = useState<ShopItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async (opts?: { background?: boolean }) => {
    // Foreground load flips loading=true so the first-render Skeleton
    // shows. A background refresh (called after a purchase / equip) keeps
    // the current grid visible — otherwise the just-set success toast is
    // hidden behind the Skeleton until the fetch settles (reviewer round
    // 4 finding #3). Toast lives outside the loading gate too, below.
    const background = opts?.background === true
    if (!background) setLoading(true)
    try {
      const headers = (await authHeaders()) ?? {}
      const res = await fetch('/api/shop/catalog', { headers })
      if (!res.ok) {
        setToast('Could not load the shop — try again')
        return
      }
      const data = (await res.json()) as Catalog
      setCatalog(data)
    } catch {
      setToast('Could not load the shop — try again')
    } finally {
      if (!background) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    trackEvent(GA_EVENTS.shopViewed, { entry_point: 'nav_click' })
  }, [load])

  const items = catalog?.items ?? []
  const visible = filter === 'all' ? items : items.filter((i) => i.kind === filter)
  const availableKinds = useMemo(() => new Set(items.map((i) => i.kind)), [items])

  const balance = catalog?.profile?.coins ?? Number(profile?.coins ?? 0)
  const isGuest = !profile || profile.is_anonymous

  const equippedFor = useCallback(
    (item: ShopItem): boolean => {
      const p = catalog?.profile
      if (!p) return false
      if (item.kind === 'frame') return p.equipped_frame === item.slug
      if (item.kind === 'name_color') return p.equipped_name_color === item.slug
      if (item.kind === 'animation') return p.equipped_animation === item.slug
      if (item.kind === 'card_template') return p.equipped_card_template === item.slug
      return false
    },
    [catalog?.profile]
  )

  const canEquip = (kind: ShopKind) =>
    kind === 'frame' || kind === 'name_color' || kind === 'animation' || kind === 'card_template'

  const openConfirm = (item: ShopItem) => {
    if (isGuest) return
    trackEvent(GA_EVENTS.shopItemViewed, {
      item_kind: item.kind,
      item_slug: item.slug,
      item_price: item.price,
      owned: item.owned,
      interaction: 'open',
    })
    if (item.owned && canEquip(item.kind) && !equippedFor(item)) {
      void equipItem(item)
      return
    }
    if (item.owned) return
    setPending(item)
    trackEvent(GA_EVENTS.shopItemPurchaseStarted, {
      item_kind: item.kind,
      item_slug: item.slug,
      item_price: item.price,
      balance_before: balance,
    })
  }

  const equipItem = async (item: ShopItem) => {
    if (!canEquip(item.kind)) return
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch('/api/shop/equip', {
        method: 'POST',
        headers,
        body: JSON.stringify({ slot: item.kind, slug: item.slug }),
      })
      // Server can 403 "Not owned" when the catalog is stale (grandfathered
      // demo profile, retired item, an item whose owned-row was cleaned).
      // Reviewer flagged that firing shopItemEquipped + toasting "Equipped"
      // in that case is a false-positive both on-screen and in analytics —
      // gate both on res.ok.
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setToast(data.error ?? 'Could not equip — try again')
        await load({ background: true })
        return
      }
      trackEvent(GA_EVENTS.shopItemEquipped, { item_kind: item.kind, item_slug: item.slug })
      setToast(`Equipped ${item.name}`)
      await load({ background: true })
      refresh()
    } catch {
      setToast('Could not equip — try again')
    }
  }

  const confirmPurchase = async () => {
    if (!pending || busy) return
    setBusy(true)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch('/api/shop/purchase', {
        method: 'POST',
        headers,
        // Price deliberately NOT sent — the server resolves it from its own
        // catalog. Kept as the tile's display price only.
        body: JSON.stringify({ kind: pending.kind, slug: pending.slug }),
      })
      const data = (await res.json().catch(() => ({}))) as { outcome?: string; new_balance?: number; error?: string }

      // Outcome-first routing. The prior version checked `!res.ok` first,
      // but the 402 fix (round 1, finding #6) made res.ok=false for a
      // clean insufficient_funds — the check then fell into the
      // server_error branch and mis-toasted "Purchase failed" instead of
      // "Not enough coins — X more needed". Read the RPC envelope first;
      // only fall through to server_error if there IS no envelope outcome.
      if (data.outcome === 'insufficient_funds') {
        trackEvent(GA_EVENTS.shopItemPurchaseFailed, {
          item_kind: pending.kind,
          item_slug: pending.slug,
          item_price: pending.price,
          reason: 'insufficient_funds',
        })
        const needed = pending.price - balance
        setToast(`Not enough coins — ${needed} more needed.`)
      } else if (data.outcome === 'already_owned') {
        trackEvent(GA_EVENTS.shopItemPurchaseFailed, {
          item_kind: pending.kind,
          item_slug: pending.slug,
          item_price: pending.price,
          reason: 'already_owned',
        })
        setToast('Already owned.')
      } else if (!res.ok || !data.outcome || data.outcome === 'server_error') {
        trackEvent(GA_EVENTS.shopItemPurchaseFailed, {
          item_kind: pending.kind,
          item_slug: pending.slug,
          item_price: pending.price,
          reason: 'server_error',
        })
        setToast(data.error ?? 'Purchase failed — try again')
      } else {
        trackEvent(GA_EVENTS.shopItemPurchased, {
          item_kind: pending.kind,
          item_slug: pending.slug,
          item_price: pending.price,
          balance_after: data.new_balance ?? 0,
        })
        setToast(`Purchased ${pending.name}.`)
        // Refresh header/chip via the shared earn-event emitter (which
        // CoinChip listens to for its pulse animation and refetch). Empty
        // lines so no `coins_earned` line-event double-fires alongside
        // `shop_item_purchased`.
        emitCoinsAwarded({ lines: [], total: 0 } satisfies CoinAwardWire)
      }
      setPending(null)
      await load({ background: true })
      refresh()
    } catch {
      trackEvent(GA_EVENTS.shopItemPurchaseFailed, {
        item_kind: pending.kind,
        item_slug: pending.slug,
        item_price: pending.price,
        reason: 'network_error',
      })
      setToast('Network error — try again')
    } finally {
      setBusy(false)
    }
  }

  // Toast belongs OUTSIDE the loading / guest early-returns so a message
  // set right before an early-return branch still surfaces (reviewer
  // round 4 finding #3 — a success toast set before a background reload
  // would flash then vanish behind the skeleton).
  if (loading) {
    return (
      <>
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </div>
        {toast && <Toast text={toast} onClose={() => setToast(null)} />}
      </>
    )
  }

  if (isGuest) {
    return (
      <>
        <div className="glass-card p-5">
          <p className="text-body">
            Save your profile to earn coins and unlock cosmetics that follow you across every game.
          </p>
          <div className="mt-4">
            <Link href="/profile" className="btn-primary btn-fit px-4 py-2 text-sm">
              Get started
            </Link>
          </div>
        </div>
        {toast && <Toast text={toast} onClose={() => setToast(null)} />}
      </>
    )
  }

  return (
    <>
      <div className="glass-card-strong flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">Your balance</p>
          <p className="text-2xl font-black tabular-nums text-body">
            <span aria-hidden>🪙 </span>
            {balance.toLocaleString()}
          </p>
        </div>
        <Link href="/profile?tab=coins" prefetch={false} className="fr-btn--nav">
          View history
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          All
        </FilterChip>
        {CATEGORIES.filter((c) => availableKinds.has(c.key)).map((c) => (
          <FilterChip key={c.key} active={filter === c.key} onClick={() => setFilter(c.key)}>
            {c.label}
          </FilterChip>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="glass-card p-5 text-sm text-muted">
          Nothing in this category yet — check back after the next drop.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <ShopTile
              key={`${item.kind}:${item.slug}`}
              item={item}
              equipped={equippedFor(item)}
              onClick={() => openConfirm(item)}
              handle={profile?.handle ?? 'Player'}
              photoUrl={profile?.avatar_url ?? null}
            />
          ))}
        </div>
      )}

      {pending && (
        <ConfirmDialog
          item={pending}
          balance={balance}
          busy={busy}
          onCancel={() => !busy && setPending(null)}
          onConfirm={confirmPurchase}
        />
      )}
      {toast && <Toast text={toast} onClose={() => setToast(null)} />}
    </>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-white'
          : 'rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-muted hover:text-[var(--foreground)]'
      }
    >
      {children}
    </button>
  )
}

function ShopTile({
  item,
  equipped,
  onClick,
  handle,
  photoUrl,
}: {
  item: ShopItem
  equipped: boolean
  onClick: () => void
  handle: string
  photoUrl: string | null
}) {
  const owned = item.owned || equipped
  const dimmed = owned && !isEquippable(item.kind)
  return (
    <button
      type="button"
      onClick={onClick}
      className={`glass-card-interactive text-left p-4 space-y-3 ${dimmed ? 'opacity-70' : ''}`}
      aria-label={`${item.name}, ${item.price} coins${owned ? ' (owned)' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-body truncate">{item.name}</p>
          <p className="text-faint text-[10px] uppercase tracking-wide mt-0.5">
            {CATEGORIES.find((c) => c.key === item.kind)?.label ?? item.kind}
            {item.gameType ? ` · ${item.gameType}` : ''}
          </p>
        </div>
        {owned && (
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {equipped ? 'Equipped' : 'Owned'}
          </span>
        )}
      </div>

      <TilePreview item={item} handle={handle} photoUrl={photoUrl} />

      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-body">
          <span aria-hidden>🪙 </span>
          {item.price.toLocaleString()}
        </span>
        {!owned && <span className="text-[var(--primary)] text-xs font-semibold">Buy</span>}
        {owned && isEquippable(item.kind) && !equipped && (
          <span className="text-[var(--primary)] text-xs font-semibold">Equip</span>
        )}
      </div>
    </button>
  )
}

function isEquippable(kind: ShopKind): boolean {
  return kind === 'frame' || kind === 'name_color' || kind === 'animation' || kind === 'card_template'
}

function TilePreview({ item, handle, photoUrl }: { item: ShopItem; handle: string; photoUrl: string | null }) {
  if (item.kind === 'frame') {
    return (
      <div className="flex justify-center py-2">
        <Avatar name={handle} photoUrl={photoUrl} size="lg" frameSlug={item.slug} />
      </div>
    )
  }
  if (item.kind === 'name_color') {
    return (
      <div className="flex justify-center py-2">
        <PlayerName name={handle} colorSlug={item.slug} className="text-xl font-black" />
      </div>
    )
  }
  if (item.kind === 'animation') {
    const anim = findAnimation(item.slug)
    return (
      <div
        className={`relative h-16 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-inset-bg)] ${anim?.cssClass ?? ''}`}
      >
        <span className="absolute inset-0 flex items-center justify-center text-xs text-muted">Preview</span>
      </div>
    )
  }
  if (item.kind === 'card_template') {
    const tpl = findCardTemplate(item.slug)
    return (
      <div
        className={`h-16 rounded-lg border border-[var(--border)] ${tpl?.cssClass ?? ''} flex items-center justify-center`}
      >
        <span className="text-xs">Results card</span>
      </div>
    )
  }
  return null
}

function ConfirmDialog({
  item,
  balance,
  busy,
  onCancel,
  onConfirm,
}: {
  item: ShopItem
  balance: number
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const balanceAfter = balance - item.price
  const insufficient = balanceAfter < 0
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="glass-card-strong w-full max-w-sm space-y-4 p-5">
        <div>
          <h2 className="text-xl font-black text-body">Confirm purchase</h2>
          <p className="mt-1 text-sm text-muted">
            {item.name} · <span className="tabular-nums">🪙 {item.price.toLocaleString()}</span>
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] p-3 text-sm">
          <div className="flex justify-between">
            <span>Balance</span>
            <span className="tabular-nums">🪙 {balance.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>After</span>
            <span className={`tabular-nums ${insufficient ? 'text-red-500' : ''}`}>
              🪙 {balanceAfter.toLocaleString()}
            </span>
          </div>
        </div>
        {item.kind === 'streak_freeze' && (
          <p className="text-xs text-muted">One-shot. Consumed the next time you miss a daily challenge.</p>
        )}
        {insufficient && <p className="text-red-500 text-sm">Not enough coins — {item.price - balance} more needed.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="fr-btn--nav">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || insufficient}
            className="btn-primary btn-fit px-4 py-2 text-sm disabled:opacity-50"
          >
            {busy ? 'Buying…' : 'Buy'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Toast({ text, onClose }: { text: string; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 3500)
    return () => window.clearTimeout(t)
  }, [onClose])
  return (
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pointer-events-none">
      <div className="glass-card-strong pointer-events-auto max-w-sm px-4 py-3 text-sm text-body">{text}</div>
    </div>
  )
}
