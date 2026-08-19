'use client'

import { useCallback, useRef, useState } from 'react'
import { WinnerCertificate } from './WinnerCertificate'
import { captureElementAsImage } from '@/lib/capture-element-image'
import { downloadBlobAsFile, shareFilenameStem } from '@/lib/share-image'
import { buildParticipationCsv, csvBlob, resolveTournamentChampion } from '@/lib/tournament-export'
import { useToast } from '@/components/ui/Toast'
import type { Tournament, TournamentGame, TournamentPlayer } from '@/types/tournament'

/**
 * The post-event pack — surfaced once the tournament is finished. Two clean
 * downloads a host can hand to their manager / pastor / teacher afterwards:
 *
 *   1. Winner certificate PNG — branded, printable, share-ready.
 *   2. Participation CSV — every player with their final rank, points and
 *      status, formatted for Excel / Sheets / Numbers.
 *
 * The shareable standings image lives on TournamentShareLeaderboard already
 * (share + download buttons there), so it's intentionally not duplicated
 * here — this card is about the "proof it happened" artifacts, not the "look
 * how we did" moment.
 */
export function TournamentEventPackCard({
  tournament,
  players,
  games,
}: {
  tournament: Tournament
  players: TournamentPlayer[]
  games: TournamentGame[]
}) {
  const { success, error } = useToast()
  const [downloadingCert, setDownloadingCert] = useState(false)
  const [downloadingCsv, setDownloadingCsv] = useState(false)
  // Off-screen render target for the certificate capture. Positioned outside
  // the viewport so it never flashes to the user, but with a real width so
  // html-to-image gets deterministic sizes rather than the parent's zero-w.
  const certRef = useRef<HTMLDivElement>(null)

  const champion = resolveTournamentChampion(tournament, players, games)

  // Prefer the tournament's created_at as the event date — the tournament row
  // is created near the event's actual runtime, which is closer to what a
  // host would write on the certificate than "today" (a host might download
  // the cert days later).
  const dateLabel = new Date(tournament.created_at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const filenameStem = shareFilenameStem(tournament.title)

  const handleDownloadCertificate = useCallback(async () => {
    if (!champion) {
      error('No champion crowned — end the tournament with a winner to download the certificate')
      return
    }
    const target = certRef.current
    if (!target) {
      error('Certificate not ready — try again in a moment')
      return
    }
    setDownloadingCert(true)
    try {
      const blob = await captureElementAsImage(target)
      downloadBlobAsFile(blob, `${filenameStem}-certificate.png`)
      success(`Certificate saved — ${champion.player_name}, ${tournament.title}`)
    } catch (err) {
      error(err instanceof Error ? err.message : 'Could not save certificate')
    } finally {
      setDownloadingCert(false)
    }
  }, [champion, filenameStem, tournament.title, success, error])

  const handleDownloadCsv = useCallback(() => {
    if (players.length === 0) {
      error('No players joined — nothing to export')
      return
    }
    setDownloadingCsv(true)
    try {
      const csv = buildParticipationCsv(tournament, players, games)
      downloadBlobAsFile(csvBlob(csv), `${filenameStem}-participants.csv`)
      success('Participation CSV downloaded')
    } catch (err) {
      error(err instanceof Error ? err.message : 'Could not export CSV')
    } finally {
      setDownloadingCsv(false)
    }
  }, [tournament, players, games, filenameStem, success, error])

  return (
    <div className="glass-card p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="label-caps">Event pack — take it with you</p>
        <span className="text-faint text-xs">Proof for your team / school / church</span>
      </div>
      <p className="text-muted text-sm">
        Everything you need to close out the event: a printable winner certificate and a full participation list you can
        drop into a report.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={handleDownloadCertificate}
          disabled={downloadingCert || !champion}
          className="btn-secondary text-sm"
          title={
            !champion
              ? 'No single champion — the tournament ended without a winner'
              : 'Download winner certificate as PNG'
          }
        >
          {downloadingCert ? 'Preparing…' : '🏅 Winner certificate (PNG)'}
        </button>
        <button
          type="button"
          onClick={handleDownloadCsv}
          disabled={downloadingCsv || players.length === 0}
          className="btn-secondary text-sm"
          title="Download participation list as CSV — opens in Excel, Sheets, Numbers"
        >
          {downloadingCsv ? 'Preparing…' : '📋 Participation CSV'}
        </button>
      </div>

      {!champion && (
        <p className="text-faint text-xs">
          Winner certificate becomes available once a single champion is crowned. Round-robin finishes with the highest
          points; bracket formats need one player left standing.
        </p>
      )}

      {/* Off-screen capture target for the certificate. Positioned far off-viewport
          rather than display:none so html-to-image can measure layout. Rendered
          only when there's a champion to avoid a wasted DOM. */}
      {champion && (
        <div style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }} aria-hidden>
          <div ref={certRef}>
            <WinnerCertificate tournament={tournament} winner={champion} dateLabel={dateLabel} />
          </div>
        </div>
      )}
    </div>
  )
}
