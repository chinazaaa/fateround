import type { Metadata } from 'next'
import Script from 'next/script'
import { Geist, Geist_Mono, Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ThemeInitScript } from '@/components/ThemeInitScript'
// Hidden for now — "Buy us a coffee" (support) and Feedback buttons.
// import { FeedbackButton } from '@/components/FeedbackButton'
// import { SupportButton } from '@/components/SupportButton'
import { NetworkIndicator } from '@/components/NetworkIndicator'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import { QueryProvider } from '@/components/QueryProvider'
import { AppBackground } from '@/components/AppBackground'
import { rootMetadata } from '@/lib/seo'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'], display: 'swap' })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'], display: 'swap' })

// Fate Round design-system fonts — scoped to the public/marketing pages via
// the `.fr-site` wrapper (see fate-round-ds.css). Declared here only as CSS
// variables so the rest of the app keeps its Geist body font.
const brandDisplay = Bricolage_Grotesque({
  variable: '--font-fr-display',
  subsets: ['latin'],
  display: 'swap',
  preload: true,
})
const brandBody = Instrument_Sans({ variable: '--font-fr-body', subsets: ['latin'], display: 'swap' })
const brandMono = JetBrains_Mono({ variable: '--font-fr-mono', subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = rootMetadata()

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Only load Google Analytics in a production build — never in local dev
  // (`pnpm dev`), so our own testing doesn't inflate the numbers. The Measurement
  // ID can be overridden via NEXT_PUBLIC_GA_ID (defaults to the live property).
  // To silence a staging/preview environment too, leave NEXT_PUBLIC_GA_ID unset
  // there and set NEXT_PUBLIC_ANALYTICS_DISABLED=1.
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_ID ?? 'G-HPGR3FN0HX'
  const analyticsEnabled =
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PUBLIC_ANALYTICS_DISABLED !== '1' &&
    Boolean(gaMeasurementId)

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${brandDisplay.variable} ${brandBody.variable} ${brandMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeInitScript />
      </head>
      <body className="min-h-full flex flex-col" style={{ color: 'var(--foreground)' }}>
        {analyticsEnabled && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaMeasurementId}');
        `}
            </Script>
          </>
        )}
        <ThemeProvider>
          <ToastProvider>
            <ConfirmProvider>
              <QueryProvider>
                <AppBackground />
                <NetworkIndicator />
                <ThemeToggle />
                {/* Hidden for now:
                <SupportButton />
                <FeedbackButton /> */}
                {children}
              </QueryProvider>
            </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
