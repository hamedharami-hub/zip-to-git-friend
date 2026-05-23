import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton that mimics the Player layout so the route swap feels instant. */
export function PlayerSkeleton() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4">
        {/* Video stage */}
        <Skeleton className="aspect-video w-full rounded-xl" />
        {/* Subtitle row */}
        <div className="space-y-2">
          <Skeleton className="h-5 w-3/4 mx-auto" />
          <Skeleton className="h-4 w-1/2 mx-auto" />
        </div>
        {/* Cue list */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
