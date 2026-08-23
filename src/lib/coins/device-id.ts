/**
 * Client-side "device id" for the coin-earning path (`docs/coins-and-shop-plan.md`
 * §"Guest earnings & migration").
 *
 * `guest_pending_grants` is keyed on a text device id. We do NOT reuse the
 * per-notification `notification_subscriber_devices.id` because that requires
 * a push subscription — a lot of guests never grant push, and they should still
 * be able to claim their grants at signup. This is a purely local UUID: cheap,
 * self-managed, and stable per browser/localStorage.
 *
 * Deliberately independent of `identity-local.ts`: that key stores a chosen
 * display name and gets wiped by "Not you? Switch". A device id that reset with
 * the name would forfeit the grants a player earned before switching, which is
 * exactly the friction the guest-migration flow exists to remove.
 */

const KEY = 'fateround_device_id'

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for very old browsers where crypto.randomUUID is missing. The
  // guest-migration cap absorbs any collision slop.
  return `dev_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
}

export function getDeviceId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const existing = localStorage.getItem(KEY)
    if (existing && typeof existing === 'string' && existing.length > 0) return existing
    const fresh = makeId()
    localStorage.setItem(KEY, fresh)
    return fresh
  } catch {
    // Private mode / quota — a missing device id means guest earnings won't
    // survive signup on this browser; still let the game play out.
    return null
  }
}
