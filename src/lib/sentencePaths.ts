import { supabase } from '@/integrations/supabase/client';

export interface PathStepRecipe {
  category: string;
  subcategory: string;
  count: number;
}

export interface SentencePath {
  id: string;
  userId: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  domain: string;
  isBuiltin: boolean;
  recipe: PathStepRecipe[];
  sortOrder: number;
}

function map(row: any): SentencePath {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    color: row.color,
    domain: row.domain,
    isBuiltin: row.is_builtin,
    recipe: Array.isArray(row.recipe) ? row.recipe : [],
    sortOrder: row.sort_order ?? 0,
  };
}

export async function fetchPaths(domain = 'general'): Promise<SentencePath[]> {
  const { data, error } = await supabase
    .from('sentence_paths')
    .select('*')
    .eq('domain', domain)
    .order('is_builtin', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(map);
}

export async function fetchPath(id: string): Promise<SentencePath | null> {
  const { data, error } = await supabase
    .from('sentence_paths')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? map(data) : null;
}

export interface CreatePathInput {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  domain?: string;
  recipe: PathStepRecipe[];
}

export async function createPath(input: CreatePathInput): Promise<SentencePath> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Sign in required');
  const { data, error } = await supabase
    .from('sentence_paths')
    .insert({
      user_id: userId,
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? 'Sparkles',
      color: input.color ?? 'sky',
      domain: input.domain ?? 'general',
      is_builtin: false,
      recipe: input.recipe as any,
    })
    .select()
    .single();
  if (error) throw error;
  return map(data);
}

export async function deletePath(id: string): Promise<void> {
  const { error } = await supabase.from('sentence_paths').delete().eq('id', id);
  if (error) throw error;
}
