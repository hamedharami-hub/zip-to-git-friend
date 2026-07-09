import { useState } from 'react';
import {
  Rss, Globe2, Search, Trash2, ChevronDown, ChevronRight,
  Folder, Settings as SettingsIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useLongPress } from '@/hooks/useLongPress';
import type { NewsFolder, NewsSource } from '@/lib/news';

function SourceRow({
  source, isActive, folders, onPick, onDelete, onMove, onRename,
}: {
  source: NewsSource;
  isActive: boolean;
  folders: NewsFolder[];
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, folderId: string | null) => void | Promise<void>;
  onRename: (id: string, name: string) => void | Promise<void>;
}) {
  const Icon = source.kind === 'rss' ? Rss : source.kind === 'site' ? Globe2 : Search;
  const [menuOpen, setMenuOpen] = useState(false);
  const longPress = useLongPress(() => setMenuOpen(true), 450);
  const handleRename = () => {
    const next = window.prompt('نام جدید منبع:', source.name);
    if (next && next.trim() && next.trim() !== source.name) {
      void onRename(source.id, next.trim());
    }
  };
  return (
    <li className="group flex items-center gap-1.5 rounded-xl px-1 py-0.5">
      <button
        type="button"
        onClick={(e) => {
          if (longPress.consumeClick()) { e.preventDefault(); return; }
          onPick(source.id);
        }}
        onDoubleClick={handleRename}
        onTouchStart={longPress.onTouchStart}
        onTouchEnd={longPress.onTouchEnd}
        onTouchMove={longPress.onTouchMove}
        onTouchCancel={longPress.onTouchCancel}
        onContextMenu={longPress.onContextMenu}
        className={
          'flex-1 flex items-center gap-2 rounded-xl border px-2.5 py-2 text-sm text-start transition-colors ' +
          (isActive
            ? 'border-primary/25 bg-primary/10 text-foreground shadow-sm'
            : 'border-transparent hover:border-border/70 hover:bg-accent text-muted-foreground hover:text-foreground')
        }>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background">
          <Icon className="h-3.5 w-3.5 shrink-0" />
        </span>
        <span className="truncate">{source.name}</span>
      </button>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-7 w-7 opacity-60 sm:opacity-0 sm:group-hover:opacity-100">
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleRename}>
            <SettingsIcon className="h-3.5 w-3.5 me-2" /> تغییر نام
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">انتقال به پوشه</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onMove(source.id, null)}>
            <Folder className="h-3.5 w-3.5 me-2" /> بدون پوشه
          </DropdownMenuItem>
          {folders.map((f) => (
            <DropdownMenuItem key={f.id} onClick={() => onMove(source.id, f.id)}>
              <Folder className="h-3.5 w-3.5 me-2" style={f.color ? { color: f.color } : undefined} />
              {f.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onDelete(source.id)} className="text-destructive">
            <Trash2 className="h-3.5 w-3.5 me-2" /> حذف منبع
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function SourcesTree({
  folders, sourcesByFolder, activeSourceId, activeFolderId, collapsed,
  onToggleFolder, onPickFolder, onPickSource, onDeleteSource, onMoveSource, onRenameSource, onRenameFolder,
}: {
  folders: NewsFolder[];
  sourcesByFolder: Map<string | null, NewsSource[]>;
  activeSourceId: string | null;
  activeFolderId: string | null;
  collapsed: Record<string, boolean>;
  onToggleFolder: (id: string) => void;
  onPickFolder: (id: string) => void;
  onPickSource: (id: string) => void;
  onDeleteSource: (id: string) => void;
  onMoveSource: (id: string, folderId: string | null) => void | Promise<void>;
  onRenameSource: (id: string, name: string) => void | Promise<void>;
  onRenameFolder: (id: string, name: string) => void | Promise<void>;
}) {
  const ungrouped = sourcesByFolder.get(null) ?? [];
  const renameFolder = (f: NewsFolder) => {
    const next = window.prompt('نام جدید پوشه:', f.name);
    if (next && next.trim() && next.trim() !== f.name) void onRenameFolder(f.id, next.trim());
  };
  return (
    <div className="space-y-2">
      {folders.map((folder) => {
        const items = sourcesByFolder.get(folder.id) ?? [];
        const isOpen = collapsed[folder.id] === true;
        const isActive = activeFolderId === folder.id;
        return (
          <div key={folder.id}>
            <div className="group flex items-center gap-1 rounded-2xl border border-border/60 bg-card/60 px-1.5 py-1 shadow-sm">
              <button type="button" onClick={() => onToggleFolder(folder.id)}
                className="p-1 rounded-full hover:bg-accent/50"
                title={isOpen ? 'بستن' : 'بازکردن'}>
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              <button type="button" onClick={() => onPickFolder(folder.id)}
                onDoubleClick={() => renameFolder(folder)}
                className={
                  'flex-1 flex items-center gap-2 px-2 py-1.5 rounded-xl text-xs font-medium transition-colors ' +
                  (isActive ? 'bg-primary/10 text-foreground' : 'hover:bg-accent/50')
                }>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background">
                  <Folder className="h-3.5 w-3.5" style={folder.color ? { color: folder.color } : undefined} />
                </span>
                <span className="truncate flex-1 text-start">{folder.name}</span>
                <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{items.length}</span>
              </button>
              <Button size="icon" variant="ghost"
                className="h-7 w-7 rounded-full opacity-70 sm:opacity-0 sm:group-hover:opacity-100"
                title="تغییر نام پوشه"
                onClick={() => renameFolder(folder)}>
                <SettingsIcon className="h-3 w-3" />
              </Button>
            </div>
            {isOpen && items.length > 0 && (
              <ul className="ms-4 space-y-0.5 mt-0.5 border-s border-border ps-1">
                {items.map((s) => (
                  <SourceRow key={s.id} source={s} isActive={s.id === activeSourceId}
                    folders={folders} onPick={onPickSource}
                    onDelete={onDeleteSource} onMove={onMoveSource} onRename={onRenameSource} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {ungrouped.length > 0 && (
        <ul className="space-y-0.5">
          {folders.length > 0 && (
            <li className="px-1 py-0.5 text-[10px] uppercase text-muted-foreground tracking-wider">بدون پوشه</li>
          )}
          {ungrouped.map((s) => (
            <SourceRow key={s.id} source={s} isActive={s.id === activeSourceId}
              folders={folders} onPick={onPickSource}
              onDelete={onDeleteSource} onMove={onMoveSource} onRename={onRenameSource} />
          ))}
        </ul>
      )}
    </div>
  );
}
