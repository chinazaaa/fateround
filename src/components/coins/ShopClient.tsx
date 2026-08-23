'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { authHeaders } from '@/lib/identity'
import { trackEvent, GA_EVENTS } from '@/lib/analytics'
import { useProfile } from '@/hooks/useProfile'
import { emitCoinsAwarded } from '@/lib/coins/earn-events'
import type { CoinAwardWire } from '@/lib/coins/earn-events'
import { findAnimation, findCardTemplate, type ShopKind } from '@/lib/coins/shop-catalog'
import { Avatar } from '@/components/Avatar'
import { PlayerName } from '@/components/PlayerName'
import { Skeleton } from '@/components/Skeleton'
import { THEMES, type ThemeConfig } from '@/lib/themes'
import { ThemePreviewModal } from '@/components/ThemePreviewModal'
import { MONOPOLY_EDITION_TO_THEME } from '@/lib/coins/editions'

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

const VALID_KINDS = new Set<ShopKind>(CATEGORIES.map((c) => c.key))

export function ShopClient() {
  const { profile, refresh } = useProfile()
  const searchParams = useSearchParams()
  // Deep-link filter: /shop?category=edition (Monopoly USA/Christmas locked
  // tiles) or /shop?category=theme (Whot/Ludo/Sudoku per-game reskins). Any
  // other value is ignored — falls back to "All" so a stale link never
  // strands the shop on an empty category.
  const initialCategory = ((): ShopKind | 'all' => {
    const raw = searchParams?.get('category')
    if (raw && VALID_KINDS.has(raw as ShopKind)) return raw as ShopKind
    return 'all'
  })()
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ShopKind | 'all'>(initialCategory)
  const [previewItem, setPreviewItem] = useState<ShopItem | null>(null)
  // Independent from category — a player scanning "what have I bought?" wants
  // a quick answer without scrolling every category. `owned` cross-cuts the
  // kind filter, so both apply together.
  const [ownedOnly, setOwnedOnly] = useState(false)
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
  const kindFiltered = filter === 'all' ? items : items.filter((i) => i.kind === filter)
  const visible = ownedOnly ? kindFiltered.filter((i) => i.owned) : kindFiltered
  const availableKinds = useMemo(() => new Set(items.map((i) => i.kind)), [items])
  const ownedCount = useMemo(() => items.filter((i) => i.owned).length, [items])

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
        {ownedCount > 0 && (
          <FilterChip active={ownedOnly} onClick={() => setOwnedOnly((v) => !v)}>
            Owned ({ownedCount})
          </FilterChip>
        )}
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
              onPreview={
                item.kind === 'animation' ||
                item.kind === 'card_template' ||
                ((item.kind === 'theme' || item.kind === 'edition') && themeConfigForItem(item) !== null)
                  ? () => setPreviewItem(item)
                  : undefined
              }
              stackedOwnedCount={item.kind === 'streak_freeze' ? (catalog?.profile?.streak_freezes ?? 0) : null}
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
      {previewItem &&
        (previewItem.kind === 'theme' || previewItem.kind === 'edition' ? (
          <ThemePreviewModal
            open
            theme={themeConfigForItem(previewItem)}
            onClose={() => setPreviewItem(null)}
            gameType={previewItem.gameType}
          />
        ) : (
          <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
        ))}
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
  onPreview,
  stackedOwnedCount,
  handle,
  photoUrl,
}: {
  item: ShopItem
  equipped: boolean
  onClick: () => void
  /** Optional preview handler — set for animation / card_template kinds so
   *  the tile shows a "Preview" button that opens PreviewModal instead of
   *  the buy/equip flow. */
  onPreview?: () => void
  /** Set for stackable consumables (streak_freeze) so the tile can render
   *  the current owned count — a one-shot doesn't have an equipped state
   *  to signal "you have this", so this is the only place a buyer sees
   *  their stockpile before it's spent. `null` means "not stackable". */
  stackedOwnedCount?: number | null
  handle: string
  photoUrl: string | null
}) {
  const owned = item.owned || equipped
  const dimmed = owned && !isEquippable(item.kind)
  const primaryLabel = !owned ? 'Buy' : isEquippable(item.kind) && !equipped ? 'Equip' : null
  return (
    // Outer is a div — a nested Preview button (below) would be invalid
    // HTML inside a <button>. We keep keyboard + a11y equivalence with
    // role=button / tabIndex / Enter+Space handling.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={`glass-card-interactive text-left p-4 space-y-3 cursor-pointer ${dimmed ? 'opacity-70' : ''}`}
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
        <div className="flex flex-col items-end gap-1">
          {/* Seasonal badge (Phase 5 — Christmas edition through mid-January). The
              catalog route surfaces content.seasonal on the item.preview payload;
              anything with that flag gets the badge. Sits above the owned pill
              so a seasonal edition that's already owned still shows both. */}
          {(item.preview as { seasonal?: boolean } | undefined)?.seasonal && (
            <span className="rounded-full border border-[#C8102E]/60 bg-[#C8102E]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#C8102E]">
              Seasonal
            </span>
          )}
          {typeof stackedOwnedCount === 'number' && stackedOwnedCount > 0 ? (
            // Stackable consumable — show the current count instead of an
            // "Owned" pill (which reads as "you have this, hide the buy CTA"
            // and would confuse re-buying another freeze).
            <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              You own {stackedOwnedCount}
            </span>
          ) : (
            owned && (
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {equipped ? 'Equipped' : 'Owned'}
              </span>
            )
          )}
        </div>
      </div>

      <TilePreview item={item} handle={handle} photoUrl={photoUrl} />

      {tileHint(item.kind) && (
        <p className="text-[11px] text-faint leading-snug">{tileHint(item.kind)}</p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-body">
          <span aria-hidden>🪙 </span>
          {item.price.toLocaleString()}
        </span>
        <div className="flex items-center gap-3">
          {onPreview && (
            <button
              type="button"
              onClick={(e) => {
                // Preview must NOT bubble to the outer buy/equip handler,
                // otherwise tapping Preview would open the purchase modal
                // (the bug this whole prop exists to fix).
                e.stopPropagation()
                onPreview()
              }}
              className="text-xs font-semibold text-muted underline-offset-2 hover:text-body hover:underline"
              aria-label={`Preview ${item.name}`}
            >
              Preview
            </button>
          )}
          {primaryLabel && <span className="text-[var(--primary)] text-xs font-semibold">{primaryLabel}</span>}
        </div>
      </div>
    </div>
  )
}

function isEquippable(kind: ShopKind): boolean {
  return kind === 'frame' || kind === 'name_color' || kind === 'animation' || kind === 'card_template'
}

/** Short one-line hint that tells the buyer WHERE the cosmetic shows up so
 *  they know what they're getting. Not every kind needs one — themes /
 *  editions are self-explanatory ("this is the board"), and streak_freeze /
 *  library_pack are gameplay items, not visual reskins. */
function tileHint(kind: ShopKind): string | null {
  switch (kind) {
    case 'frame':
      return 'Shown around your avatar in every lobby, game, and leaderboard.'
    case 'name_color':
      return 'Colors your name wherever it appears to other players.'
    case 'animation':
      return 'Plays for everyone in the room when you win a round.'
    case 'card_template':
      return 'Styles the results card you share after a game ends.'
    case 'streak_freeze':
      return 'Automatically covers a missed day so your streak stays alive — nothing to activate.'
    default:
      return null
  }
}

/** Resolve a shop item slug to a ThemeConfig for preview purposes. Themes
 *  map by slug directly; Monopoly editions map through
 *  MONOPOLY_EDITION_TO_THEME to their painted board id. Returns null if the
 *  slug doesn't correspond to a THEMES entry (which case there's nothing
 *  to preview visually — the buy tile still stands). */
function themeConfigForItem(item: ShopItem): ThemeConfig | null {
  const targetId = item.kind === 'edition' ? MONOPOLY_EDITION_TO_THEME[item.slug] : item.slug
  if (!targetId) return null
  return THEMES.find((t) => t.id === targetId) ?? null
}

function TilePreview({ item, handle, photoUrl }: { item: ShopItem; handle: string; photoUrl: string | null }) {
  if (item.kind === 'theme' || item.kind === 'edition') {
    const theme = themeConfigForItem(item)
    if (!theme) return null
    // Three-swatch strip matching ThemePreviewCard on the create page —
    // gives shop viewers the same at-a-glance palette hint the picker
    // shows, without needing to open the full ThemePreviewModal first.
    return (
      <div className="flex h-16 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-inset-bg)]">
        {[theme.preview.bg, theme.preview.accent, theme.preview.text].map((color, i) => (
          <span
            key={i}
            className="h-8 w-8 rounded-full border border-black/10 shadow-inner"
            style={{ background: color }}
            aria-hidden
          />
        ))}
      </div>
    )
  }
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
    // Do NOT apply the animation cssClass here — these are one-shot CSS
    // keyframes that burn through on first paint. Worse, some effects
    // (Fireworks) set `background: transparent` mid-keyframe and, with
    // `animation-fill-mode: forwards`, that transparent bg sticks —
    // clobbering the tile's own bg-[var(--surface-inset-bg)] and leaving
    // the tile visibly empty (user report, 2026-08-23). The real
    // animation plays inside PreviewModal instead, on a fresh mount each
    // Replay click via a bumped React key.
    return (
      <div
        className="relative flex h-16 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-inset-bg)]"
      >
        <span aria-hidden className="text-2xl opacity-70">
          ✨
        </span>
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

/**
 * Full-screen preview for winner animations and results-card templates —
 * the "Preview" button on the shop tile opens this so tapping to preview
 * no longer opens the purchase confirm dialog. Animations re-play on a
 * Replay button (a bumped React `key` restarts the one-shot CSS keyframes);
 * card templates render a bigger sample with the actual results copy so
 * hosts can see what the shared card will look like.
 */
function PreviewModal({ item, onClose }: { item: ShopItem; onClose: () => void }) {
  const [replayKey, setReplayKey] = useState(0)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const anim = item.kind === 'animation' ? findAnimation(item.slug) : null
  const tpl = item.kind === 'card_template' ? findCardTemplate(item.slug) : null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.name} preview`}
      onClick={onClose}
    >
      <div
        className="glass-card-strong w-full max-w-md space-y-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
              {CATEGORIES.find((c) => c.key === item.kind)?.label ?? item.kind} preview
            </p>
            <h2 className="text-xl font-black text-body">{item.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="text-2xl leading-none text-muted hover:text-body"
          >
            ×
          </button>
        </div>

        {anim && (
          <div
            key={replayKey}
            className={`relative h-64 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)] ${anim.cssClass}`}
            aria-hidden
          />
        )}
        {tpl && (
          <div className={`rounded-xl border border-[var(--border)] p-6 ${tpl.cssClass}`}>
            <p className="gradient-title text-xs font-bold uppercase tracking-[0.2em]">Winner</p>
            <p className="mt-1 text-3xl font-black">Sample Player</p>
            <p className="mt-3 text-sm opacity-80">Final score · 2,480</p>
            <p className="mt-4 text-xs opacity-60">Fate Round · Whot · shared to friends</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          {anim && (
            <button
              type="button"
              onClick={() => setReplayKey((n) => n + 1)}
              className="fr-btn--nav text-xs"
            >
              Replay
            </button>
          )}
          <button type="button" onClick={onClose} className="fr-btn--nav text-xs">
            Close
          </button>
        </div>
      </div>
    </div>
  )
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
        {insufficient && (
          <p className="text-red-500 text-sm">
            Not enough coins — {item.price - balance} more needed.{' '}
            <Link href="/browse" className="underline hover:no-underline">
              Play a game to earn more
            </Link>
            .
          </p>
        )}
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
