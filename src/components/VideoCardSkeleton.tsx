import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton tile matching the video card layout used on Home. */
export function VideoCardSkeleton() {
  return (
    <article className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </article>
  );
}

export function VideoGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <VideoCardSkeleton key={i} />
      ))}
    </div>
  );
}
