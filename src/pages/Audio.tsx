import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Upload,
  Settings as SettingsIcon,
  Headphones,
  Trash2,
  WifiOff,
  Play,
  ArrowLeft,
  Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getAllVideos,
  saveVideo,
  deleteVideo,
  saveVideoBlob,
  setAppState,
  getAppState,
} from '@/lib/db';
import type { Video } from '@/types';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { VideoGridSkeleton } from '@/components/VideoCardSkeleton';
import { InstallButton } from '@/components/pwa/InstallButton';
import { PWAInstallBanner } from '@/components/pwa/PWAInstallBanner';
import { EmptyState } from '@/components/EmptyState';
import { useOnline } from '@/hooks/useOnline';
import { AccountButton, SyncBadge } from '@/components/auth/AccountButton';
import { PodcastHeroDecor } from '@/components/audio/PodcastHeroDecor';
import { importLLP } from '@/lib/llpPack';
import { validateMediaFile } from '@/lib/fileValidation';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '@/components/PullToRefreshIndicator';

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

const Audio = () => {
  const [items, setItems] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastId, setLastId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const llpRef = useRef<HTMLInputElement>(null);
  const online = useOnline();
  const navigate = useNavigate();

  const handleImportLLP = async (file: File) => {
    const v = validateMediaFile(file, 'llp');
    if (!v.ok) {
      toast.error(v.reason ?? 'Invalid pack file.');
      return;
    }
    try {
      const result = await importLLP(file);
      toast.success(
        `Imported "${result.title}" — ${result.tracks} track(s), ${result.analyses} analyses, ${result.leitnerCards} cards.`,
      );
      await setAppState('lastAudioId', result.videoId);
      await setAppState('lastVideoId', result.videoId);
      navigate(`/player/${result.videoId}`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to import .llp pack.');
    }
  };

  const ptr = usePullToRefresh({
    onRefresh: async () => {
      await refresh();
      toast.success('Library refreshed.');
    },
  });

  const refresh = async () => {
    const all = await getAllVideos();
    const audioOnly = all.filter((v) => v.mediaType === 'audio');
    setItems(audioOnly.sort((a, b) => b.createdAt - a.createdAt));
    const last = await getAppState<string>('lastAudioId');
    setLastId(last);
    setLoading(false);
  };

  useEffect(() => {
    document.title = 'Audio Library — Language Learning Player';
    refresh();
  }, []);

  const handleUpload = async (file: File) => {
    const v = validateMediaFile(file, 'audio');
    if (!v.ok) {
      toast.error(v.reason ?? 'Invalid audio file.');
      return;
    }
    const id = uuid();
    const blobUrl = URL.createObjectURL(file);
    const duration = await new Promise<number>((resolve) => {
      const a = document.createElement('audio');
      a.preload = 'metadata';
      a.src = blobUrl;
      a.onloadedmetadata = () => resolve(a.duration || 0);
      a.onerror = () => resolve(0);
    });

    const item: Video = {
      id,
      title: file.name.replace(/\.[^.]+$/, ''),
      fileName: file.name,
      blobUrl,
      duration,
      lastPosition: 0,
      volume: 1,
      playbackSpeed: 1,
      createdAt: Date.now(),
      mediaType: 'audio',
      mimeType: file.type || 'audio/mpeg',
    };
    try {
      await saveVideoBlob(id, file);
    } catch (e) {
      console.error('Failed to persist audio blob', e);
      toast.warning('Could not cache audio file. You may need to re-attach after reload.');
    }
    await saveVideo(item);
    await setAppState('lastAudioId', id);
    await setAppState('lastVideoId', id);
    toast.success('Audio added — opening player.');
    navigate(`/player/${id}`);
  };

  const handleDelete = async (id: string) => {
    await deleteVideo(id);
    if (lastId === id) {
      await setAppState('lastAudioId', null);
      setLastId(null);
    }
    toast.success('Audio deleted.');
    refresh();
  };

  const lastItem = useMemo(
    () => (lastId ? items.find((v) => v.id === lastId) ?? null : null),
    [lastId, items],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold flex items-center gap-2 min-w-0">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" aria-label="Back to library" />
            </Link>
            <Headphones className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            <span className="truncate">Audio & Podcasts</span>
          </h1>
          <div className="flex items-center gap-2">
            {!online && (
              <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground">
                <WifiOff className="h-3.5 w-3.5" /> offline
              </span>
            )}
            <InstallButton />
            <AccountButton />
            <Link to="/settings">
              <Button variant="ghost" size="icon" aria-label="Settings">
                <SettingsIcon className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <PullToRefreshIndicator progress={ptr.progress} refreshing={ptr.refreshing} />

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <PWAInstallBanner />
        <PodcastHeroDecor />
        <section className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-semibold">Your audio library</h2>
            <p className="text-sm text-muted-foreground inline-flex items-center gap-2 flex-wrap">
              <span>Upload MP3 / M4A / WAV / podcast episodes. Files stay on your device.</span>
              <SyncBadge />
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = '';
            }}
            aria-label="Upload audio file"
          />
          <input
            ref={llpRef}
            type="file"
            accept=".llp,application/octet-stream,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportLLP(f);
              e.target.value = '';
            }}
            aria-label="Import .llp pack"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => llpRef.current?.click()}
              aria-label="Import language learning pack"
            >
              <Package className="h-4 w-4 mr-2" aria-hidden="true" />
              Import .llp
            </Button>
            <Button onClick={() => fileRef.current?.click()} aria-label="Upload audio">
              <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
              Upload audio
            </Button>
          </div>
        </section>

        {lastItem && (
          <section>
            <Link
              to={`/player/${lastItem.id}`}
              className="rounded-lg border border-primary/40 bg-primary/5 p-4 flex items-center gap-3 hover:border-primary transition-colors focus-visible:border-primary"
            >
              <div className="h-10 w-10 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Play className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Continue listening</p>
                <p className="font-semibold truncate">{lastItem.title}</p>
                <p className="text-xs text-muted-foreground">
                  Resume from {formatDur(lastItem.lastPosition)} ·{' '}
                  {formatDur(lastItem.duration)} total
                </p>
              </div>
            </Link>
          </section>
        )}

        {loading ? (
          <VideoGridSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            tone="audio"
            icon={<Headphones className="h-7 w-7" aria-hidden="true" />}
            title="No audio yet"
            description="Upload your first podcast, lesson, or audiobook chapter and start learning by ear."
            action={
              <Button onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
                Upload audio
              </Button>
            }
            secondaryAction={
              <Button variant="outline" onClick={() => llpRef.current?.click()}>
                <Package className="h-4 w-4 mr-2" aria-hidden="true" />
                Import .llp
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((v) => (
              <article
                key={v.id}
                className="group rounded-lg border border-border bg-card overflow-hidden flex flex-col transition-colors hover:border-primary/50"
              >
                <Link
                  to={`/player/${v.id}`}
                  className="aspect-[5/2] bg-gradient-to-br from-primary/30 via-card to-card flex items-center justify-center"
                  aria-label={`Open ${v.title}`}
                >
                  <Headphones className="h-10 w-10 text-primary" aria-hidden="true" />
                </Link>
                <div className="p-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to={`/player/${v.id}`} className="block">
                      <h3 className="font-medium truncate" title={v.title}>
                        {v.title}
                      </h3>
                    </Link>
                    <p className="text-xs text-muted-foreground truncate">
                      {v.fileName} · {formatDur(v.duration)}
                    </p>
                  </div>
                  <ConfirmDialog
                    title="Delete this audio?"
                    description={`"${v.title}" will be removed. Subtitles and analyses will also be deleted.`}
                    confirmLabel="Delete"
                    onConfirm={() => handleDelete(v.id)}
                    trigger={
                      <Button size="icon" variant="ghost" aria-label={`Delete ${v.title}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    }
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

function formatDur(s: number) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default Audio;
