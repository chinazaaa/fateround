import { ImageResponse } from 'next/og'
import { getInitial } from '@/lib/utils'
import { getPublicProfileSummary } from '@/lib/profile/public-profile'

// Runs on the server (service-role DB read); the default edge runtime can't hold the service key.
export const runtime = 'nodejs'
export const alt = 'FateRound trophy profile'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const TIER_DOT: Record<string, string> = {
  bronze: '#cd7f32',
  silver: '#b8b8c4',
  gold: '#f0b429',
  platinum: '#c4b5fd',
}

type Props = { params: Promise<{ username: string }> }

/** Satori doesn't shrink text to fit, so long user-supplied strings would overflow the card. */
function clamp(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/**
 * The link-unfurl card for /u/[username] — what WhatsApp/Twitter/etc. render when the link is
 * pasted. Built with next/og (no extra dependency). Deliberately emoji-free: the default OG font
 * has no emoji glyphs, so tiers are coloured dots rather than medals. Any failure (missing profile,
 * DB hiccup) falls back to a generic branded card rather than throwing — an unfurl must never 500.
 */
export default async function Image({ params }: Props) {
  const { username } = await params
  const summary = await getPublicProfileSummary(username).catch(() => null)

  const brandBg = 'linear-gradient(135deg, #f43f5e 0%, #a855f7 100%)'

  if (!summary) {
    return new ImageResponse(
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: brandBg,
          color: '#fff',
          fontSize: 64,
          fontWeight: 800,
        }}
      >
        <div style={{ display: 'flex' }}>FateRound</div>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 500, marginTop: 16, opacity: 0.9 }}>
          Free party games — no download
        </div>
      </div>,
      size
    )
  }

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: '#ffffff',
        padding: 64,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
        {/* Header: avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 128,
              height: 128,
              borderRadius: 128,
              background: brandBg,
              color: '#fff',
              fontSize: 60,
              fontWeight: 800,
              marginRight: 32,
            }}
          >
            {getInitial(summary.handle)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, color: '#18181b' }}>
              {clamp(summary.handle, 16)}
            </div>
            <div style={{ display: 'flex', fontSize: 30, color: '#71717a', marginTop: 6 }}>
              Level {summary.level} · {summary.points.toLocaleString()} points
              {summary.currentStreak > 0 ? ` · ${summary.currentStreak} day streak` : ''}
            </div>
          </div>
        </div>

        {/* Stat row */}
        <div style={{ display: 'flex', gap: 24 }}>
          <Stat value={`${summary.trophyCount}`} label="Trophies" />
          <Stat value={`${summary.gamesPlayed}`} label="Games played" />
          <Stat value={summary.winRate === null ? '—' : `${summary.winRate}%`} label="Win rate" />
        </div>

        {/* Top trophies */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {summary.topTrophies.slice(0, 3).map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
              <div
                style={{
                  display: 'flex',
                  width: 20,
                  height: 20,
                  borderRadius: 20,
                  background: TIER_DOT[t.tier] ?? '#a1a1aa',
                  marginRight: 16,
                  flexShrink: 0,
                }}
              />
              <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: '#27272a', flexShrink: 0 }}>
                {clamp(t.title, 28)}
              </div>
              <div style={{ display: 'flex', fontSize: 26, color: '#a1a1aa', marginLeft: 12 }}>
                {t.gameLabel}
                {t.rarityPct !== null ? ` · ${t.rarityPct}%` : ''}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: '#f43f5e' }}>
            Beat {clamp(summary.handle, 16)}’s score →
          </div>
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 600, color: '#a1a1aa' }}>fateround.com</div>
        </div>
      </div>
    </div>,
    size
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 0',
        borderRadius: 20,
        background: '#f4f4f7',
      }}
    >
      <div style={{ display: 'flex', fontSize: 52, fontWeight: 800, color: '#18181b' }}>{value}</div>
      <div style={{ display: 'flex', fontSize: 24, color: '#71717a', marginTop: 4 }}>{label}</div>
    </div>
  )
}
