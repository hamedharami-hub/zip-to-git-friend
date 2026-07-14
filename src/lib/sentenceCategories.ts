import { supabase } from "@/integrations/supabase/client";

export interface SentenceCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  sortOrder: number;
  isDefault: boolean;
  createdBy: string | null;
}

export interface CategoryWithStats extends SentenceCategory {
  childrenCount: number;
  sentenceCount: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
function map(row: any): SentenceCategory {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon,
    color: row.color,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    isDefault: row.is_default,
    createdBy: row.created_by,
  };
}

/** Top-level categories (parent_id = null) with child + sentence counts. */
export async function fetchTopCategories(): Promise<CategoryWithStats[]> {
  const { data, error } = await supabase
    .from("sentence_categories")
    .select("*")
    .is("parent_id", null)
    .order("sort_order", { ascending: true });
  if (error) throw error;

  const cats = (data ?? []).map(map);

  // Fetch child counts per category
  const childCounts = new Map<string, number>();
  if (cats.length > 0) {
    const { data: children } = await supabase
      .from("sentence_categories")
      .select("parent_id")
      .in(
        "parent_id",
        cats.map((c) => c.id),
      );
    for (const c of children ?? []) {
      const k = c.parent_id as string;
      childCounts.set(k, (childCounts.get(k) ?? 0) + 1);
    }
  }

  // Sentence count per category slug
  const sentenceCounts = new Map<string, number>();
  const { data: sentences } = await supabase
    .from("sentence_lab")
    .select("category")
    .eq("status", "published");
  for (const s of sentences ?? []) {
    if (!s.category) continue;
    sentenceCounts.set(s.category, (sentenceCounts.get(s.category) ?? 0) + 1);
  }

  return cats.map((c) => ({
    ...c,
    childrenCount: childCounts.get(c.id) ?? 0,
    sentenceCount: sentenceCounts.get(c.slug) ?? 0,
  }));
}

/** Sub-categories under a given parent slug. */
export async function fetchSubcategories(parentSlug: string): Promise<CategoryWithStats[]> {
  const { data: parent } = await supabase
    .from("sentence_categories")
    .select("id, slug")
    .eq("slug", parentSlug)
    .is("parent_id", null)
    .maybeSingle();
  if (!parent) return [];

  const { data, error } = await supabase
    .from("sentence_categories")
    .select("*")
    .eq("parent_id", parent.id)
    .order("sort_order", { ascending: true });
  if (error) throw error;

  const subs = (data ?? []).map(map);

  // Sentence counts by subcategory slug, scoped to this parent's category
  const counts = new Map<string, number>();
  const { data: sentences } = await supabase
    .from("sentence_lab")
    .select("subcategory")
    .eq("status", "published")
    .eq("category", parent.slug);
  for (const s of sentences ?? []) {
    if (!s.subcategory) continue;
    counts.set(s.subcategory, (counts.get(s.subcategory) ?? 0) + 1);
  }

  return subs.map((c) => ({
    ...c,
    childrenCount: 0,
    sentenceCount: counts.get(c.slug) ?? 0,
  }));
}

export async function fetchCategoryBySlug(slug: string): Promise<SentenceCategory | null> {
  const { data } = await supabase
    .from("sentence_categories")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return data ? map(data) : null;
}

export interface CreateCategoryInput {
  slug: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  parentSlug?: string;
}

export async function createCategory(input: CreateCategoryInput): Promise<SentenceCategory> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Sign in required");

  let parentId: string | null = null;
  if (input.parentSlug) {
    const parent = await fetchCategoryBySlug(input.parentSlug);
    if (!parent) throw new Error("Parent category not found");
    parentId = parent.id;
  }

  const { data, error } = await supabase
    .from("sentence_categories")
    .insert({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? "Folder",
      color: input.color ?? "sky",
      parent_id: parentId,
      created_by: userId,
      is_default: false,
    })
    .select()
    .single();
  if (error) throw error;
  return map(data);
}

export interface ImportSentence {
  english: string;
  persian?: string;
  english_aussie?: string;
  cefr_level?: string;
  expected_intent?: string;
  ai_counter_prompt?: string;
  expected_duration_seconds?: number;
  grammar_focus?: string[];
  vocabulary_tags?: string[];
  common_mistakes?: string[];
}

/** Bulk insert sentences into a category/subcategory. Returns inserted count. */
export async function importSentences(
  categorySlug: string,
  subcategorySlug: string | null,
  sentences: ImportSentence[],
): Promise<number> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Sign in required");

  const rows = sentences.map((s) => ({
    id: `usr_${categorySlug}_${crypto.randomUUID().slice(0, 8)}`,
    status: "published",
    category: categorySlug,
    subcategory: subcategorySlug,
    cefr_level: s.cefr_level ?? null,
    english: s.english,
    persian: s.persian ?? null,
    english_aussie: s.english_aussie ?? null,
    expected_intent: s.expected_intent ?? null,
    ai_counter_prompt: s.ai_counter_prompt ?? null,
    expected_duration_seconds: s.expected_duration_seconds ?? 5,
    grammar_focus: s.grammar_focus ?? [],
    vocabulary_tags: s.vocabulary_tags ?? [],
    common_mistakes: s.common_mistakes ?? [],
    created_by: userId,
  }));

  const { error } = await supabase.from("sentence_lab").insert(rows);
  if (error) throw error;
  return rows.length;
}
