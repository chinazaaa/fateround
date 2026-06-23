import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const gameType = searchParams.get('game_type')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  let query = supabase
    .from('question_packs')
    .select('id, title, game_type, author_name, description, question_count, approved_at')
    .eq('status', 'approved')
    .order('approved_at', { ascending: false })

  if (gameType) query = query.eq('game_type', gameType)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ packs: data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { title, game_type, author_name, description, questions } = body

  if (!title || !game_type || !author_name || !Array.isArray(questions)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (title.length > 100) return NextResponse.json({ error: 'Title too long' }, { status: 400 })
  if (author_name.length > 60) return NextResponse.json({ error: 'Author name too long' }, { status: 400 })
  if (description && description.length > 500) return NextResponse.json({ error: 'Description too long' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data, error } = await supabase
    .from('question_packs')
    .insert({
      title,
      game_type,
      author_name,
      description: description ?? null,
      questions,
      question_count: questions.length,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, id: data.id })
}
