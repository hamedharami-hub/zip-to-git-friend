interface Props {
  progress: number;
  refreshing: boolean;
}

/** Tiny presentational indicator that pairs with usePullToRefresh. */
export function PullToRefreshIndicator({ progress, refreshing }: Props) {
  if (!refreshing && progress <= 0) return null;
  const opacity = refreshing ? 1 : Math.min(1, progress);
  return (
    <div
      className="fixed top-0 left-1/2 -translate-x-1/2 z-50 mt-2 select-none pointer-events-none"
      style={{ opacity }}
      aria-hidden="true"
    >
      <div className="rounded-full bg-card border border-border shadow px-3 py-1.5 text-xs text-muted-foreground inline-flex items-center gap-2">
        <span
          className={
            'inline-block h-3 w-3 rounded-full border-2 border-primary border-t-transparent ' +
            (refreshing ? 'animate-spin' : '')
          }
          style={refreshing ? undefined : { transform: `rotate(${progress * 360}deg)` }}
        />
        {refreshing ? 'Refreshing…' : 'Pull to refresh'}
      </div>
    </div>
  );
}
