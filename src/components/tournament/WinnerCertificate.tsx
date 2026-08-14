import type { CSSProperties } from 'react'
import type { Tournament, TournamentPlayer } from '@/types/tournament'
import { appDomain } from '@/lib/site'

/**
 * Off-screen render whose DOM node the EventPackCard snapshots with
 * html-to-image to produce a downloadable certificate PNG. Sized landscape
 * (900×640) so a screenshot at pixelRatio=2 lands at 1800×1280 — sharp on
 * screen, comfortable on a printed A4/letter page too.
 *
 * Kept intentionally static and print-safe: no gradients that don't render in
 * html-to-image, no external fonts (falls back to system stack), no theme
 * variables that would resolve differently mid-capture. Brand colour is
 * inlined off the tournament's branding blob rather than picked up from a
 * CSS custom property, so a certificate captured on a page without the
 * TournamentBrandingWrapper still comes out branded.
 */
export function WinnerCertificate({
  tournament,
  winner,
  dateLabel,
}: {
  tournament: Tournament
  winner: TournamentPlayer
  /** Human date shown at the bottom, e.g. "14 August 2026". */
  dateLabel: string
}) {
  const primary = tournament.branding?.primaryColor ?? '#7c3aed'
  const accent = tournament.branding?.accentColor ?? primary
  const styleVars: CSSProperties = {
    width: 900,
    height: 640,
    background: '#ffffff',
    color: '#111827',
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '56px 64px',
    boxSizing: 'border-box',
    // Double border for the classic certificate look — inner uses the accent
    // colour so a two-colour brand still comes through even in monochrome
    // prints.
    border: `8px solid ${primary}`,
    boxShadow: `inset 0 0 0 3px ${accent}`,
  }

  return (
    <div style={styleVars}>
      {/* Top: logo (if set) + "Certificate of Achievement" */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {tournament.branding?.logoUrl && (
          <img
            src={tournament.branding.logoUrl}
            alt=""
            crossOrigin="anonymous"
            style={{ height: 80, width: 80, objectFit: 'contain' }}
          />
        )}
        <p
          style={{
            fontSize: 14,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: '#6b7280',
            marginTop: 4,
          }}
        >
          Certificate of Achievement
        </p>
      </div>

      {/* Middle: the winner */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center' }}>
        <p style={{ fontSize: 20, color: '#4b5563', margin: 0 }}>Presented to</p>
        <h1
          style={{
            fontSize: 68,
            fontWeight: 900,
            margin: 0,
            color: primary,
            lineHeight: 1.1,
            maxWidth: 720,
            wordBreak: 'break-word',
          }}
        >
          {winner.player_name}
        </h1>
        <p style={{ fontSize: 24, color: '#111827', margin: 0, maxWidth: 720 }}>
          <span style={{ fontSize: 30 }}>🥇</span> Champion of{' '}
          <span style={{ fontWeight: 700 }}>{tournament.title}</span>
        </p>
      </div>

      {/* Footer: date + fateround wordmark */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <p style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#6b7280', margin: 0 }}>
            Awarded
          </p>
          <p style={{ fontSize: 18, fontWeight: 600, margin: '2px 0 0 0' }}>{dateLabel}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#6b7280', margin: 0 }}>
            Hosted on
          </p>
          <p style={{ fontSize: 18, fontWeight: 700, margin: '2px 0 0 0', color: primary }}>{appDomain()}</p>
        </div>
      </div>
    </div>
  )
}
