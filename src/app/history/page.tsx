'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageShell } from '@/components/ui/PageShell'

export default function HistorySearchPage() {
  const router = useRouter()
  const [code, setCode] = useState('')

  const search = () => {
    const c = code.trim().toUpperCase()
    if (c.length >= 4) router.push(`/history/${c}`)
  }

  return (
    <PageShell centered narrow>
      <div className="text-center space-y-2">
        <span
          className="inline-flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
          style={{ background: 'var(--chip-active-bg)' }}
        >
          📜
        </span>
        <h1 className="text-3xl font-black tracking-tight gradient-title">Game history</h1>
        <p className="text-muted text-sm">Look up past games by game code</p>
      </div>

      <div className="glass-card-strong p-6 space-y-4">
        <label className="block space-y-2">
          <span className="label-caps">Game ID</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="ABC123"
            maxLength={6}
            autoFocus
            className="input-field w-full text-center text-xl tracking-[0.25em] font-mono font-bold"
          />
        </label>
        <button type="button" onClick={search} disabled={code.length < 4} className="btn-primary w-full">
          View history
        </button>
      </div>

      <p className="text-center">
        <Link href="/" className="text-faint text-sm hover:text-[var(--foreground)] transition-colors">
          Back home
        </Link>
      </p>
    </PageShell>
  )
}
