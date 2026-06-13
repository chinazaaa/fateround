import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface YurippeQuote {
  _id: string
  character: string
  show: string
  quote: string
}

interface JikanCharacter {
  name: string
  role: string
}

export interface PreparedAnimeQuote {
  quote_text: string
  anime_name: string
  correct_character: string
  choices: string[]
}

// ---------------------------------------------------------------------------
// Blocklist — non-anime sources that appear in Yurippe
// ---------------------------------------------------------------------------

const NON_ANIME_SHOWS = new Set([
  'avatar: the last airbender',
  'the legend of korra',
  'rwby',
  'castlevania',
  'the boondocks',
  'teen titans',
  'voltron: legendary defender',
])

// ---------------------------------------------------------------------------
// Fuzzy title matching (normalized Levenshtein)
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function normalizedDistance(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 0
  return levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLen
}

function titlesMatch(yurippeShow: string, jikanTitle: string): boolean {
  return normalizedDistance(yurippeShow, jikanTitle) <= 0.4
}

// ---------------------------------------------------------------------------
// Character name formatting: "Last, First" → "First Last"
// ---------------------------------------------------------------------------

function formatCharacterName(name: string): string {
  if (name.includes(', ')) {
    const [last, first] = name.split(', ', 2)
    return `${first} ${last}`
  }
  return name
}

// ---------------------------------------------------------------------------
// Jikan API helpers (with caching and rate limiting)
// ---------------------------------------------------------------------------

const JIKAN_DELAY_MS = 350

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function searchAnimeId(showName: string): Promise<number | null> {
  // Check cache first
  const { data: cached } = await supabase
    .from('jikan_search_cache')
    .select('mal_id')
    .eq('show_name', showName)
    .maybeSingle()

  if (cached !== null) {
    return cached.mal_id
  }

  await sleep(JIKAN_DELAY_MS)
  const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(showName)}&limit=1`)

  if (!res.ok) {
    if (res.status === 429) {
      await sleep(2000)
      const retry = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(showName)}&limit=1`)
      if (!retry.ok) return null
      const retryJson = await retry.json()
      const retryAnime = retryJson.data?.[0]
      if (!retryAnime) return null

      const title = retryAnime.title ?? ''
      const titleEn = retryAnime.title_english ?? ''
      if (!titlesMatch(showName, title) && !titlesMatch(showName, titleEn)) {
        await supabase.from('jikan_search_cache').upsert({
          show_name: showName,
          mal_id: null,
          cached_at: new Date().toISOString(),
        })
        return null
      }
      const malId = retryAnime.mal_id as number
      await supabase.from('jikan_search_cache').upsert({
        show_name: showName,
        mal_id: malId,
        cached_at: new Date().toISOString(),
      })
      return malId
    }
    return null
  }

  const json = await res.json()
  const anime = json.data?.[0]
  if (!anime) {
    await supabase.from('jikan_search_cache').upsert({
      show_name: showName,
      mal_id: null,
      cached_at: new Date().toISOString(),
    })
    return null
  }

  const title = anime.title ?? ''
  const titleEn = anime.title_english ?? ''
  if (!titlesMatch(showName, title) && !titlesMatch(showName, titleEn)) {
    await supabase.from('jikan_search_cache').upsert({
      show_name: showName,
      mal_id: null,
      cached_at: new Date().toISOString(),
    })
    return null
  }

  const malId = anime.mal_id as number
  await supabase.from('jikan_search_cache').upsert({
    show_name: showName,
    mal_id: malId,
    cached_at: new Date().toISOString(),
  })
  return malId
}

async function fetchCharacters(malId: number, showName: string): Promise<JikanCharacter[]> {
  // Check cache first
  const { data: cached } = await supabase
    .from('jikan_anime_cache')
    .select('characters')
    .eq('mal_id', malId)
    .maybeSingle()

  if (cached) {
    return cached.characters as JikanCharacter[]
  }

  await sleep(JIKAN_DELAY_MS)
  const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}/characters`)

  if (!res.ok) {
    if (res.status === 429) {
      await sleep(2000)
      const retry = await fetch(`https://api.jikan.moe/v4/anime/${malId}/characters`)
      if (!retry.ok) return []
      const retryJson = await retry.json()
      const chars = (retryJson.data ?? []).map((c: { character: { name: string }; role: string }) => ({
        name: formatCharacterName(c.character.name),
        role: c.role,
      }))
      await supabase.from('jikan_anime_cache').upsert({
        mal_id: malId,
        show_name: showName,
        characters: chars,
        cached_at: new Date().toISOString(),
      })
      return chars
    }
    return []
  }

  const json = await res.json()
  const chars = (json.data ?? []).map((c: { character: { name: string }; role: string }) => ({
    name: formatCharacterName(c.character.name),
    role: c.role,
  }))

  await supabase.from('jikan_anime_cache').upsert({
    mal_id: malId,
    show_name: showName,
    characters: chars,
    cached_at: new Date().toISOString(),
  })
  return chars
}

// ---------------------------------------------------------------------------
// Quote filtering
// ---------------------------------------------------------------------------

function isValidQuote(q: YurippeQuote): boolean {
  if (q.character.toLowerCase() === q.show.toLowerCase()) return false
  if (NON_ANIME_SHOWS.has(q.show.toLowerCase())) return false
  if (q.character.length <= 2) return false
  if (['narrator', 'unknown', 'n/a'].includes(q.character.toLowerCase())) return false
  if (q.quote.length < 15) return false
  return true
}

// ---------------------------------------------------------------------------
// Pick random decoys from the same anime
// ---------------------------------------------------------------------------

function pickDecoys(correctCharacter: string, allCharacters: JikanCharacter[], count: number): string[] {
  const mainChars = allCharacters.filter((c) => c.role === 'Main' && c.name !== correctCharacter)
  const supportChars = allCharacters.filter((c) => c.role === 'Supporting' && c.name !== correctCharacter)

  const pool = [...mainChars, ...supportChars]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count).map((c) => c.name)
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// ---------------------------------------------------------------------------
// Main: fetch and prepare anime quotes
// ---------------------------------------------------------------------------

export async function fetchAnimeQuotes(count: number): Promise<PreparedAnimeQuote[]> {
  const fetchCount = Math.ceil(count * 1.4)
  const res = await fetch(`https://yurippe.vercel.app/api/quotes?random=${fetchCount}`)
  if (!res.ok) throw new Error(`Yurippe API error: ${res.status}`)

  const rawQuotes: YurippeQuote[] = await res.json()
  const validQuotes = rawQuotes.filter(isValidQuote)

  const prepared: PreparedAnimeQuote[] = []

  for (const q of validQuotes) {
    if (prepared.length >= count) break

    const correctCharacter = q.character

    const malId = await searchAnimeId(q.show)
    if (malId === null) continue

    const characters = await fetchCharacters(malId, q.show)
    if (characters.length < 4) continue

    const matchedCorrect = characters.find((c) => c.name.toLowerCase() === correctCharacter.toLowerCase())
    const displayCorrect = matchedCorrect?.name ?? correctCharacter

    const decoys = pickDecoys(displayCorrect, characters, 3)
    if (decoys.length < 3) continue

    const choices = shuffleArray([displayCorrect, ...decoys])

    prepared.push({
      quote_text: q.quote,
      anime_name: q.show,
      correct_character: displayCorrect,
      choices,
    })
  }

  return prepared
}

export async function fetchSingleAnimeQuote(): Promise<PreparedAnimeQuote | null> {
  const results = await fetchAnimeQuotes(1)
  return results[0] ?? null
}
