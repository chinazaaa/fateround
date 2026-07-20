import { NextRequest, NextResponse } from 'next/server'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB — blog images can be larger than avatars.
const BUCKET = 'blog'

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// First bytes that must match the claimed MIME, so a renamed file can't smuggle in another type.
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
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is required to upload images.' }, { status: 503 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'File must be a JPEG, PNG, WebP or GIF image' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Image must be under 5MB' }, { status: 400 })
  }

  const buffer = new Uint8Array(await file.arrayBuffer())
  if (!validateMagicBytes(buffer, file.type)) {
    return NextResponse.json({ error: 'File content does not match its type' }, { status: 400 })
  }

  const ext = EXT_BY_MIME[file.type] ?? 'jpg'
  // Random, non-guessable path; the DB never references these by name, only by public URL.
  const storagePath = `posts/${crypto.randomUUID()}.${ext}`

  const supabase = getSupabaseAdmin()
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) {
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return NextResponse.json({ url: data.publicUrl }, { status: 201 })
}
