import type { AIModelChoice, AppSettings, SegmentAnalysis } from '@/types';
import { analyzeSegment as geminiAnalyze, analyzeSegmentsBatch as geminiAnalyzeBatch, quickTranslate as geminiTranslate, GeminiError } from './gemini';
import { analyzeSegmentGroq, analyzeSegmentsBatchGroq, quickTranslateGroq, GroqChatError } from './groqChat';
import { aiLimiter } from './rateLimit';

/** Recommended cues per request, per provider. Gemini handles huge context — Groq is tighter. */
export function batchSizeFor(provider: 'gemini' | 'groq'): number {
  return provider === 'gemini' ? 20 : 8;
}

/**
 * Analyze MANY cues in a SINGLE upstream request. Returns a Map keyed by cue id.
 * Cues missing from the model response are simply absent — caller should retry
 * them individually with runAnalyze().
 */
export async function runAnalyzeBatch(
  cues: Array<{ id: string; text: string }>,
  choice: AIModelChoice,
  settings: AppSettings,
): Promise<Map<string, SegmentAnalysis>> {
  return aiLimiter.run(async () => {
    try {
      if (choice.provider === 'gemini') {
        return await geminiAnalyzeBatch(cues, settings.geminiApiKey, choice.model);
      }
      return await analyzeSegmentsBatchGroq(cues, settings.groqApiKey, choice.model);
    } catch (e) {
      throw wrap(e, choice.provider);
    }
  });
}

export class AIError extends Error {
  code: 'missing_key' | 'rate_limit' | 'auth' | 'invalid_response' | 'network' | 'unknown';
  provider: 'gemini' | 'groq';
  constructor(provider: 'gemini' | 'groq', code: AIError['code'], message: string) {
    super(message);
    this.code = code;
    this.provider = provider;
    this.name = 'AIError';
  }
}

function wrap(e: unknown, provider: 'gemini' | 'groq'): AIError {
  if (e instanceof GeminiError) return new AIError('gemini', e.code, e.message);
  if (e instanceof GroqChatError) return new AIError('groq', e.code, e.message);
  return new AIError(provider, 'unknown', e instanceof Error ? e.message : 'Unknown error');
}

export function getApiKeyFor(choice: AIModelChoice, settings: AppSettings): string {
  return choice.provider === 'gemini' ? settings.geminiApiKey : settings.groqApiKey;
}

export async function runAnalyze(
  text: string,
  choice: AIModelChoice,
  settings: AppSettings,
): Promise<SegmentAnalysis> {
  return aiLimiter.run(async () => {
    try {
      if (choice.provider === 'gemini') {
        return await geminiAnalyze(text, settings.geminiApiKey, choice.model);
      }
      return await analyzeSegmentGroq(text, settings.groqApiKey, choice.model);
    } catch (e) {
      throw wrap(e, choice.provider);
    }
  });
}

export async function runTranslate(
  text: string,
  choice: AIModelChoice,
  settings: AppSettings,
  context?: string,
): Promise<string> {
  return aiLimiter.run(async () => {
    try {
      if (choice.provider === 'gemini') {
        return await geminiTranslate(text, settings.geminiApiKey, choice.model, context);
      }
      return await quickTranslateGroq(text, settings.groqApiKey, choice.model, context);
    } catch (e) {
      throw wrap(e, choice.provider);
    }
  });
}

export function aiErrorMessage(e: unknown, fallback = 'AI request failed.'): string {
  if (!(e instanceof AIError)) return fallback;
  const provider = e.provider === 'gemini' ? 'Gemini' : 'Groq';
  switch (e.code) {
    case 'missing_key':
      return `Add your ${provider} API key in Settings.`;
    case 'auth':
      return `${provider} rejected the API key.`;
    case 'rate_limit':
      return `${provider} rate limit reached. Try again shortly.`;
    case 'invalid_response':
      return `${provider} returned an unexpected response.`;
    case 'network':
      return `Network error contacting ${provider}.`;
    default:
      return `${provider} request failed.`;
  }
}
