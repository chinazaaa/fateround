import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

// Small, focused upload route for a tournament's brand logo. Only the host
// (proving it via the tournament's host_token) can hit this, and the file is
// re-validated on the server for MIME + magic bytes before it reaches storage
// — same guard the /api/photos route runs. The stored URL is written straight
// into `tournaments.branding.logoUrl` so the lobby, in-game header, and
// results card all pick it up from the existing tournament GET.

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
const MAX_SIZE = 1 * 1024 * 1024 // 1MB — logos should be small; blocks anyone stuffing photos.

const MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
  'image/gif': [0x47, 0x49, 0x46],
}

function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/svg+xml':
      return 'svg'
    default:
      return 'png'
  }
}

// SVG doesn't have a magic-byte signature, so it's validated with a text sniff
// below. Everything else goes through this table.
function validateMagicBytes(buffer: Uint8Array, mime: string): boolean {
  const expected = MAGIC_BYTES[mime]
  if (!expected) return false
  return expected.every((byte, i) => buffer[i] === byte)
}

// Cheap SVG guard: check the first ~200 bytes contain "<svg" — enough to
// reject a mislabelled binary but NOT a real sanitiser. For MVP we accept
// that hosts uploading their own event's SVG are trusted; if that changes,
// swap in a proper sanitiser (DOMPurify/svg-sanitize).
function looksLikeSvg(buffer: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 200)).toLowerCase()
  return head.includes('<svg')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  // Flood backstop: this endpoint reads a multipart body and writes to storage,
  // so it shouldn't be freely hammerable even before the host check below.
  const limited = await enforceRateLimit(req, RATE_LIMITS.tournamentLogoUpload)
  if (limited) return limited

  try {
    const admin = getSupabaseAdmin()

    // AUTHORISE FIRST. The host_token check has to happen before the body is
    // parsed and buffered — `formData()` + `arrayBuffer()` pull the whole
    // payload into memory, so doing them first let an unauthenticated caller
    // who knew only the (publicly shared) tournament code burn server memory
    // and CPU on every request and get a 403 only afterwards.
    const hostToken = req.headers.get('x-host-token')
    if (!hostToken) {
      return NextResponse.json({ error: 'Missing hostToken' }, { status: 400 })
    }

    const { data: tournament } = await admin
      .from('tournaments')
      .select('host_token, branding')
      .eq('id', tournamentId)
      .maybeSingle()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }
    if (tournament.host_token !== hostToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'File must be an image (png, jpg, webp, gif, svg)' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Logo must be under 1MB' }, { status: 400 })
    }

    const buffer = new Uint8Array(await file.arrayBuffer())
    const contentValid = file.type === 'image/svg+xml' ? looksLikeSvg(buffer) : validateMagicBytes(buffer, file.type)
    if (!contentValid) {
      return NextResponse.json({ error: 'File content does not match its type' }, { status: 400 })
    }

    const ext = extFromMime(file.type)
    const storagePath = `${tournamentId}/logo.${ext}`

    const { error: uploadError } = await admin.storage.from('tournament-branding').upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    })
    if (uploadError) {
      console.error('Tournament logo upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 })
    }

    // Only AFTER the new file is safely stored: clean up logos left at other
    // extensions by a previous format. Doing this first meant a failed upload
    // deleted the working logo and left branding.logoUrl pointing at a 404.
    const oldPaths = ['png', 'jpg', 'webp', 'gif', 'svg']
      .filter((e) => e !== ext)
      .map((e) => `${tournamentId}/logo.${e}`)
    if (oldPaths.length > 0) await admin.storage.from('tournament-branding').remove(oldPaths)

    const { data: publicUrlData } = admin.storage.from('tournament-branding').getPublicUrl(storagePath)
    // Cache-bust so a re-upload of the same filename actually refreshes for
    // players who already loaded the lobby.
    const logoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`

    const prevBranding = (tournament.branding as Record<string, unknown> | null) ?? {}
    const nextBranding = { ...prevBranding, logoUrl }
    const { error: updateError } = await admin
      .from('tournaments')
      .update({ branding: nextBranding })
      .eq('id', tournamentId)
    if (updateError) {
      console.error('Tournament branding update error:', updateError)
      return NextResponse.json({ error: 'Failed to save logo' }, { status: 500 })
    }

    return NextResponse.json({ logoUrl })
  } catch (err) {
    console.error('Tournament logo upload error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  try {
    const body = await req.json()
    const hostToken = typeof body?.hostToken === 'string' ? body.hostToken : null
    if (!hostToken) return NextResponse.json({ error: 'Missing hostToken' }, { status: 400 })

    const admin = getSupabaseAdmin()
    const { data: tournament } = await admin
      .from('tournaments')
      .select('host_token, branding')
      .eq('id', tournamentId)
      .maybeSingle()

    if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    if (tournament.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    // Try every extension since we don't know which the host originally uploaded.
    const paths = ['png', 'jpg', 'webp', 'gif', 'svg'].map((e) => `${tournamentId}/logo.${e}`)
    await admin.storage.from('tournament-branding').remove(paths)

    const prevBranding = (tournament.branding as Record<string, unknown> | null) ?? {}
    const { logoUrl: _drop, ...rest } = prevBranding as { logoUrl?: unknown }
    void _drop
    const nextBranding = Object.keys(rest).length > 0 ? rest : null

    const { error: updateError } = await admin
      .from('tournaments')
      .update({ branding: nextBranding })
      .eq('id', tournamentId)
    if (updateError) {
      console.error('Tournament branding update error:', updateError)
      return NextResponse.json({ error: 'Failed to remove logo' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Tournament logo delete error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
