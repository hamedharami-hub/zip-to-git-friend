import { memo } from "react";
import { Link } from "react-router-dom";
import { Film, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatDuration } from "@/lib/utils";
import type { Video } from "@/types";

interface Props {
  video: Video;
  onDelete: (id: string) => void | Promise<void>;
}

export const VideoCard = memo(function VideoCard({ video, onDelete }: Props) {
  const progressPct =
    video.duration > 0 ? Math.min(100, (video.lastPosition / video.duration) * 100) : 0;
  const hasProgress = video.lastPosition > 5 && video.duration > 0;

  return (
    <article className="group rounded-lg border border-border bg-card overflow-hidden flex flex-col transition-colors hover:border-primary/50">
      <Link
        to={`/player/${video.id}`}
        className="aspect-video bg-muted flex items-center justify-center overflow-hidden"
        aria-label={`Open ${video.title}`}
      >
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <Film className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        )}
      </Link>
      <div className="p-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link to={`/player/${video.id}`} className="block">
            <h3 className="font-medium truncate" title={video.title}>
              {video.title}
            </h3>
          </Link>
          <p className="text-xs text-muted-foreground truncate">
            {video.fileName} · {formatDuration(video.duration)}
            {hasProgress && (
              <>
                {" · "}
                <span className="text-primary">{formatDuration(video.lastPosition)}</span>
                {" / "}
                {formatDuration(video.duration)}
              </>
            )}
          </p>
          {video.duration > 0 && (
            <div className="mt-1.5 h-1 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>
        <ConfirmDialog
          title="Delete this video?"
          description={`"${video.title}" will be removed from your library. Subtitles and analyses for this video will also be deleted.`}
          confirmLabel="Delete"
          onConfirm={() => onDelete(video.id)}
          trigger={
            <Button size="icon" variant="ghost" aria-label={`Delete ${video.title}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          }
        />
      </div>
    </article>
  );
});
