'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  ADMIN_DAILY_CAP_COINS,
  ADMIN_NOTE_MIN_LENGTH,
  COIN_ADMIN_CATEGORIES,
  COIN_ADMIN_CATEGORY_LABELS,
  type CoinAdminCategory,
} from '@/lib/coins'

/**
 * Admin: coin adjustment.
 *
 * Lookup a profile by id (from /admin/users, right-click "Copy id"), review
 * the balance and recent ledger, then post a positive or negative adjustment
 * with a required category and note. Guardrails enforced server-side:
 *   • per-admin daily cap (5 000 coins over 24h)
 *   • negative adjustments require category = correction
 *   • min 10-char note
 *
 * Admins CANNOT grant items directly here — only coins. Item ownership is
 * always the outcome of a shop purchase, so the audit trail stays clean
 * and the shop remains the single source of ownership truth.
 */

type LedgerRow = {
  id: string
  delta: number
  balance_after: number
  reason: string
  admin_id: string | null
  admin_category: string | null
  admin_note: string | null
  created_at: string
}

type Profile = { id: string; handle: string | null; coins: number }

const CATEGORY_ORDER: readonly CoinAdminCategory[] = [
  'support_goodwill',
  'bug_reimbursement',
  'promotion',
  'correction',
  'other',
]

function shortDate(value: string): string {
  return new Date(value).toLocaleString()
}

export default function AdminCoinsPage() {
  const [profileId, setProfileId] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [cap, setCap] = useState<number>(ADMIN_DAILY_CAP_COINS)
  // Null means "we couldn't read it" (query error); render as "?" rather
  // than "0" so an admin doesn't think they have their full allowance
  // available.
  const [spentToday, setSpentToday] = useState<number | null>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [delta, setDelta] = useState('')
  const [category, setCategory] = useState<CoinAdminCategory>('support_goodwill')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [flash, setFlash] = useState('')

  // One controller ref that BOTH the debounced-load path and the
  // post-submit reload share. Aborting on any new request (typing, form
  // submit, unmount) cancels whatever's still in flight — otherwise a
  // slower manual reload could land after a fresher debounced fetch and
  // show a stale profile under a new UUID.
  const loadCtl = useRef<AbortController | null>(null)

  const load = useCallback(async (id: string) => {
    loadCtl.current?.abort()
    const ctl = new AbortController()
    loadCtl.current = ctl
    const signal = ctl.signal
    setLoading(true)
    setError('')
    setProfile(null)
    setLedger([])
    try {
      const res = await fetch(`/api/admin/coins?profileId=${encodeURIComponent(id)}`, { signal })
      const json = await res.json().catch(() => ({}))
      if (signal.aborted) return
      if (!res.ok) {
        setError(json.error ?? 'Could not load profile.')
        return
      }
      setProfile(json.profile)
      setLedger(json.ledger ?? [])
      setCap(json.cap ?? ADMIN_DAILY_CAP_COINS)
      setSpentToday(json.spentToday ?? null)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError('Could not load profile.')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!profileId.trim()) return
    const t = setTimeout(() => void load(profileId.trim()), 300)
    return () => {
      clearTimeout(t)
      loadCtl.current?.abort()
    }
  }, [profileId, load])

  const submit = async () => {
    setFlash('')
    setError('')
    const n = Number(delta)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n === 0) {
      setError('Delta must be a non-zero integer.')
      return
    }
    if (note.trim().length < ADMIN_NOTE_MIN_LENGTH) {
      setError(`Note must be at least ${ADMIN_NOTE_MIN_LENGTH} characters.`)
      return
    }
    if (n < 0 && category !== 'correction') {
      setError('Negative adjustments must use "Correction / clawback".')
      return
    }
    setSubmitting(true)
    try {
      let res: Response
      try {
        res = await fetch('/api/admin/coins', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ profileId: profileId.trim(), delta: n, category, note: note.trim() }),
        })
      } catch {
        // Network drop, DNS failure, CORS. Show something so the admin
        // doesn't re-click and accidentally double-post if the first
        // request went through server-side. The RPC's advisory lock +
        // audit trail also protects against that, but the UI should
        // still tell them the outcome is unknown.
        setError('Network error — try again once the connection is back.')
        return
      }
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Adjustment failed.')
        return
      }
      setFlash(
        `Adjusted by ${n > 0 ? '+' : ''}${n} — new balance ${json.balance.toLocaleString()}. ` +
          `Used ${json.spentToday.toLocaleString()} / ${json.cap.toLocaleString()} today.`
      )
      setDelta('')
      setNote('')
      // load() aborts anything already in flight and re-uses the shared
      // controller so a slower reload can't overwrite a fresher one.
      await load(profileId.trim())
    } finally {
      setSubmitting(false)
    }
  }

  const remaining = spentToday === null ? null : Math.max(0, cap - spentToday)
  const remainingLabel =
    remaining === null ? `? / ${cap.toLocaleString()}` : `${remaining.toLocaleString()} / ${cap.toLocaleString()}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Coin adjustments</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Move a profile&rsquo;s coin balance for bug reimbursements, goodwill, or promotions. Every adjustment is
          logged forever with your admin identity, a category, and a note. You can only move coins &mdash; not grant
          specific editions or themes.
        </p>
      </div>

      <div className="glass-card p-5">
        <label className="mb-2 block text-sm font-bold">Profile id</label>
        <input
          className="input-field !py-2 text-sm"
          placeholder="UUID from /admin/users"
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
        />
        {loading && <p className="mt-2 text-sm text-[var(--muted)]">Loading&hellip;</p>}
        {error && <p className="mt-2 text-sm text-[var(--marry)]">{error}</p>}

        {profile && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Handle" value={profile.handle ?? '—'} />
              <Stat label="Balance" value={profile.coins.toLocaleString()} />
              <Stat label={`Daily cap remaining`} value={remainingLabel} />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-[120px_1fr_1fr]">
              <input
                type="number"
                step={1}
                className="input-field !py-2 text-sm"
                placeholder="±coins"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
              />
              <select
                className="input-field !py-2 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value as CoinAdminCategory)}
              >
                {CATEGORY_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {COIN_ADMIN_CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
              <input
                className="input-field !py-2 text-sm"
                placeholder={`Note (min ${ADMIN_NOTE_MIN_LENGTH} chars — for the audit log)`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-[var(--muted)]">
                Positive = grant. Negative = clawback (category must be Correction). Both go to the player&rsquo;s coin
                history with your email attached.
              </p>
              <button
                type="button"
                className="btn-primary px-4 py-2 text-sm"
                onClick={() => void submit()}
                disabled={submitting}
              >
                {submitting ? 'Adjusting…' : 'Adjust coins'}
              </button>
            </div>

            {flash && <p className="mt-3 text-sm text-[var(--like)]">{flash}</p>}
          </>
        )}
      </div>

      {profile && (
        <div className="glass-card p-5">
          <h2 className="mb-2 text-lg font-bold">Recent history</h2>
          {ledger.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No ledger rows yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3 text-right">Delta</th>
                    <th className="py-2 pr-3 text-right">Balance after</th>
                    <th className="py-2 pr-3">Reason</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3">Admin</th>
                    <th className="py-2">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {ledger.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2 pr-3 text-[var(--muted)]">{shortDate(row.created_at)}</td>
                      <td
                        className={`py-2 pr-3 text-right font-mono ${
                          row.delta > 0 ? 'text-[var(--like)]' : 'text-[var(--marry)]'
                        }`}
                      >
                        {row.delta > 0 ? '+' : ''}
                        {row.delta}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">{row.balance_after}</td>
                      <td className="py-2 pr-3">{row.reason}</td>
                      <td className="py-2 pr-3 text-[var(--muted)]">{row.admin_category ?? '—'}</td>
                      <td className="py-2 pr-3 text-[var(--muted)]">{row.admin_id ?? '—'}</td>
                      <td className="py-2 text-[var(--muted)]">{row.admin_note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)] p-3">
      <p className="text-lg font-black">{value}</p>
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
    </div>
  )
}
