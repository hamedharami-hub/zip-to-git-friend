/**
 * Sentence flag system — color-coded bookmarks (red/orange/yellow/blue)
 * with optional custom label, stored in Lovable Cloud.
 */
import { supabase } from "@/integrations/supabase/client";

export type FlagColor = "red" | "orange" | "yellow" | "blue";

export interface SentenceFlag {
  id: string;
  sentenceId: string;
  color: FlagColor;
  label: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export const FLAG_COLOR_META: Record<
  FlagColor,
  { hex: string; bg: string; ring: string; label: string }
> = {
  red: { hex: "#ef4444", bg: "bg-red-500", ring: "ring-red-500/40", label: "سخت" },
  orange: { hex: "#f97316", bg: "bg-orange-500", ring: "ring-orange-500/40", label: "مرور" },
  yellow: { hex: "#eab308", bg: "bg-yellow-500", ring: "ring-yellow-500/40", label: "مهم" },
  blue: { hex: "#3b82f6", bg: "bg-blue-500", ring: "ring-blue-500/40", label: "یاد گرفتم" },
};

export const FLAG_COLORS: FlagColor[] = ["red", "orange", "yellow", "blue"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
function mapRow(r: any): SentenceFlag {
  return {
    id: r.id,
    sentenceId: r.sentence_id,
    color: r.color,
    label: r.label,
    note: r.note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchAllFlags(): Promise<SentenceFlag[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await supabase
    .from("sentence_flags")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function upsertFlag(input: {
  sentenceId: string;
  color: FlagColor;
  label?: string | null;
  note?: string | null;
}): Promise<SentenceFlag | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("sentence_flags")
    .upsert(
      {
        user_id: auth.user.id,
        sentence_id: input.sentenceId,
        color: input.color,
        label: input.label ?? null,
        note: input.note ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,sentence_id" },
    )
    .select()
    .single();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function removeFlag(sentenceId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const { error } = await supabase
    .from("sentence_flags")
    .delete()
    .eq("user_id", auth.user.id)
    .eq("sentence_id", sentenceId);
  if (error) throw error;
}

/** Fetch the actual sentences that have flags. */
export async function fetchFlaggedSentences(opts?: {
  colors?: FlagColor[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
}): Promise<Array<{ flag: SentenceFlag; sentence: any }>> {
  const flags = await fetchAllFlags();
  const filtered = opts?.colors?.length
    ? flags.filter((f) => opts.colors!.includes(f.color))
    : flags;
  if (filtered.length === 0) return [];
  const ids = filtered.map((f) => f.sentenceId);
  const { data, error } = await supabase.from("sentence_lab").select("*").in("id", ids);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
  const byId = new Map((data ?? []).map((r: any) => [r.id, r]));
  return filtered
    .map((f) => ({ flag: f, sentence: byId.get(f.sentenceId) }))
    .filter((x) => x.sentence);
}
