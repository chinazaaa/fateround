export interface KlipyMediaItem {
  id: number
  slug: string
  title: string
  type: string
  blur_preview: string
  file: {
    hd?: { gif?: { url: string; width: number; height: number }; webp?: { url: string; width: number; height: number } }
    sm?: { gif?: { url: string; width: number; height: number }; webp?: { url: string; width: number; height: number } }
    xs?: { gif?: { url: string; width: number; height: number }; webp?: { url: string; width: number; height: number } }
  }
}

export interface KlipySearchResult {
  result: boolean
  data: {
    data: KlipyMediaItem[]
    current_page: number
    per_page: number
    has_next: boolean
  }
}

const KLIPY_BASE = 'https://api.klipy.com'

function getApiKey(): string {
  const key = process.env.KLIPY_API_KEY
  if (!key) throw new Error('KLIPY_API_KEY environment variable is not set')
  return key
}

export async function searchKlipyGifs(query: string, page = 1, perPage = 20): Promise<KlipySearchResult> {
  const key = getApiKey()
  const url = query.trim()
    ? `${KLIPY_BASE}/api/v1/${key}/gifs/search?q=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`
    : `${KLIPY_BASE}/api/v1/${key}/gifs/trending?page=${page}&per_page=${perPage}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Klipy API error: ${res.status}`)
  return res.json()
}

export async function searchKlipyStickers(query: string, page = 1, perPage = 20): Promise<KlipySearchResult> {
  const key = getApiKey()
  const url = query.trim()
    ? `${KLIPY_BASE}/api/v1/${key}/stickers/search?q=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`
    : `${KLIPY_BASE}/api/v1/${key}/stickers/trending?page=${page}&per_page=${perPage}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Klipy API error: ${res.status}`)
  return res.json()
}

export function getPreviewUrl(item: KlipyMediaItem): string {
  return item.file.sm?.webp?.url ?? item.file.sm?.gif?.url ?? item.file.xs?.gif?.url ?? ''
}

export function getFullUrl(item: KlipyMediaItem): string {
  return item.file.hd?.gif?.url ?? item.file.sm?.gif?.url ?? ''
}
