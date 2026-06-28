import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 2 * 1024 * 1024 // 2MB

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
      return 'jpg'
  }
}

const MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
  'image/gif': [0x47, 0x49, 0x46],
}

function validateMagicBytes(buffer: Uint8Array, mime: string): boolean {
  const expected = MAGIC_BYTES[mime]
  if (!expected) return false
  return expected.every((byte, i) => buffer[i] === byte)
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const gameId = formData.get('gameId') as string | null
    const participantId = formData.get('participantId') as string | null
    const resumeToken = formData.get('resumeToken') as string | null

    if (!file || !gameId || !participantId || !resumeToken) {
      return NextResponse.json({ error: 'Missing file, gameId, participantId, or resumeToken' }, { status: 400 })
    }

    // Service role: anon can no longer read players.resume_token, so the admin
    // client is required to authorize the player. It also performs the storage
    // write (upsert into the avatars bucket), which is fine under service role.
    const supabaseAdmin = getSupabaseAdmin()

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'File must be an image (jpeg, png, webp, gif)' }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File must be under 2MB' }, { status: 400 })
    }

    // Validate magic bytes match claimed MIME type
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)
    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json({ error: 'File content does not match its type' }, { status: 400 })
    }

    // Validate game exists and is in waiting status
    const { data: game } = await supabaseAdmin.from('games').select('id, status').eq('id', gameId).maybeSingle()

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }
    if (game.status !== 'waiting') {
      return NextResponse.json({ error: 'Photos can only be uploaded while the game is waiting' }, { status: 400 })
    }

    // Authorize by the secret resume_token; the resolved player is authoritative
    // (the client no longer supplies its own playerId).
    const auth = await assertPlayer(supabaseAdmin, gameId, resumeToken)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    // The uploader may only set a photo for the participant linked to their own player.
    if (auth.player.participant_id !== participantId) {
      return NextResponse.json({ error: 'You can only upload photos for your own profile' }, { status: 403 })
    }

    // Validate participant exists and belongs to this game
    const { data: participant } = await supabaseAdmin
      .from('participants')
      .select('id, game_id')
      .eq('id', participantId)
      .eq('game_id', gameId)
      .maybeSingle()

    if (!participant) {
      return NextResponse.json({ error: 'Participant not found in this game' }, { status: 404 })
    }

    const ext = extFromMime(file.type)
    const storagePath = `${gameId}/${participantId}.${ext}`

    // Clean up old files with different extensions
    const otherExts = ['jpg', 'png', 'webp', 'gif'].filter((e) => e !== ext)
    const oldPaths = otherExts.map((e) => `${gameId}/${participantId}.${e}`)
    if (oldPaths.length > 0) await supabaseAdmin.storage.from('avatars').remove(oldPaths)

    // Upload (upsert) to Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage.from('avatars').upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 })
    }

    // Get public URL
    const { data: publicUrlData } = supabaseAdmin.storage.from('avatars').getPublicUrl(storagePath)

    const publicUrl = publicUrlData.publicUrl

    // Update participant record
    const { error: updateError } = await supabaseAdmin
      .from('participants')
      .update({ photo_url: publicUrl })
      .eq('id', participantId)

    if (updateError) {
      console.error('DB update error:', updateError)
      return NextResponse.json({ error: 'Failed to update participant photo' }, { status: 500 })
    }

    return NextResponse.json({ photoUrl: publicUrl })
  } catch (err) {
    console.error('Photo upload error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const deleteSchema = z.object({
  gameId: z.string().min(1),
  participantId: z.string().min(1),
  // Owner authorized by the secret resume_token (resolved server-side), not a client playerId.
  resumeToken: z.string().min(4),
})

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = deleteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { gameId, participantId, resumeToken } = parsed.data
    const supabaseAdmin = getSupabaseAdmin()

    // Authorization: resolve the requester from their resume_token; they may only delete the
    // photo of the participant linked to their own player row.
    const auth = await assertPlayer(supabaseAdmin, gameId, resumeToken)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (auth.player.participant_id !== participantId) {
      return NextResponse.json({ error: 'You can only delete your own photo' }, { status: 403 })
    }

    // Find existing photo to determine storage path
    const { data: participant } = await supabaseAdmin
      .from('participants')
      .select('id, photo_url')
      .eq('id', participantId)
      .eq('game_id', auth.id)
      .maybeSingle()

    if (!participant) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    }

    // Delete from storage — try all extensions since we don't know the original
    const extensions = ['jpg', 'png', 'webp', 'gif']
    const paths = extensions.map((ext) => `${auth.id}/${participantId}.${ext}`)
    await supabaseAdmin.storage.from('avatars').remove(paths)

    // Set photo_url to null
    const { error: updateError } = await supabaseAdmin
      .from('participants')
      .update({ photo_url: null })
      .eq('id', participantId)

    if (updateError) {
      console.error('DB update error:', updateError)
      return NextResponse.json({ error: 'Failed to remove photo' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Photo delete error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
