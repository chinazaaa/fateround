import { NextRequest, NextResponse } from 'next/server'
import type { z } from 'zod'

/**
 * Safely read + validate a JSON request body.
 *
 * `await req.json()` throws on an empty or malformed body, which — when called
 * inline before `schema.safeParse(...)` — surfaces as an unhandled 500 instead of
 * the intended 400. This wraps both steps so callers always get a clean result.
 *
 * Usage:
 *   const { data, error } = await parseJsonBody(req, mySchema)
 *   if (error) return error
 *   // ...use data
 */
export async function parseJsonBody<S extends z.ZodTypeAny>(
  req: NextRequest,
  schema: S
): Promise<{ data: z.infer<S>; error?: undefined } | { data?: undefined; error: NextResponse }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { error: NextResponse.json({ error: 'Invalid or empty request body' }, { status: 400 }) }
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return { error: NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 }) }
  }

  return { data: parsed.data }
}
