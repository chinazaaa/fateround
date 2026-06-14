'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const isLogin = pathname === '/admin/login'

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin/login')
    router.refresh()
  }

  if (isLogin) {
    return <div className="min-h-screen">{children}</div>
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--card-strong)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-lg font-black tracking-tight gradient-title">
              Admin
            </Link>
            <nav className="flex items-center gap-2 text-sm">
              <AdminNavLink href="/admin" active={pathname === '/admin'}>
                Statistics
              </AdminNavLink>
              <AdminNavLink href="/admin/feedback" active={pathname === '/admin/feedback'}>
                Feedback
              </AdminNavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="btn-ghost text-sm">
              Site
            </Link>
            <button type="button" onClick={logout} className="btn-secondary text-sm px-4 py-2">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}

function AdminNavLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
        active ? 'chip-active' : 'text-muted hover:text-[var(--foreground)]'
      }`}
    >
      {children}
    </Link>
  )
}
