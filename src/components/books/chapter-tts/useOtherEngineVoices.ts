/**
 * Persisted voice selections for the "other" online TTS engines
 * (Azure / Hugging Face / Play.ht / OpenTTS).
 */
import { useEffect, useState } from 'react';
import { AZURE_VOICES } from '@/lib/azureTts';
import { HUGGINGFACE_VOICES } from '@/lib/huggingFaceTts';
import { PLAYHT_VOICES } from '@/lib/playHtTts';

const AZURE_KEY = 'llvp-tts-azure-voice';
const HF_KEY = 'llvp-tts-hf-voice';
const PLAYHT_KEY = 'llvp-tts-playht-voice';
const OPENTTS_KEY = 'llvp-tts-opentts-voice';

export interface OtherEngineVoices {
  azureVoiceOpts: typeof AZURE_VOICES;
  hfVoiceOpts: typeof HUGGINGFACE_VOICES;
  playHtVoiceOpts: typeof PLAYHT_VOICES;
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
  const azureVoiceOpts = AZURE_VOICES.filter((v) => v.lang === ttsLang);
  const hfVoiceOpts = HUGGINGFACE_VOICES.filter((v) => v.lang === ttsLang);
  const playHtVoiceOpts = PLAYHT_VOICES;

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
    const inList = azureVoiceOpts.some((v) => v.id === azureVoice);
    const v = azureVoiceOpts[0]?.id;
    if ((!azureVoice || !inList) && v) setAzureVoice(v);
  }, [azureVoiceOpts, azureVoice]);
  useEffect(() => {
    const inList = hfVoiceOpts.some((v) => v.id === hfVoice);
    const v = hfVoiceOpts[0]?.id;
    if ((!hfVoice || !inList) && v) setHfVoice(v);
  }, [hfVoiceOpts, hfVoice]);

  useEffect(() => { try { if (azureVoice) localStorage.setItem(AZURE_KEY, azureVoice); } catch { /* */ } }, [azureVoice]);
  useEffect(() => { try { if (hfVoice) localStorage.setItem(HF_KEY, hfVoice); } catch { /* */ } }, [hfVoice]);
  useEffect(() => { try { localStorage.setItem(PLAYHT_KEY, playHtVoice); } catch { /* */ } }, [playHtVoice]);
  useEffect(() => { try { localStorage.setItem(OPENTTS_KEY, openTtsVoice); } catch { /* */ } }, [openTtsVoice]);

  return {
    azureVoiceOpts, hfVoiceOpts, playHtVoiceOpts,
    azureVoice, setAzureVoice,
    hfVoice, setHfVoice,
    playHtVoice, setPlayHtVoice,
    openTtsVoice, setOpenTtsVoice,
  };
}
