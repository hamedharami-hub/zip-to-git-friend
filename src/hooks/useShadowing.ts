/**
 * useShadowing — recorder lifecycle for the Shadowing study mode.
 *
 * Owns: MediaRecorder instance, current preview URL of the latest take, takes
 * list for the active cue, recording elapsed time. The host component drives
 * "play original cue" by calling videoStore.requestSeek + auto-pause-at-cue-end.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { listTakes, saveTake } from '@/lib/shadowing';
import type { ShadowingTake } from '@/types';

interface UseShadowingArgs {
  videoId?: string;
  cueId?: string;
  refText: string;
  /** Called whenever recording starts so the host can pause the video. */
  onRecordingStart?: () => void;
}

export interface UseShadowingApi {
  isRecording: boolean;
  /** ms since recording started, updated ~10x/sec. */
  elapsedMs: number;
  /** Mic-permission / device errors — null when fine. */
  error: string | null;
  /** Past takes for the active cue (most recent first). */
  takes: ShadowingTake[];
  /** Refresh takes list from IndexedDB. */
  refresh: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => void;
  /** Cancel without saving the in-flight recording. */
  cancel: () => void;
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return '';
}

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export function useShadowing({
  videoId,
  cueId,
  refText,
  onRecordingStart,
}: UseShadowingArgs): UseShadowingApi {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [takes, setTakes] = useState<ShadowingTake[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!videoId || !cueId) {
      setTakes([]);
      return;
    }
    try {
      const list = await listTakes(videoId, cueId);
      setTakes(list);
    } catch {
      setTakes([]);
    }
  }, [videoId, cueId]);

  // Reload takes whenever cue changes.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
    streamRef.current = null;
    if (tickerRef.current !== null) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (isRecording) return;
    if (!videoId || !cueId) {
      setError('Pick a cue first.');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Microphone is not available in this browser.');
      return;
    }
    setError(null);
    cancelledRef.current = false;
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Microphone permission denied.';
      setError(msg);
      return;
    }
    streamRef.current = stream;

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (e) {
      cleanupStream();
      setError(e instanceof Error ? e.message : 'Recorder unavailable.');
      return;
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };

    recorder.onstop = async () => {
      const durationMs = Date.now() - startedAtRef.current;
      const finalMime = mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: finalMime });
      chunksRef.current = [];
      cleanupStream();
      setIsRecording(false);
      setElapsedMs(0);

      if (cancelledRef.current || blob.size === 0) {
        return;
      }
      try {
        await saveTake({
          id: uuid(),
          videoId,
          cueId,
          blob,
          durationMs,
          refText,
        });
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save take.');
      }
    };

    startedAtRef.current = Date.now();
    setIsRecording(true);
    setElapsedMs(0);
    onRecordingStart?.();
    try {
      recorder.start(250);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recorder failed to start.');
      cleanupStream();
      setIsRecording(false);
      return;
    }
    tickerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 100);
  }, [cleanupStream, cueId, isRecording, onRecordingStart, refText, refresh, videoId]);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    if (!r) return;
    if (r.state !== 'inactive') {
      try {
        r.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stop();
  }, [stop]);

  // Stop recording on unmount.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      const r = recorderRef.current;
      if (r && r.state !== 'inactive') {
        try {
          r.stop();
        } catch {
          /* ignore */
        }
      }
      cleanupStream();
    };
  }, [cleanupStream]);

  return { isRecording, elapsedMs, error, takes, refresh, start, stop, cancel };
}
