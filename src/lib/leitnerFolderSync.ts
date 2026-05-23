import { supabase } from '@/integrations/supabase/client';
import type { LeitnerFolder } from '@/types';

let currentUserId: string | null = null;

export function setFolderSyncUser(userId: string | null) {
  currentUserId = userId;
}

interface RemoteFolderRow {
  id: string;
  user_id: string;
  name: string;
  kind: string;
  source_ref: string | null;
  parent_id: string | null;
  color: string | null;
  client_id: string | null;
  created_at: string;
}

function rowToFolder(r: RemoteFolderRow): LeitnerFolder {
  return {
    id: r.client_id || r.id,
    name: r.name,
    kind: (r.kind as LeitnerFolder['kind']) ?? 'custom',
    sourceRef: r.source_ref ?? undefined,
    parentId: r.parent_id ?? undefined,
    color: r.color ?? undefined,
    createdAt: new Date(r.created_at).getTime(),
  };
}

export async function pushFolder(folder: LeitnerFolder): Promise<void> {
  if (!currentUserId) return;
  const { error } = await supabase
    .from('leitner_folders')
    .upsert(
      {
        user_id: currentUserId,
        name: folder.name,
        kind: folder.kind,
        source_ref: folder.sourceRef ?? null,
        parent_id: folder.parentId ?? null,
        color: folder.color ?? null,
        client_id: folder.id,
      },
      { onConflict: 'user_id,client_id' as never },
    );
  if (error) console.error('pushFolder failed', error);
}

export async function deleteRemoteFolder(clientId: string): Promise<void> {
  if (!currentUserId) return;
  await supabase
    .from('leitner_folders')
    .delete()
    .eq('user_id', currentUserId)
    .eq('client_id', clientId);
}

export async function pullFolders(userId: string): Promise<LeitnerFolder[]> {
  const { data, error } = await supabase
    .from('leitner_folders')
    .select('*')
    .eq('user_id', userId);
  if (error) {
    console.error('pullFolders failed', error);
    return [];
  }
  return (data ?? []).map((r) => rowToFolder(r as unknown as RemoteFolderRow));
}
