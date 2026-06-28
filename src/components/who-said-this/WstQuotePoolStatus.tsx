import type { wstQuotePoolStatus } from '@/lib/who-said-this'

type Status = ReturnType<typeof wstQuotePoolStatus>

/**
 * Host-lobby quote-pool status for Who Said This: who has submitted a quote, who's
 * still pending, and who hasn't claimed a name. Extracted verbatim from the host page
 * as the first slice of the poll-host decomposition — pure presentational, one prop.
 */
export function WstQuotePoolStatus({ status }: { status: Status }) {
  return (
    <>
      {status.submitted.length > 0 && (
        <div className="space-y-2">
          <p className="text-muted text-[10px] uppercase tracking-wider">Submitted</p>
          <div className="flex flex-wrap gap-2">
            {status.submitted.map((p) => {
              const count = status.quoteCounts.get(p.id) ?? 0
              return (
                <span key={p.id} className="chip text-xs py-1 px-2 border-emerald-500/40 text-emerald-300">
                  ✓ {p.name}
                  {count > 1 ? ` (${count})` : ''}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {status.awaitingQuote.length > 0 && (
        <div className="space-y-2">
          <p className="text-amber-400/90 text-[10px] uppercase tracking-wider font-semibold">
            Waiting for quote ({status.awaitingQuote.length})
          </p>
          <div className="space-y-1.5">
            {status.awaitingQuote.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2"
              >
                <span className="text-amber-300 text-sm shrink-0">⏳</span>
                <span className="text-body text-sm font-medium flex-1 min-w-0 truncate">{p.name}</span>
                <span className="text-faint text-[10px] uppercase tracking-wider shrink-0">No quote yet</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {status.notClaimed.length > 0 && (
        <div className="space-y-2">
          <p className="text-muted text-[10px] uppercase tracking-wider">
            Hasn&apos;t claimed a name ({status.notClaimed.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {status.notClaimed.map((p) => (
              <span key={p.id} className="chip text-xs py-1 px-2 opacity-70">
                {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {status.eligible.length === 0 && status.notClaimed.length === 0 && (
        <p className="text-faint text-xs text-center py-2">No players joined yet</p>
      )}

      {status.eligible.length > 0 && status.awaitingQuote.length === 0 && status.submitted.length >= 2 && (
        <p className="text-green-400 text-sm text-center">Everyone who claimed a name has submitted — ready to start</p>
      )}
    </>
  )
}
