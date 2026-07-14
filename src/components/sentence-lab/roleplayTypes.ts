import type { SentenceLabItem } from "@/store/sentenceStore";

export type Light = "idle" | "green" | "yellow" | "red";

export interface GrammarMarker {
  span: string;
  correction: string;
  rule_label: string;
  explanation: string;
  severity: "minor" | "major";
}

export interface RoleplayResponse {
  ai_audio_response: string;
  grammar_corrections: string;
  grammar_markers: GrammarMarker[];
  fluency_penalty_notes: string;
  harvested_sentences: string[];
  intent_match: "green" | "yellow" | "red";
}

export interface Turn {
  id: string;
  userTranscript: string;
  spokenSeconds: number;
  ai: RoleplayResponse;
  latencyMs: number;
  light: Exclude<Light, "idle">;
  ts: number;
}

export interface DissectionModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  turns: Turn[];
  item: SentenceLabItem;
}

export interface MarkerPopoverProps {
  marker: GrammarMarker;
  text: string;
  item: SentenceLabItem;
}
