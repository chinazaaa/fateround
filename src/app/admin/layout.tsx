'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const NAV: { href: string; label: string; icon: string; exact?: boolean }[] = [
  { href: '/admin', label: 'Statistics', icon: '📊', exact: true },
  { href: '/admin/feedback', label: 'Feedback', icon: '💬' },
  { href: '/admin/updates', label: "What's new", icon: '📣' },
  { href: '/admin/blog', label: 'Blog', icon: '✍️' },
  { href: '/admin/settings', label: 'Game limits', icon: '🎚️' },
  { href: '/admin/library', label: 'Library', icon: '📚' },
  { href: '/admin/themes', label: 'Themes', icon: '🎨' },
  { href: '/admin/landmine-categories', label: 'Landmine', icon: '🧨' },
  { href: '/admin/platform-content', label: 'Platform', icon: '🗂️' },
  { href: '/admin/community', label: 'Community', icon: '👥' },
]

const STORAGE_KEY = 'admin-sidebar-collapsed'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const isLogin = pathname === '/admin/login'

  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === '1')
  }, [])
  const toggle = () => {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin/login')
    router.refresh()
  }

  if (isLogin) {
    return <div className="min-h-screen">{children}</div>
  }

  const isActive = (item: (typeof NAV)[number]) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/')

  return (
    <div className="flex min-h-screen">
      <aside
        className={`sticky top-0 z-40 flex h-screen shrink-0 flex-col border-r border-[var(--border)] bg-[var(--card-strong)] transition-[width] duration-200 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        {/* Brand + collapse toggle */}
        <div
          className={`flex h-16 items-center border-b border-[var(--border)] ${collapsed ? 'justify-center px-0' : 'justify-between px-4'}`}
        >
          {!collapsed && (
            <Link href="/admin" className="text-lg font-black tracking-tight gradient-title">
              Admin
            </Link>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand' : 'Collapse'}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {NAV.map((item) => {
            const active = isActive(item)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
                  collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2'
                } ${
                  active
                    ? 'bg-[var(--chip-active-bg)] text-[var(--chip-active-text)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]'
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Footer actions */}
        <div className="space-y-1 border-t border-[var(--border)] p-2">
          <Link
            href="/"
            title={collapsed ? 'Site' : undefined}
            className={`flex items-center rounded-lg text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)] ${
              collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2'
            }`}
          >
            <span className="text-base leading-none">🏠</span>
            {!collapsed && <span>Site</span>}
          </Link>
          <button
            type="button"
            onClick={logout}
            title={collapsed ? 'Log out' : undefined}
            className={`flex w-full items-center rounded-lg text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)] ${
              collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2'
            }`}
          >
            <span className="text-base leading-none">⏻</span>
            {!collapsed && <span>Log out</span>}
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}
