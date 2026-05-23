import { describe, expect, it } from 'vitest';
import { __test_mergeTranscriptParts } from '@/lib/webSpeech';

describe('webSpeech transcript merge', () => {
  it('falls back to interim text when no final transcript exists', () => {
    expect(__test_mergeTranscriptParts('', 'hello how are you')).toBe('hello how are you');
  });

  it('keeps final transcript when interim is empty', () => {
    expect(__test_mergeTranscriptParts('good morning', '')).toBe('good morning');
  });

  it('avoids duplicating final text when interim already includes it', () => {
    expect(__test_mergeTranscriptParts('good morning', 'good morning doctor')).toBe('good morning doctor');
  });
});