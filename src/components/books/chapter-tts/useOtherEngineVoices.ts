/**
 * Persisted voice selections for the "other" online TTS engines
 * (Edge TTS / Azure / Hugging Face / Play.ht / OpenTTS).
 */
import { useEffect, useState } from 'react';
import { AZURE_VOICES } from '@/lib/azureTts';
import { EDGE_TTS_VOICES } from '@/lib/edgeTts';
import { HUGGINGFACE_VOICES } from '@/lib/huggingFaceTts';
import { PLAYHT_VOICES } from '@/lib/playHtTts';

const EDGE_KEY = 'llvp-tts-edge-voice';
const AZURE_KEY = 'llvp-tts-azure-voice';
const HF_KEY = 'llvp-tts-hf-voice';
const PLAYHT_KEY = 'llvp-tts-playht-voice';
const OPENTTS_KEY = 'llvp-tts-opentts-voice';

export interface OtherEngineVoices {
  edgeTtsVoiceOpts: typeof EDGE_TTS_VOICES;
  azureVoiceOpts: typeof AZURE_VOICES;
  hfVoiceOpts: typeof HUGGINGFACE_VOICES;
  playHtVoiceOpts: typeof PLAYHT_VOICES;
  edgeTtsVoice: string;
  setEdgeTtsVoice: (v: string) => void;
  azureVoice: string;
  setAzureVoice: (v: string) => void;
  hfVoice: string;
  setHfVoice: (v: string) => void;
  playHtVoice: string;
  setPlayHtVoice: (v: string) => void;
  openTtsVoice: string;
  setOpenTtsVoice: (v: string) => void;
}

export function useOtherEngineVoices(ttsLang: 'en' | 'fa'): OtherEngineVoices {
  const edgeTtsVoiceOpts = EDGE_TTS_VOICES.filter((v) => v.lang === ttsLang);
  const azureVoiceOpts = AZURE_VOICES.filter((v) => v.lang === ttsLang);
  const hfVoiceOpts = HUGGINGFACE_VOICES.filter((v) => v.lang === ttsLang);
  const playHtVoiceOpts = PLAYHT_VOICES;

  const [edgeTtsVoice, setEdgeTtsVoice] = useState<string>(() => {
    try { return localStorage.getItem(EDGE_KEY) || ''; } catch { return ''; }
  });
  const [azureVoice, setAzureVoice] = useState<string>(() => {
    try { return localStorage.getItem(AZURE_KEY) || ''; } catch { return ''; }
  });
  const [hfVoice, setHfVoice] = useState<string>(() => {
    try { return localStorage.getItem(HF_KEY) || ''; } catch { return ''; }
  });
  const [playHtVoice, setPlayHtVoice] = useState<string>(() => {
    try { return localStorage.getItem(PLAYHT_KEY) || PLAYHT_VOICES[0].id; }
    catch { return PLAYHT_VOICES[0].id; }
  });
  const [openTtsVoice, setOpenTtsVoice] = useState<string>(() => {
    try {
      return (
        localStorage.getItem(OPENTTS_KEY) ||
        (ttsLang === 'fa' ? 'coqui-tts:fa_custom' : 'larynx:en-us/ek-glow_tts')
      );
    } catch { return 'larynx:en-us/ek-glow_tts'; }
  });

  // Reset/auto-pick when language changes or no value is set yet.
  useEffect(() => {
    const inList = edgeTtsVoiceOpts.some((v) => v.id === edgeTtsVoice);
    if (!inList) {
      const v = edgeTtsVoiceOpts[0]?.id;
      if (v) setEdgeTtsVoice(v);
    }
  }, [edgeTtsVoiceOpts, edgeTtsVoice]);
  useEffect(() => { const v = azureVoiceOpts[0]?.id; if (!azureVoice && v) setAzureVoice(v); }, [azureVoiceOpts, azureVoice]);
  useEffect(() => { const v = hfVoiceOpts[0]?.id; if (!hfVoice && v) setHfVoice(v); }, [hfVoiceOpts, hfVoice]);

  useEffect(() => { try { if (edgeTtsVoice) localStorage.setItem(EDGE_KEY, edgeTtsVoice); } catch { /* */ } }, [edgeTtsVoice]);
  useEffect(() => { try { if (azureVoice) localStorage.setItem(AZURE_KEY, azureVoice); } catch { /* */ } }, [azureVoice]);
  useEffect(() => { try { if (hfVoice) localStorage.setItem(HF_KEY, hfVoice); } catch { /* */ } }, [hfVoice]);
  useEffect(() => { try { localStorage.setItem(PLAYHT_KEY, playHtVoice); } catch { /* */ } }, [playHtVoice]);
  useEffect(() => { try { localStorage.setItem(OPENTTS_KEY, openTtsVoice); } catch { /* */ } }, [openTtsVoice]);

  return {
    edgeTtsVoiceOpts, azureVoiceOpts, hfVoiceOpts, playHtVoiceOpts,
    edgeTtsVoice, setEdgeTtsVoice,
    azureVoice, setAzureVoice,
    hfVoice, setHfVoice,
    playHtVoice, setPlayHtVoice,
    openTtsVoice, setOpenTtsVoice,
  };
}
