'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Field, PrimaryBtn } from '@/components/ui/PageShell'

export default function AdminLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Login failed')

      const next = searchParams.get('next') || '/admin'
      router.push(next)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-wrap flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <span
            className="inline-flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
            style={{ background: 'var(--chip-active-bg)' }}
          >
            🔐
          </span>
          <h1 className="text-3xl font-black tracking-tight gradient-title">Admin login</h1>
          <p className="text-muted text-sm">Statistics and feedback for FateRound</p>
        </div>

        <div className="glass-card-strong p-6 space-y-4">
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              autoComplete="email"
              className="input-field w-full"
              placeholder="you@example.com"
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              autoComplete="current-password"
              className="input-field w-full"
            />
          </Field>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <PrimaryBtn onClick={submit} disabled={loading || !email || !password} className="w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  )
}
