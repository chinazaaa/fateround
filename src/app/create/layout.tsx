import type { Metadata } from 'next'
import { createMetadata } from '@/lib/seo'

export const metadata: Metadata = createMetadata()

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return children
}
