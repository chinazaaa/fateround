import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createParticipantSchema, updateParticipantSchema, deleteParticipantSchema } from '@/lib/validation'
import { normalizeGender, type ParticipantInput } from '@/lib/participants'
import { parseGameType, isMostLikelyTo } from '@/lib/game-types'
import { assertHostGame, deleteJoinerPair } from '@/lib/game-admin'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

function parseIncomingParticipants(
  rawName: unknown,
  rawGender: unknown,
  rawList: unknown
): ParticipantInput[] | { error: string } {
  if (Array.isArray(rawList)) {
    const parsed: ParticipantInput[] = []
    for (const item of rawList) {
      if (!item || typeof item !== 'object') continue
      const name = String((item as { name?: string }).name ?? '').trim()
      const gender = normalizeGender(String((item as { gender?: string }).gender ?? ''))
      if (name && gender) parsed.push({ name, gender })
    }
    if (parsed.length === 0) return { error: 'Add at least one valid name and gender' }
    return parsed
  }

  const name = String(rawName ?? '').trim()
  const gender = normalizeGender(String(rawGender ?? ''))
  if (!name) return { error: 'Name is required' }
  if (!gender) return { error: 'Gender must be male or female' }
  return [{ name, gender }]
}

export async function POST(req: NextRequest) {
  const rawBody = await req.json()
  const parsed = createParticipantSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameCode, hostToken, name, gender, participants: rawList } = parsed.data

  const auth = await assertHostGame(supabase, gameCode, hostToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if ((auth.game!.participant_mode ?? 'import') !== 'import') {
    return NextResponse.json({ error: 'Names are added when players join in this game mode' }, { status: 400 })
  }

  const incoming = parseIncomingParticipants(name, gender, rawList)
  if ('error' in incoming) {
    return NextResponse.json({ error: incoming.error }, { status: 400 })
  }

  const { data: existing } = await supabase.from('participants').select('name').eq('game_id', auth.id)

  const existingNames = new Set((existing ?? []).map((p) => p.name.toLowerCase()))
  for (const p of incoming) {
    const key = p.name.toLowerCase()
    if (existingNames.has(key)) {
      return NextResponse.json({ error: `"${p.name}" is already on the list` }, { status: 400 })
    }
    existingNames.add(key)
  }

  const { data: lastRow } = await supabase
    .from('participants')
    .select('display_order')
    .eq('game_id', auth.id)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  let displayOrder = (lastRow?.display_order ?? -1) + 1
  const rows = incoming.map((p) => ({
    game_id: auth.id,
    name: p.name,
    gender: p.gender,
    display_order: displayOrder++,
  }))

  const { data: created, error } = await supabase.from('participants').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ participants: created })
}

export async function PATCH(req: NextRequest) {
  const rawPatch = await req.json()
  const parsedPatch = updateParticipantSchema.safeParse(rawPatch)
  if (!parsedPatch.success) {
    return NextResponse.json({ error: parsedPatch.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const {
    gameCode,
    hostToken,
    participantId,
    name: rawName,
    gender: rawGender,
    inMltPoll: rawInMltPoll,
  } = parsedPatch.data

  const auth = await assertHostGame(supabase, gameCode, hostToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: participant } = await supabase
    .from('participants')
    .select('*')
    .eq('id', participantId)
    .eq('game_id', auth.id)
    .maybeSingle()

  if (!participant) return NextResponse.json({ error: 'Participant not found' }, { status: 404 })

  const updates: { name?: string; gender?: 'male' | 'female'; in_mlt_poll?: boolean } = {}

  if (rawName !== undefined) {
    const name = String(rawName).trim()
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })

    const { data: nameClash } = await supabase
      .from('participants')
      .select('id')
      .eq('game_id', auth.id)
      .ilike('name', name)
      .neq('id', participantId)
      .maybeSingle()

    if (nameClash) {
      return NextResponse.json({ error: 'That name is already on the list' }, { status: 400 })
    }
    updates.name = name
  }

  if (rawGender !== undefined) {
    const gender = normalizeGender(String(rawGender))
    if (!gender) return NextResponse.json({ error: 'Gender must be male or female' }, { status: 400 })
    updates.gender = gender
  }

  if (rawInMltPoll !== undefined) {
    if (!isMostLikelyTo(auth.game!.game_type) || auth.game!.participant_mode !== 'import') {
      return NextResponse.json(
        { error: 'Poll placement only applies to imported Most Likely To lists' },
        { status: 400 }
      )
    }
    updates.in_mlt_poll = Boolean(rawInMltPoll)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('participants')
    .update(updates)
    .eq('id', participantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (auth.game!.participant_mode === 'joiners') {
    const { data: player } = await supabase
      .from('players')
      .select('id, name, gender')
      .eq('game_id', auth.id)
      .eq('name', participant.name)
      .maybeSingle()

    if (player) {
      const playerUpdates: { name?: string; gender?: string } = {}
      if (updates.name) playerUpdates.name = updates.name
      if (updates.gender && player.gender !== 'both') playerUpdates.gender = updates.gender
      if (Object.keys(playerUpdates).length > 0) {
        await supabase.from('players').update(playerUpdates).eq('id', player.id)
      }
    }
  }

  return NextResponse.json({ participant: updated })
}

export async function DELETE(req: NextRequest) {
  const rawDel = await req.json()
  const parsedDel = deleteParticipantSchema.safeParse(rawDel)
  if (!parsedDel.success) {
    return NextResponse.json({ error: parsedDel.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameCode, hostToken, participantId } = parsedDel.data

  const auth = await assertHostGame(supabase, gameCode, hostToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: participant } = await supabase
    .from('participants')
    .select('*')
    .eq('id', participantId)
    .eq('game_id', auth.id)
    .maybeSingle()

  if (!participant) return NextResponse.json({ error: 'Participant not found' }, { status: 404 })

  if (auth.game!.participant_mode === 'joiners') {
    const { data: linkedPlayer } = await supabase
      .from('players')
      .select('id, name')
      .eq('game_id', auth.id)
      .eq('name', participant.name)
      .maybeSingle()

    if (linkedPlayer) {
      await deleteJoinerPair(supabase, auth.id, linkedPlayer)
      return NextResponse.json({ success: true })
    }
  }

  const { error } = await supabase.from('participants').delete().eq('id', participantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
