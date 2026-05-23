import { memo, useEffect, useMemo } from 'react';
import { List, useListRef, type RowComponentProps } from 'react-window';
import type { SubtitleCue } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  cues: SubtitleCue[];
  /** Active cue id, used for highlighting + scroll-into-view. */
  activeCueId?: string | null;
  onJump?: (cue: SubtitleCue) => void;
  height?: number;
}

const ROW_HEIGHT = 56;
const VIRTUALIZE_THRESHOLD = 200;

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface RowData {
  cues: SubtitleCue[];
  activeCueId?: string | null;
  onJump?: (cue: SubtitleCue) => void;
}

function CueRow({
  cue,
  active,
  style,
  onJump,
}: {
  cue: SubtitleCue;
  active: boolean;
  style?: React.CSSProperties;
  onJump?: (cue: SubtitleCue) => void;
}) {
  return (
    <button
      type="button"
      style={style}
      onClick={() => onJump?.(cue)}
      className={cn(
        'w-full text-left px-3 py-2 text-sm border-b border-border/50 transition-colors flex gap-3 items-start',
        active
          ? 'bg-primary/10 text-foreground'
          : 'hover:bg-muted/50 focus-visible:bg-muted/50',
      )}
      aria-current={active ? 'true' : undefined}
      aria-label={`Jump to cue at ${formatTime(cue.startMs)}`}
    >
      <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-12 pt-0.5">
        {formatTime(cue.startMs)}
      </span>
      <span className="line-clamp-2 flex-1">{cue.text}</span>
    </button>
  );
}

function VirtualRow({
  index,
  style,
  cues,
  activeCueId,
  onJump,
}: RowComponentProps<RowData>) {
  const cue = cues[index];
  return <CueRow cue={cue} active={activeCueId === cue.id} style={style} onJump={onJump} />;
}

/**
 * Renders a list of subtitle cues. Uses react-window virtualization when
 * the cue count exceeds 200 (per spec section 12 performance note).
 */
export const SubtitleCueList = memo(function SubtitleCueList({
  cues,
  activeCueId,
  onJump,
  height = 360,
}: Props) {
  const listRef = useListRef(null);
  const rowProps = useMemo<RowData>(
    () => ({ cues, activeCueId, onJump }),
    [cues, activeCueId, onJump],
  );

  // Auto-scroll active cue into view (virtualized list).
  useEffect(() => {
    if (!activeCueId || cues.length <= VIRTUALIZE_THRESHOLD) return;
    const idx = cues.findIndex((c) => c.id === activeCueId);
    if (idx >= 0) listRef.current?.scrollToRow({ index: idx, align: 'smart' });
  }, [activeCueId, cues, listRef]);

  if (cues.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">No cues to show.</p>
    );
  }

  if (cues.length > VIRTUALIZE_THRESHOLD) {
    return (
      <div className="rounded border border-border" style={{ height }}>
        <List
          listRef={listRef}
          rowComponent={VirtualRow}
          rowCount={cues.length}
          rowHeight={ROW_HEIGHT}
          rowProps={rowProps}
          overscanCount={4}
          style={{ height: '100%' }}
        />
      </div>
    );
  }

  // Small list: regular DOM with native auto-scroll.
  return (
    <div
      className="overflow-y-auto rounded border border-border"
      style={{ maxHeight: height }}
    >
      {cues.map((cue) => (
        <CueRow
          key={cue.id}
          cue={cue}
          active={activeCueId === cue.id}
          onJump={onJump}
        />
      ))}
    </div>
  );
});
