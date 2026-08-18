import { cn } from '../../lib/cn'

/** Shimmer placeholder.
 *
 *  Skeletons instead of a "Loading…" string because they reserve the real
 *  layout — the old build shifted every element down when data arrived, which
 *  is both jarring and a Core Web Vitals (CLS) hit. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded-lg bg-surface-2', className)}
      style={{
        backgroundImage:
          'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--ink) 6%, transparent) 50%, transparent 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s ease-in-out infinite',
      }}
    />
  )
}

/** Mirrors the real dashboard layout so nothing jumps when data lands. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-2.5">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
      </div>
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
      <span className="sr-only">Loading dashboard…</span>
    </div>
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-[4.5rem] rounded-2xl" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  )
}
