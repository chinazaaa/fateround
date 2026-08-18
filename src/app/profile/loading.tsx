import { Skeleton } from '@/components/Skeleton'

/**
 * Route-level fallback shown while the profile route segment loads (its JS chunk + first paint),
 * before the client page mounts and runs its own fetch. Gives the click immediate feedback instead
 * of leaving the previous screen frozen.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6" aria-busy="true">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <span className="sr-only">Loading your profile…</span>
    </div>
  )
}
