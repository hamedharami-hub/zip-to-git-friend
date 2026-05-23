import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Upload, Pencil } from 'lucide-react';
import { BookUploader } from './BookUploader';
import { ManualBookDialog } from './ManualBookDialog';
import { useRef } from 'react';

interface Props {
  variant?: 'button' | 'card';
}

/**
 * Combined "Add to library" entry point: upload an .epub OR create a book
 * manually by pasting chapters. The EPUB picker stays inside `BookUploader`
 * (so its file input + progress overlay are reused as-is); we just trigger
 * its hidden <input> via a ref.
 */
export function BookImportMenu({ variant = 'button' }: Props) {
  const epubBtnRef = useRef<HTMLButtonElement>(null);
  const manualBtnRef = useRef<HTMLButtonElement>(null);

  const triggerLabel = variant === 'card' ? 'Add a book' : 'Add';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {variant === 'card' ? (
            <Button size="lg" className="gap-2">
              <Plus className="h-4 w-4" />
              {triggerLabel}
            </Button>
          ) : (
            <Button variant="default" size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              <span>{triggerLabel}</span>
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              epubBtnRef.current?.click();
            }}
            className="gap-2"
          >
            <Upload className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-sm font-medium">Upload EPUB</div>
              <div className="text-[11px] text-muted-foreground">From a .epub file</div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              manualBtnRef.current?.click();
            }}
            className="gap-2"
          >
            <Pencil className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-sm font-medium">Add manually</div>
              <div className="text-[11px] text-muted-foreground">Paste chapter text</div>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Hidden hosts: keep their dialogs / file inputs available. */}
      <div className="hidden">
        <BookUploader variant="button" triggerRef={epubBtnRef} />
        <ManualBookDialog
          trigger={<button ref={manualBtnRef} type="button" aria-hidden />}
        />
      </div>
    </>
  );
}
