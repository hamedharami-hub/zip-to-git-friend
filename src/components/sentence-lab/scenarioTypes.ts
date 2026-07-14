import type { SentenceCategory } from "@/lib/sentenceCategories";

export interface RoleOption {
  user_role: string;
  ai_role: string;
  label: string;
}

export interface Scenario {
  title_en: string;
  title_fa: string;
  user_role: string;
  ai_role: string;
  role_options?: RoleOption[];
  scene_en: string;
  scene_fa: string;
  ai_opening_line: string;
  goal_en: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface TargetSentence {
  id: string;
  english: string;
  persian: string | null;
}

export interface TurnUsage {
  id: string;
  used: boolean;
  similarity: number;
}

export interface GrammarMarker {
  span: string;
  correction: string;
  rule_label: string;
  explanation?: string;
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  usage?: TurnUsage[];
  grammar_markers?: GrammarMarker[];
  saved?: boolean;
}

export interface ScenarioPickerProps {
  scenarios: Scenario[] | null;
  loading: boolean;
  onPick: (s: Scenario, role?: RoleOption) => void;
  onRegenerate: () => void;
  targetCount: number;
  allSubs: SentenceCategory[];
  selectedSubSlugs: string[];
  onToggleSub: (slug: string) => void;
}

export interface ScenarioChatPaneProps {
  scenario: Scenario;
  activeRole: RoleOption | null;
  messages: ChatMsg[];
  interim: string;
  recording: boolean;
  busy: boolean;
  aiSpeaking: boolean;
  complete: { reason: string } | null;
  onMicTap: () => void;
  onSwapRoles: () => void;
  onSaveMessage: (idx: number, m: ChatMsg) => void;
  onRestart: () => void;
}
