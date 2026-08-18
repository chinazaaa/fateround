import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { SEED_AUTHOR, SEED_COLLECTIONS } from '@/lib/collections-seed'

// Seed the built-in pilot collections (currently "Church & youth") and their datasets, idempotently.
// - Collections are keyed on builtin_key (== slug) so re-running never duplicates or clobbers edits.
// - Datasets are inserted as APPROVED question_packs (author 'Fate Round'), matched on
//   (title, game_type, author) so re-running reuses the existing pack.
// - Membership is upserted on the join's composite PK.
// Safe to run repeatedly.
export async function POST(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()
  let collectionsCreated = 0
  let datasetsCreated = 0
  let linksCreated = 0

  for (const coll of SEED_COLLECTIONS) {
    // 1) Collection (idempotent on builtin_key).
    let { data: existingColl } = await supabase
      .from('content_collections')
      .select('id')
      .eq('builtin_key', coll.slug)
      .maybeSingle()

    if (!existingColl) {
      const { data: created, error } = await supabase
        .from('content_collections')
        .insert({
          slug: coll.slug,
          name: coll.name,
          description: coll.description,
          audience: coll.audience,
          icon: coll.icon,
          sort_order: coll.sort_order,
          builtin_key: coll.slug,
        })
        .select('id')
        .single()
      if (error)
        return NextResponse.json({ error: internalErrorMessage('admin/collections/import', error) }, { status: 500 })
      existingColl = created
      collectionsCreated++
    }
    const collectionId = existingColl!.id as string

    // 2) Datasets + membership.
    for (const ds of coll.datasets) {
      let { data: pack } = await supabase
        .from('question_packs')
        .select('id')
        .eq('title', ds.title)
        .eq('game_type', ds.game_type)
        .eq('author_name', SEED_AUTHOR)
        .maybeSingle()

      if (!pack) {
        const { data: created, error } = await supabase
          .from('question_packs')
          .insert({
            title: ds.title,
            game_type: ds.game_type,
            author_name: SEED_AUTHOR,
            description: ds.description,
            questions: ds.questions,
            question_count: ds.questions.length,
            status: 'approved',
            approved_at: now,
            tags: ds.tags,
          })
          .select('id')
          .single()
        if (error)
          return NextResponse.json({ error: internalErrorMessage('admin/collections/import', error) }, { status: 500 })
        pack = created
        datasetsCreated++
      }

      const { error: linkErr, count } = await supabase
        .from('question_pack_collections')
        .upsert(
          { collection_id: collectionId, pack_id: pack!.id as string, sort_order: 0 },
          { onConflict: 'pack_id,collection_id', ignoreDuplicates: true, count: 'exact' }
        )
      if (linkErr)
        return NextResponse.json({ error: internalErrorMessage('admin/collections/import', linkErr) }, { status: 500 })
      if (count) linksCreated += count
    }
  }

  return NextResponse.json({ collectionsCreated, datasetsCreated, linksCreated })
}
