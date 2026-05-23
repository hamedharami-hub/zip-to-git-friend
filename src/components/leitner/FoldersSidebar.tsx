import { useMemo } from 'react';
import { Folder, FolderOpen, Layers, Pencil, Plus, Trash2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLeitnerFolderStore } from '@/store/leitnerFolderStore';
import { useLeitnerStore } from '@/store/leitnerStore';
import type { LeitnerFolder } from '@/types';
import { toast } from 'sonner';

interface Props {
  /** Currently selected folder id, or `null` for "All cards". */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Optional: jump straight to Review tab for a folder. */
  onReview?: (id: string | null) => void;
}

const KIND_LABEL: Record<string, string> = {
  video: 'Movies',
  audio: 'Podcasts',
  book: 'Books',
  language_book: 'Language Books',
  news: 'News',
  manual: 'Manual',
  custom: 'Custom',
};

export function FoldersSidebar({ selectedId, onSelect, onReview }: Props) {
  const folders = useLeitnerFolderStore((s) => s.folders);
  const cards = useLeitnerStore((s) => s.cards);
  const addFolder = useLeitnerFolderStore((s) => s.addFolder);
  const renameFolder = useLeitnerFolderStore((s) => s.renameFolder);
  const deleteFolder = useLeitnerFolderStore((s) => s.deleteFolder);

  const grouped = useMemo(() => {
    const map = new Map<string, LeitnerFolder[]>();
    for (const f of folders) {
      const k = f.kind ?? 'custom';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(f);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [folders]);

  const cardCount = (folderId?: string) =>
    folderId
      ? cards.filter((c) => c.folderId === folderId).length
      : cards.length;

  const dueCount = (folderId?: string) => {
    const now = Date.now();
    return cards.filter(
      (c) => (folderId ? c.folderId === folderId : true) && c.nextReview <= now,
    ).length;
  };

  const handleAdd = async () => {
    const name = window.prompt('New folder name');
    if (!name?.trim()) return;
    await addFolder({ name: name.trim(), kind: 'custom' });
    toast.success('Folder created');
  };

  const handleRename = async (f: LeitnerFolder) => {
    const next = window.prompt('Rename folder', f.name);
    if (!next?.trim() || next === f.name) return;
    await renameFolder(f.id, next.trim());
  };

  const handleDelete = async (f: LeitnerFolder) => {
    if (!window.confirm(`Delete folder "${f.name}"? Cards inside will be moved to "All cards".`)) return;
    await deleteFolder(f.id);
    if (selectedId === f.id) onSelect(null);
    toast.success('Folder deleted');
  };

  return (
    <aside className="w-full lg:w-64 lg:shrink-0 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          Folders
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleAdd} aria-label="New folder">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <button
        onClick={() => onSelect(null)}
        className={cn(
          'w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors',
          selectedId === null
            ? 'bg-primary/10 text-primary border border-primary/20'
            : 'hover:bg-muted text-foreground border border-transparent',
        )}
      >
        <span className="inline-flex items-center gap-2">
          <Layers className="h-4 w-4" />
          All cards
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {dueCount()}/{cardCount()}
        </span>
      </button>

      {Array.from(grouped.entries()).map(([kind, list]) => (
        <div key={kind} className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 px-2">
            {KIND_LABEL[kind] ?? kind}
          </p>
          {list.map((f) => {
            const active = selectedId === f.id;
            return (
              <div
                key={f.id}
                className={cn(
                  'group flex items-center gap-1 rounded-md transition-colors',
                  active ? 'bg-primary/10' : 'hover:bg-muted',
                )}
              >
                <button
                  onClick={() => onSelect(f.id)}
                  className={cn(
                    'flex-1 min-w-0 flex items-center justify-between gap-2 px-3 py-2 text-sm',
                    active ? 'text-primary' : 'text-foreground',
                  )}
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    {active ? (
                      <FolderOpen className="h-4 w-4 shrink-0" />
                    ) : (
                      <Folder className="h-4 w-4 shrink-0" />
                    )}
                    <span className="truncate">{f.name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {dueCount(f.id)}/{cardCount(f.id)}
                  </span>
                </button>
                <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex items-center pr-1 shrink-0 transition-opacity">
                  {onReview && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-primary"
                      onClick={() => onReview(f.id)}
                      aria-label={`Review folder ${f.name}`}
                      title="Review this folder"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleRename(f)}
                    aria-label="Rename folder"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleDelete(f)}
                    aria-label="Delete folder"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
