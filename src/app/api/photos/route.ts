import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 2 * 1024 * 1024 // 2MB

function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg': return 'jpg'
    case 'image/png': return 'png'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
    default: return 'jpg'
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const gameId = formData.get('gameId') as string | null
    const participantId = formData.get('participantId') as string | null

    if (!file || !gameId || !participantId) {
      return NextResponse.json({ error: 'Missing file, gameId, or participantId' }, { status: 400 })
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'File must be an image (jpeg, png, webp, gif)' }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File must be under 2MB' }, { status: 400 })
    }

    // Validate game exists and is in waiting status
    const { data: game } = await supabase
      .from('games')
      .select('id, status')
      .eq('id', gameId)
      .maybeSingle()

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }
    if (game.status !== 'waiting') {
      return NextResponse.json({ error: 'Photos can only be uploaded while the game is waiting' }, { status: 400 })
    }

    // Validate participant exists and belongs to this game
    const { data: participant } = await supabase
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
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    // Upload (upsert) to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 })
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(storagePath)

    const publicUrl = publicUrlData.publicUrl

    // Update participant record
    const { error: updateError } = await supabase
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
})

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = deleteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { gameId, participantId } = parsed.data

    // Find existing photo to determine storage path
    const { data: participant } = await supabase
      .from('participants')
      .select('id, photo_url')
      .eq('id', participantId)
      .eq('game_id', gameId)
      .maybeSingle()

    if (!participant) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 })
    }

    // Delete from storage — try all extensions since we don't know the original
    const extensions = ['jpg', 'png', 'webp', 'gif']
    const paths = extensions.map((ext) => `${gameId}/${participantId}.${ext}`)
    await supabase.storage.from('avatars').remove(paths)

    // Set photo_url to null
    const { error: updateError } = await supabase
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
