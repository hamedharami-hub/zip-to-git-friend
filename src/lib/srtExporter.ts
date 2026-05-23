import type { SegmentAnalysis, SubtitleCue, SubtitleTrack, Video } from '@/types';
import {
  getAllVideos,
  getTracks,
  saveTrack,
  saveVideo,
  getVideo,
  getAllAnalysisForVideo,
  saveAnalysis,
} from '@/lib/db';

function pad(n: number, w = 2) {
  return n.toString().padStart(w, '0');
}

function msToTs(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mm = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(mm, 3)}`;
}

export function trackToSRT(cues: SubtitleCue[]): string {
  return cues
    .map(
      (c, i) =>
        `${i + 1}\n${msToTs(c.startMs)} --> ${msToTs(c.endMs)}\n${c.text}\n`,
    )
    .join('\n');
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportTrackSRT(track: SubtitleTrack, baseName: string) {
  const srt = trackToSRT(track.cues);
  downloadFile(`${baseName}.${track.role}.${track.language}.srt`, srt, 'text/plain');
}

export interface ExportBundle {
  schema: 'llvp.bundle.v1';
  exportedAt: number;
  videos: Array<{
    video: Omit<Video, 'blobUrl'>;
    tracks: SubtitleTrack[];
    analyses: Array<{ cueId: string; analysis: SegmentAnalysis }>;
  }>;
}

export async function buildExportBundle(videoId?: string): Promise<ExportBundle> {
  const videos = videoId
    ? [await getVideo(videoId)].filter(Boolean) as Video[]
    : await getAllVideos();
  const out: ExportBundle = {
    schema: 'llvp.bundle.v1',
    exportedAt: Date.now(),
    videos: [],
  };
  for (const v of videos) {
    const tracks = await getTracks(v.id);
    const analyses = await getAllAnalysisForVideo(v.id);
    const { blobUrl: _b, ...meta } = v;
    out.videos.push({ video: meta, tracks, analyses });
  }
  return out;
}

export async function exportBundleToFile(videoId?: string, name = 'llvp-export') {
  const bundle = await buildExportBundle(videoId);
  downloadFile(`${name}.json`, JSON.stringify(bundle, null, 2), 'application/json');
}

export async function importBundleFromFile(file: File): Promise<{
  videos: number;
  tracks: number;
  analyses: number;
}> {
  const text = await file.text();
  const data = JSON.parse(text) as ExportBundle;
  if (!data || data.schema !== 'llvp.bundle.v1' || !Array.isArray(data.videos)) {
    throw new Error('Unrecognized export file.');
  }
  let videos = 0;
  let tracks = 0;
  let analyses = 0;

  for (const entry of data.videos) {
    const existing = await getVideo(entry.video.id);
    const merged: Video = {
      ...entry.video,
      blobUrl: existing?.blobUrl ?? '',
      lastPosition: existing?.lastPosition ?? entry.video.lastPosition ?? 0,
      volume: existing?.volume ?? entry.video.volume ?? 1,
      playbackSpeed: existing?.playbackSpeed ?? entry.video.playbackSpeed ?? 1,
    };
    await saveVideo(merged);
    videos++;
    for (const t of entry.tracks ?? []) {
      await saveTrack(t);
      tracks++;
    }
    for (const a of entry.analyses ?? []) {
      await saveAnalysis(entry.video.id, a.cueId, a.analysis);
      analyses++;
    }
  }
  return { videos, tracks, analyses };
}
