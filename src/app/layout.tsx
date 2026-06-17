import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Geist, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { FeedbackButton } from '@/components/FeedbackButton'
import { SupportButton } from '@/components/SupportButton'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import { QueryProvider } from '@/components/QueryProvider'
import { AppBackground } from '@/components/AppBackground'
import { rootMetadata } from '@/lib/seo'
import { parseThemeCookie, THEME_COOKIE } from '@/lib/theme-cookie'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = rootMetadata()

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const theme = parseThemeCookie(cookieStore.get(THEME_COOKIE)?.value)

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-theme={theme}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" style={{ color: 'var(--foreground)' }}>
        <ThemeProvider initialTheme={theme}>
          <ToastProvider>
            <ConfirmProvider>
              <QueryProvider>
                <AppBackground />
                <ThemeToggle />
                <SupportButton />
                <FeedbackButton />
                {children}
              </QueryProvider>
            </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
