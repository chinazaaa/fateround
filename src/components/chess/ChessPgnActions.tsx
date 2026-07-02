'use client'

import { useState } from 'react'
import type { Game, Player, ChessSession } from '@/types'
import { buildChessPgn, chessPgnFilename } from '@/lib/chess-pgn'
import { copyToClipboard } from '@/lib/copy'
import { useToast } from '@/components/ui/Toast'

/**
 * "Download my game" (a .pgn file) and "Copy moves" (movetext to clipboard) for a
 * finished chess game. Both derive from the PGN already stored on the session.
 */
export function ChessPgnActions({ game, players, session }: { game: Game; players: Player[]; session: ChessSession }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  const handleDownload = () => {
    const { pgn } = buildChessPgn(session, players, game)
    const blob = new Blob([pgn], { type: 'application/x-chess-pgn' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = chessPgnFilename(session, players)
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Defer revocation so it can't race the browser starting the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const handleCopy = async () => {
    const { moves } = buildChessPgn(session, players, game)
    const ok = await copyToClipboard(moves)
    if (ok) {
      toast.success('Moves copied')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('Could not copy — try again')
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={handleDownload} className="btn-secondary w-full py-2.5 text-sm">
        Download game (PGN)
      </button>
      <button type="button" onClick={handleCopy} className="btn-secondary w-full py-2.5 text-sm">
        {copied ? 'Copied ✓' : 'Copy moves'}
      </button>
    </div>
  )
}
