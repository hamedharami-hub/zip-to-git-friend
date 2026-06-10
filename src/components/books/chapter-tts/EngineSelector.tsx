/**
 * Compact engine dropdown for the chapter TTS player header.
 * Extracted from ChapterTTSPlayer to shrink that file.
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Engine } from './constants';

const OPTIONS: ReadonlyArray<{ id: Engine; label: string }> = [
  { id: 'browser', label: 'Browser' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'elevenlabs', label: 'ElevenLabs' },
  { id: 'azure', label: 'Azure' },
  { id: 'huggingface', label: 'HF' },
  { id: 'playht', label: 'Play.ht' },
  { id: 'opentts', label: 'OpenTTS' },
];

interface Props {
  engine: Engine;
  onChange: (e: Engine) => void;
  browserSupported: boolean;
}

export function EngineSelector({ engine, onChange, browserSupported }: Props) {
  return (
    <Select value={engine} onValueChange={(v) => onChange(v as Engine)}>
      <SelectTrigger className="h-7 w-[120px] text-[11px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((t) => (
          <SelectItem
            key={t.id}
            value={t.id}
            disabled={t.id === 'browser' && !browserSupported}
          >
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
