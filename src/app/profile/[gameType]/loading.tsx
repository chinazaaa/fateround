import { Skeleton } from '@/components/Skeleton'

/**
 * Route-level fallback for one game's trophy list, mirroring the page's own layout so the swap to
 * real content is stable. See ../loading.tsx.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6" aria-busy="true">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-48" />
      <div className="glass-card p-5">
        <div className="flex items-center justify-around gap-4">
          <Skeleton className="h-14 w-16" />
          <Skeleton className="h-20 w-20 rounded-full" />
          <Skeleton className="h-14 w-16" />
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <span className="sr-only">Loading trophies…</span>
    </div>
  )
}
