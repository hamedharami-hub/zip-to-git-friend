/** A single transcribed word with absolute timestamps (ms from media start). */
export interface WordTimestamp {
  text: string;
  startMs: number;
  endMs: number;
}

export interface Video {
  id: string;
  title: string;
  fileName: string;
  blobUrl: string;
  duration: number;
  lastPosition: number;
  volume: number;
  playbackSpeed: number;
  createdAt: number;
  /** 'video' (default) or 'audio' (podcast / mp3). */
  mediaType?: "video" | "audio";
  /** Best-effort mime type for audio playback after reload. */
  mimeType?: string;
}

export interface SubtitleCue {
  id: string;
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  analysis?: SegmentAnalysis;
  /** Optional per-word timestamps when produced by Whisper word-level mode. */
  words?: WordTimestamp[];
}

export interface SubtitleTrack {
  id: string;
  videoId: string;
  language: "en" | "fa" | string;
  role: "primary" | "secondary";
  cues: SubtitleCue[];
  delayMs: number;
  speedMultiplier: number;
}

export interface SegmentAnalysis {
  vocabulary: VocabItem[];
  idioms: IdiomItem[];
  /** Natural Persian translation of the full subtitle line. */
  translation?: string;
  analyzedAt: number;
  model: string;
}

export interface VocabItem {
  word: string;
  translation: string;
  partOfSpeech?: string;
  example?: string;
}

export interface IdiomItem {
  phrase: string;
  meaning: string;
  literalTranslation?: string;
}

export type LeitnerSourceKind = "video" | "audio" | "book" | "language_book" | "news" | "manual";

/** Four-level FSRS-style answer rating. */
export type LeitnerRating = "again" | "hard" | "good" | "easy";

/** Single review event in a card's history. */
export interface LeitnerReviewLog {
  /** ms timestamp */
  at: number;
  rating: LeitnerRating;
  /** Box AFTER this review */
  box: 1 | 2 | 3 | 4 | 5;
  /** Interval scheduled after this review (ms) */
  intervalMs: number;
}

export interface LeitnerCard {
  id: string;
  front: string;
  back: string;
  box: 1 | 2 | 3 | 4 | 5;
  nextReview: number;
  sourceVideoId?: string;
  sourceCueId?: string;
  createdAt: number;
  lastReviewed?: number;
  /** Original sentence the word/phrase was extracted from. */
  exampleSentence?: string;
  /** URL of a short audio clip of the example (video/podcast cue). */
  audioUrl?: string;
  /** URL of an AI-generated illustration. */
  imageUrl?: string;
  /** Folder this card belongs to. */
  folderId?: string;
  /** Source video timestamp range (ms). */
  sourceStartMs?: number;
  sourceEndMs?: number;
  /** External URL (article, book reference). */
  sourceUrl?: string;
  /** Human-readable source name (book title, podcast title…). */
  sourceTitle?: string;
  /** Origin app/feature. */
  sourceKind?: LeitnerSourceKind;
  // ── Adaptive SRS state (FSRS-lite) ──
  /** Last scheduled interval in ms (used to scale the next interval). */
  lastIntervalMs?: number;
  /** Number of times the user pressed "Again". */
  lapseCount?: number;
  /** Per-card ease factor (0.5 – 2.5). Higher = longer intervals. */
  easeFactor?: number;
  /** Recent review history (capped to last 50 entries). */
  reviewLog?: LeitnerReviewLog[];
  /** CEFR level (A1–C2) when known. */
  cefr?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  /** Part of speech (noun, verb, idiom…). */
  partOfSpeech?: string;
  /** User-flagged "important / difficult" star. */
  starred?: boolean;
  /** AI-extracted simple English synonyms / near-synonyms. */
  synonyms?: string[];
  /** AI-extracted English antonyms (when applicable). */
  antonyms?: string[];
}

export interface LeitnerFolder {
  id: string;
  name: string;
  kind: LeitnerSourceKind | "custom";
  /** Source identifier (videoId, bookId, articleId…) when this folder
   *  represents a single piece of content. */
  sourceRef?: string;
  parentId?: string;
  color?: string;
  createdAt: number;
}

export interface LoopConfig {
  enabled: boolean;
  cueId: string | null;
  currentIteration: number;
  maxIterations: number;
  pauseBetweenMs: number;
  visibilityPattern: Array<"both" | "primary" | "secondary" | "none">;
  /** When true, after finishing the current cue's iterations, advance to the next cue and keep looping. */
  chainNext: boolean;
}

/** Available Gemini chat models (latest stable 3.x line). */
export type GeminiModel = "gemini-3-flash-preview" | "gemini-3.1-flash-lite-preview";

/** Available Groq chat models (latest line). */
export type GroqChatModel =
  | "llama-3.3-70b-versatile"
  | "llama-3.1-8b-instant"
  | "openai/gpt-oss-20b"
  | "openai/gpt-oss-120b";

/** Available Groq transcription (Whisper) models. */
export type GroqWhisperModel = "whisper-large-v3-turbo" | "whisper-large-v3";

/** Provider/model bundle for chat-style tasks (analyze, translate). */
export interface AIModelChoice {
  provider: "gemini" | "groq";
  model: GeminiModel | GroqChatModel;
}

export interface AppSettings {
  theme: "dark" | "light";
  fontSize: "sm" | "md" | "lg" | "xl";
  displayMode: "inside" | "outside" | "hybrid";
  autoShowAnalysis: boolean;
  /** When true, hides subtitle text and auto-pauses at end of each cue
   *  until the user presses "Next" to advance. */
  blindListen: boolean;
  /** When true, the player auto-pauses at the end of each subtitle cue
   *  so the learner can think/repeat before pressing play. */
  autoPauseAtCueEnd: boolean;
  /** When true, the player auto-enters fullscreen immersive mode when the
   *  device is rotated to landscape on mobile. Default OFF — many users
   *  find this disruptive on Android. */
  autoImmersiveOnLandscape?: boolean;
  /** When true, shows the cached AI translation under the source subtitle
   *  (only when no secondary subtitle track is loaded). */
  showInlineTranslation: boolean;
  /** Difficulty level for the "everyday simple" rewrite (news & book chapters). */
  simplifyLevel?: SimplifyLevel;
  /** When true, every news article is auto-rewritten in everyday simple English
   *  on first open (no need to press the "ساده روزمره" tab manually). */
  defaultSimplifyArticles?: boolean;
  /** Default persona/voice for news rewrites. */
  defaultRewriteVoice?: RewriteVoice;
  geminiApiKey: string;
  groqApiKey: string;
  /** Optional separate Gemini API key dedicated to Text-to-Speech.
   *  When empty, TTS calls fall back to `geminiApiKey`. */
  geminiTtsApiKey: string;
  /** Optional ElevenLabs API key for premium TTS narration. */
  elevenLabsApiKey?: string;
  /** Microsoft Azure Speech (Cognitive Services) — best fa-IR pronunciation. */
  azureTtsApiKey?: string;
  /** Azure region, e.g. "westeurope", "eastus". */
  azureTtsRegion?: string;
  /** Hugging Face Inference API token (used for MMS-TTS models). */
  huggingFaceApiKey?: string;
  /** Play.ht user id + secret pair for online TTS. */
  playHtUserId?: string;
  playHtApiKey?: string;
  /** Base URL of a self-hosted OpenTTS server, e.g. http://localhost:5500. */
  openTtsUrl?: string;
  /** Default Gemini model (fallback / legacy). */
  geminiModel: GeminiModel;
  /** Per-task model choices. */
  analyzeModel: AIModelChoice;
  translateModel: AIModelChoice;
  batchModel: AIModelChoice;
  /** Transcription model (Groq Whisper variants). */
  transcribeModel: GroqWhisperModel;
  /** Lovable AI Gateway model used by the book paragraph analyzer
   *  (legacy single-model fallback). */
  bookAnalysisModel: BookAnalysisModel;
  /** Model used when analyzing a SINGLE paragraph in the reader. */
  bookSingleAnalysisModel: BookAnalysisModel;
  /** Model used when batch-analyzing the WHOLE chapter. */
  bookBatchAnalysisModel: BookAnalysisModel;
  /** Model used when AI-rewriting a chapter (summary, key points…). */
  bookRewriteModel: BookAnalysisModel;
  /** Provider+model refs (preferred over the plain BookAnalysisModel above).
   *  When set, the router uses these and may call the user's own
   *  Gemini / Groq key directly instead of Lovable AI Gateway. */
  bookSingleAnalysisModelRef?: BookAIModelRef;
  bookBatchAnalysisModelRef?: BookAIModelRef;
  bookRewriteModelRef?: BookAIModelRef;
  /** AI model used to write the long article-style news digest. */
  newsRewriteModelRef?: BookAIModelRef;
  /** AI model used to batch-analyze every paragraph of a news article. */
  newsBatchAnalysisModelRef?: BookAIModelRef;
  /** Shared AI model used for single-word meanings across app sections. */
  wordMeaningModel?: AIModelChoice;
  /** Shared AI model used for single-paragraph translation + phrase analysis across app sections. */
  paragraphAnalysisModelRef?: BookAIModelRef;
  /** Shared AI model used for whole-text / batch paragraph processing across app sections. */
  paragraphBatchModelRef?: BookAIModelRef;
  /** Shared AI model used for rewrites / article-style rewrites across app sections. */
  rewriteModelRef?: BookAIModelRef;
  /** Shared AI model used for headline/topic summaries in news discovery. */
  newsSummaryModelRef?: BookAIModelRef;
  /** AI model used by the news search / topic engine when summarising headlines. */
  newsSearchModelRef?: BookAIModelRef;
  /** AI model used to suggest Persian filenames for exported HTML files. */
  htmlFilenameModelRef?: BookAIModelRef;
  /** When true, paragraphs respond to swipe / double-tap / long-press gestures. */
  paragraphGestures?: boolean;
  /** Text alignment used by the reader and exported HTML. */
  paragraphTextAlign?: "start" | "justify" | "center";
  /** AI model used inside Sentence Lab (planner / roleplay / examples). */
  sentenceLabModelRef?: BookAIModelRef;
  /** AI model used by the podcast / audio features. */
  podcastModelRef?: BookAIModelRef;
  /** Dynamic model lists fetched from each provider. When present, the
   *  pickers merge these on top of the built-in defaults so the user
   *  can use brand-new models without an app update. */
  customModels?: {
    gemini?: { value: string; label: string; hint?: string }[];
    groqChat?: { value: string; label: string; hint?: string }[];
    groqWhisper?: { value: string; label: string; hint?: string }[];
    gateway?: { value: string; label: string; hint?: string }[];
    refreshedAt?: number;
    /** Per-provider deny-list of model `value`s to hide from the pickers,
     *  so the dropdowns aren't cluttered with experimental/legacy models. */
    hidden?: {
      gemini?: string[];
      groqChat?: string[];
      groqWhisper?: string[];
      gateway?: string[];
    };
  };
}

/** Models available on the Lovable AI Gateway for the book analyzer. */
export type BookAnalysisModel =
  | "google/gemini-3-flash-preview"
  | "google/gemini-3.1-flash-lite-preview"
  | "openai/gpt-5"
  | "openai/gpt-5-mini"
  | "openai/gpt-5-nano";

/** Provider behind a book-AI call. Reserved for the upcoming
 *  per-provider routing (uses the user's own Gemini/Groq key). */
export type BookAIProvider = "gateway" | "gemini" | "groq";

/** Resolved provider+model used for any book AI task. */
export interface BookAIModelRef {
  provider: BookAIProvider;
  model: string;
}

/** A saved AI rewrite of a single chapter (summary, key points, etc.). */
export type RewriteStyle =
  | "short_summary"
  | "detailed_summary"
  | "key_points"
  | "simplified"
  | "everyday_simple"
  | "key_quotes"
  | "review_questions";

/** Difficulty level used by the "everyday simple" rewrite style. */
export type SimplifyLevel = "a2-b1" | "b1-b2";

/** News rewrite length options exposed in the reader UI. */
export type RewriteLength = "long" | "max" | "auto-max" | "simple";

/** Persona / voice for the news digest/rewrite. */
export type RewriteVoice = "storyteller" | "teacher" | "journalist" | "copilot";

export interface BookChapterRewrite {
  /** Composite key: `${bookId}:${chapterIndex}:${style}`. */
  id: string;
  bookId: string;
  chapterIndex: number;
  style: RewriteStyle;
  /** HTML output (sanitized markdown → simple html) used by the reader. */
  html: string;
  /** Plain-text version (for analysis & TTS). */
  text: string;
  /** Word count of the rewritten text. */
  wordCount: number;
  model: string;
  createdAt: number;
}

/** Cached word translation row. */
export interface WordTranslation {
  word: string; // normalized lowercase
  translation: string;
  createdAt: number;
}

/** Knowledge state for a single word.
 *  - new: never marked
 *  - learning: user is studying it
 *  - known: user knows it (won't be highlighted/pre-studied)
 *  - ignored: hide from pre-study (proper nouns, names…) */
export type WordStatusValue = "new" | "learning" | "known" | "ignored";

export interface WordStatus {
  /** Normalized lowercased word (key). */
  word: string;
  status: WordStatusValue;
  updatedAt: number;
}

/** Daily listening/study session row (key: YYYY-MM-DD). */
export interface ListeningSession {
  date: string;
  seconds: number;
}

/** A user's recorded shadowing attempt for one cue. */
export interface ShadowingTake {
  id: string;
  videoId: string;
  cueId: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
  /** Reference text used to score this take. */
  refText: string;
  /** Latest transcription of the user's recording (filled when scored). */
  hypothesis?: string;
  /** 0–100 similarity score vs `refText` (filled when scored). */
  score?: number;
  createdAt: number;
}

/** Stored row shape — matches ShadowingTake one-to-one. */
export type ShadowingTakeRecord = ShadowingTake;

// ───────────────────────────────────────── Books (EPUB) ──

/** A book the user has uploaded. The original .epub bytes live in `bookBlobs`. */
export interface Book {
  id: string;
  title: string;
  author?: string;
  language?: string;
  fileName: string;
  /** Total number of chapters discovered after parsing. 0 until parsed. */
  chapterCount: number;
  /** Index of the chapter the reader was last on. */
  lastChapterIndex: number;
  /** Approximate scroll position (0–1) within the last chapter. */
  lastScrollRatio: number;
  /** Optional cover image as a data URL (small, base64) for fast list rendering. */
  coverDataUrl?: string;
  createdAt: number;
  updatedAt: number;
}

/** Parsed chapter content extracted from the EPUB at import time. */
export interface BookChapter {
  /** Composite key string: `${bookId}:${index}`. */
  id: string;
  bookId: string;
  index: number;
  /** Human-readable title from the EPUB's table of contents. */
  title: string;
  /** Sanitized HTML for rendering (scripts/styles stripped). */
  html: string;
  /** Plain-text version used for AI prompts and TTS. */
  text: string;
  /** Word count, for stats and pacing. */
  wordCount: number;
}

/** A user-saved highlight or sentence inside a book chapter. */
export interface BookHighlight {
  id: string;
  bookId: string;
  chapterIndex: number;
  /** The exact selected text. */
  text: string;
  /** Optional Persian translation (filled when AI is run). */
  translation?: string;
  /** Free-form note from the user. */
  note?: string;
  /** Encoded location inside the chapter (e.g. CFI or paragraph index). */
  locator?: string;
  createdAt: number;
}

/** A bookmark to a position inside a book. */
export interface BookBookmark {
  id: string;
  bookId: string;
  chapterIndex: number;
  scrollRatio: number;
  label?: string;
  createdAt: number;
}

/** Cached AI analysis for a single paragraph inside a book chapter. */
export interface BookParagraphAnalysis {
  /** Composite key: `${bookId}:${chapterIndex}:${paragraphHash}`. */
  id: string;
  bookId: string;
  chapterIndex: number;
  /** Stable hash of the paragraph text (so re-runs are deduped). */
  paragraphHash: string;
  translation: string;
  vocabulary: VocabItem[];
  idioms: IdiomItem[];
  analyzedAt: number;
  model: string;
}

/** Cached TTS audio for a chapter (so it survives reloads / works offline). */
export interface BookTTSAudio {
  /** Composite key: `${bookId}:${chapterIndex}:${voice}`. */
  id: string;
  bookId: string;
  chapterIndex: number;
  voice: string;
  blob: Blob;
  mimeType: string;
  /** Length of the source text used to generate this audio (bytes). */
  textLength: number;
  createdAt: number;
}

/**
 * Cached TTS audio for a SINGLE chunk (paragraph-ish slice) of a chapter.
 * Stored alongside the full chapter blob so the UI can render a live list
 * of generated paragraphs while the chapter is still being synthesized, and
 * the user can replay any individual paragraph offline on later visits.
 */
export interface BookTTSChunk {
  /** Composite key: `${bookId}:${chapterIndex}:${voice}:${chunkIndex}`. */
  id: string;
  bookId: string;
  chapterIndex: number;
  voice: string;
  chunkIndex: number;
  total: number;
  text: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
}

/** Daily reading session row (key: YYYY-MM-DD). Mirrors ListeningSession. */
export interface ReadingSession {
  date: string;
  seconds: number;
  /** Words encountered (rough; for streak/progress UI). */
  words: number;
}
