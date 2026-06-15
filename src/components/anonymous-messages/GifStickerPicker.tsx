'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KlipyMediaItem } from '@/lib/klipy'

interface GifStickerPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (mediaUrl: string) => void
}

type Tab = 'gifs' | 'stickers'

export function GifStickerPicker({ open, onClose, onSelect }: GifStickerPickerProps) {
  const [tab, setTab] = useState<Tab>('gifs')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<KlipyMediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchItems = useCallback(async (q: string, type: Tab) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/klipy?type=${type}&q=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setItems(data.data?.data ?? [])
    } catch {
      setError("Couldn't load — try again")
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    fetchItems('', tab)
  }, [open, tab, fetchItems])

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchItems(query, tab), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open, tab, fetchItems])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, onClose])

  if (!open) return null

  function getPreviewUrl(item: KlipyMediaItem): string {
    return item.file.sm?.webp?.url ?? item.file.sm?.gif?.url ?? item.file.xs?.gif?.url ?? ''
  }

  function getFullUrl(item: KlipyMediaItem): string {
    return item.file.hd?.gif?.url ?? item.file.sm?.gif?.url ?? ''
  }

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full mb-2 left-0 right-0 z-50 w-full glass-card-strong border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
      style={{ maxHeight: 'min(52vh, 420px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              setTab('gifs')
              setQuery('')
            }}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'gifs' ? 'bg-violet-500/20 text-violet-300' : 'text-muted hover:text-body'
            }`}
          >
            GIFs
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('stickers')
              setQuery('')
            }}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              tab === 'stickers' ? 'bg-violet-500/20 text-violet-300' : 'text-muted hover:text-body'
            }`}
          >
            Stickers
          </button>
        </div>
        <button type="button" onClick={onClose} className="text-faint hover:text-body text-xl px-2" aria-label="Close">
          ×
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${tab}…`}
          className="input-field w-full"
        />
      </div>

      {/* Grid */}
      <div className="px-3 pb-3 overflow-y-auto" style={{ maxHeight: 'min(38vh, 300px)' }}>
        {loading && items.length === 0 && (
          <div className="text-center py-8">
            <div className="animate-spin h-5 w-5 border-2 border-violet-400 border-t-transparent rounded-full mx-auto" />
          </div>
        )}
        {error && (
          <div className="text-center py-6 space-y-2">
            <p className="text-red-400 text-sm">{error}</p>
            <button type="button" onClick={() => fetchItems(query, tab)} className="text-xs text-violet-300 underline">
              Try again
            </button>
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="text-muted text-sm text-center py-6">No results found</p>
        )}
        {items.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
            {items.map((item) => {
              const preview = getPreviewUrl(item)
              const full = getFullUrl(item)
              if (!preview || !full) return null
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(full)
                    onClose()
                  }}
                  className="rounded-xl overflow-hidden border border-white/10 hover:border-violet-400/50 transition-colors aspect-square bg-black/20 min-h-[72px] sm:min-h-[88px]"
                >
                  <img
                    src={preview}
                    alt={item.title}
                    loading="lazy"
                    className={`w-full h-full ${tab === 'stickers' ? 'object-contain p-1' : 'object-cover'}`}
                    style={{ background: `url(${item.blur_preview}) center/cover` }}
                  />
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-white/10 text-center">
        <p className="text-faint text-[9px]">Powered by Klipy</p>
      </div>
    </div>
  )
}
