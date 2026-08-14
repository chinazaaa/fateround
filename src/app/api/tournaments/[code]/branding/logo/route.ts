import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

// Small, focused upload route for a tournament's brand logo. Only the host
// (proving it via the tournament's host_token) can hit this, and the file is
// re-validated on the server for MIME + magic bytes before it reaches storage
// — same guard the /api/photos route runs. The stored URL is written straight
// into `tournaments.branding.logoUrl` so the lobby, in-game header, and
// results card all pick it up from the existing tournament GET.

// SVG is deliberately EXCLUDED. It was accepted behind a "first 200 bytes contain
// <svg" sniff, on the reasoning that hosts uploading their own event logo are
// trusted — but a host is anyone who created a tournament, which needs no account.
// Since the bucket is public-read, that made this an open, unsanitised file host on
// our own Supabase domain: an SVG is XML that can carry <script>, <foreignObject>
// and external references, so it doubles as a phishing page hosted under our name.
// The cross-origin boundary limits what such a script could steal from the app, but
// it does nothing about the hosting abuse itself.
//
// Raster formats have no equivalent problem — they are validated by magic bytes and
// can't carry script. Organisers essentially always have a PNG, so the cost of
// dropping SVG is close to zero. To re-enable it, add a real sanitiser
// (DOMPurify/svg-sanitize) first; the byte sniff is not one.
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
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
    default:
      return 'png'
  }
}

// Every accepted type has a magic-byte signature, so an unknown MIME returning
// false here means "reject" rather than "needs another code path".
function validateMagicBytes(buffer: Uint8Array, mime: string): boolean {
  const expected = MAGIC_BYTES[mime]
  if (!expected) return false
  return expected.every((byte, i) => buffer[i] === byte)
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
      return NextResponse.json({ error: 'Logo must be a PNG, JPG, WebP or GIF image' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Logo must be under 1MB' }, { status: 400 })
    }

    const buffer = new Uint8Array(await file.arrayBuffer())
    const contentValid = validateMagicBytes(buffer, file.type)
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
    // 'svg' stays in the CLEANUP list even though it's no longer an accepted
    // upload type: logos uploaded before SVG was dropped still exist in the
    // bucket, and re-uploading is how a host replaces one.
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

    // Try every extension since we don't know which the host originally uploaded
    // — including 'svg', which is no longer accepted but may exist from before.
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
