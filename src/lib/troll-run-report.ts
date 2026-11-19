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
      const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (res.ok) return { ok: true, body: parsed }
      if (res.status < 500) return { ok: false, body: parsed }
    } catch {
      // Network blip or timeout: worth exactly one more try.
    }
  }
  return { ok: false, body: null }
}
