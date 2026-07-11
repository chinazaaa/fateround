// Local NPAT POST wrappers. Kept here (rather than the shared lib/game-api.ts)
// for parallel-safety; mirrors postJson<T> in that file.
import { apiUrl } from '@/lib/config'
import type { NpatCategory } from '@fateround/shared'

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

export function postNpatDraft(
  gameId: string,
  resumeToken: string,
  roundId: string,
  answers: { name: string; animal: string; place: string; thing: string; food: string }
) {
  return postJson<{ success: boolean }>('/api/npat/draft', {
    gameId,
    resumeToken,
    roundId,
    ...answers,
  })
}

export type NpatCallerOverrideRow = {
  playerId: string
  validName: boolean
  validAnimal: boolean
  validPlace: boolean
  validThing: boolean
  validFood: boolean
}

export function postNpatCallerApproveOverrides(
  gameId: string,
  resumeToken: string,
  roundId: string,
  overrides: NpatCallerOverrideRow[]
) {
  return postJson<{ success: boolean }>('/api/npat/caller-approve', {
    gameId,
    resumeToken,
    roundId,
    overrides,
  })
}

export function postNpatDispute(
  gameId: string,
  resumeToken: string,
  roundId: string,
  targetPlayerId: string,
  category: NpatCategory
) {
  return postJson<{ success: boolean; disputed?: boolean }>('/api/npat/dispute', {
    gameId,
    resumeToken,
    roundId,
    targetPlayerId,
    category,
  })
}
