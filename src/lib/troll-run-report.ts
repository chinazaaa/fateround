/** Longest a single in-race report (request plus response body) may take before it is abandoned. */
export const RACE_REPORT_TIMEOUT_MS = 8000

export type RaceReportOutcome = { ok: boolean; body: Record<string, unknown> | null }

/**
 * Posts one in-race report, retrying once on a network error, timeout or 5xx. A 4xx is a decision
 * the server already made, so it is handed back instead of repeated.
 *
 * Every attempt is bounded, covering the response body as well as the request: reports go through
 * a serial queue, and a request that never settled would hold every later report behind it.
 */
export async function postRaceReportRequest(
  path: string,
  payload: Record<string, unknown>,
  timeoutMs: number = RACE_REPORT_TIMEOUT_MS
): Promise<RaceReportOutcome> {
  const body = JSON.stringify(payload)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
      // Read the body as text so that a timeout while reading it is a real error here, not a
      // swallowed parse failure: only malformed JSON may fall back to a null body.
      let text: string | null = null
      try {
        text = await res.text()
      } catch {
        // The body never arrived in time. A 2xx already says the server accepted the report, so it
        // stands; a refusal's body carries the progress the caller needs, so try again for it.
        if (res.ok) return { ok: true, body: null }
        continue
      }
      let parsed: Record<string, unknown> | null = null
      try {
        parsed = JSON.parse(text) as Record<string, unknown> | null
      } catch {
        parsed = null
      }
      if (res.ok) return { ok: true, body: parsed }
      if (res.status < 500) return { ok: false, body: parsed }
    } catch {
      // Network blip or timeout: worth exactly one more try.
    }
  }
  return { ok: false, body: null }
}
