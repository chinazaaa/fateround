'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Avatar } from '@/components/Avatar'
import { ShareActionButtons } from '@/components/ShareActionButtons'
import { captureElementAsImage } from '@/lib/capture-element-image'
import { shareImageBlob, downloadBlobAsFile, shareFilenameStem } from '@/lib/share-image'
import type { PublicProfileSummary } from '@/lib/profile/public-profile'

const TIER_EMOJI: Record<string, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '🏆' }
// Tinted tile behind each top-trophy medal — the coloured squares in the mockup.
const TIER_TILE: Record<string, string> = {
  bronze: 'linear-gradient(135deg, #cd7f32, #a86423)',
  silver: 'linear-gradient(135deg, #d8d8e0, #a8a8b8)',
  gold: 'linear-gradient(135deg, #f6d365, #f0b429)',
  platinum: 'linear-gradient(135deg, #e9e4ff, #c4b5fd)',
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/**
 * The public trophy card — the thing a player shares. The captured region (`cardRef`) is exactly
 * what becomes the image; the share/download controls sit outside it so they never appear in the
 * PNG. `captureElementAsImage` appends the fateround.com footer itself, so the card doesn't draw
 * its own domain line.
 */
export function PublicProfileCard({ summary }: { summary: PublicProfileSummary }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)

  const filename = `${shareFilenameStem(summary.handle)}-fateround.png`

  const run = async (mode: 'share' | 'download') => {
    if (!cardRef.current) return
    const setBusy = mode === 'share' ? setSharing : setDownloading
    setBusy(true)
    try {
      const blob = await captureElementAsImage(cardRef.current)
      if (mode === 'download') downloadBlobAsFile(blob, filename)
      else await shareImageBlob(blob, filename)
    } catch {
      // AbortError (user dismissed the share sheet) and capture failures both no-op quietly.
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async () => {
    try {
      const url = `${window.location.origin}/u/${summary.username}`
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-3">
      <div ref={cardRef} className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
        {/* Header band */}
        <div
          className="flex flex-col items-center gap-2 px-6 pt-8 pb-6 text-center"
          style={{ background: 'linear-gradient(160deg, var(--accent-soft, #fdf2f8), transparent)' }}
        >
          <Avatar name={summary.handle} photoUrl={summary.avatarUrl} size="lg" className="!h-20 !w-20 !text-2xl" />
          <h1 className="mt-1 text-2xl font-black tracking-tight">{summary.handle}</h1>
          <p className="text-sm text-muted">
            Level {summary.level} · {summary.points.toLocaleString()} points
          </p>
          {summary.currentStreak > 0 && (
            // whitespace-nowrap: html-to-image can mis-measure width on capture and wrap this short
            // line across two rows in the downloaded PNG even though it fits on screen.
            <p className="whitespace-nowrap text-sm font-semibold" style={{ color: 'var(--accent, #f43f5e)' }}>
              🔥 {plural(summary.currentStreak, 'day')} streak
            </p>
          )}
        </div>

        <div className="space-y-5 bg-[var(--surface)] px-6 pb-7 pt-5">
          {/* Stat row */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <CardStat value={`${summary.trophyCount}`} label="Trophies" />
            <CardStat value={`${summary.gamesPlayed}`} label="Games played" />
            <CardStat value={summary.winRate === null ? '—' : `${summary.winRate}%`} label="Win rate" />
          </div>

          {/* Top trophies */}
          {summary.topTrophies.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-faint text-xs font-bold uppercase tracking-wide">Top trophies</p>
              {summary.topTrophies.map((t) => (
                <div key={t.id} className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                    style={{ background: TIER_TILE[t.tier] ?? 'var(--surface-inset-bg)' }}
                    aria-hidden
                  >
                    {TIER_EMOJI[t.tier] ?? '🏅'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-tight">{t.title}</p>
                    <p className="text-faint truncate text-xs">
                      {t.gameLabel}
                      {t.tier ? ` · ${t.tier[0].toUpperCase()}${t.tier.slice(1)}` : ''}
                      {t.rarityPct !== null ? ` · ${t.rarityPct}% of players` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Plain-text link, deliberately quiet so it doesn't compete with the CTA below it. */}
          {summary.trophyCount > 0 && (
            <Link
              href={`/u/${summary.username}/trophies`}
              className="block text-center text-sm font-semibold no-underline"
              style={{ color: 'var(--accent, #f43f5e)' }}
            >
              See all {summary.trophyCount} {summary.trophyCount === 1 ? 'trophy' : 'trophies'} →
            </Link>
          )}

          {/* CTA — the brand primary button. */}
          <Link href="/" className="btn-primary block w-full text-center no-underline">
            Beat {summary.handle}&apos;s score →
          </Link>
        </div>
      </div>

      {/* Controls — outside the captured card. */}
      <ShareActionButtons
        shareLabel="Share profile"
        onShare={() => void run('share')}
        onDownload={() => void run('download')}
        sharing={sharing}
        downloading={downloading}
        downloadLabel="Download card"
        primary
      />
      <button type="button" onClick={() => void copyLink()} className="btn-ghost w-full text-sm">
        {copied ? 'Link copied ✓' : 'Copy link'}
      </button>
    </div>
  )
}

function CardStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-faint text-[11px] uppercase tracking-wide">{label}</p>
    </div>
  )
}
