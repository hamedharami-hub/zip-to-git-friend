import { useState } from "react";
import { FolderPlus, Ban, Folder, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  createFolder,
  deleteFolder,
  blockDomain,
  unblockDomain,
  type NewsFolder,
  type BlockedDomain,
} from "@/lib/news";

const FOLDER_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#a855f7", "#ec4899", "#14b8a6"];

export function ManageNewsDialog({
  open,
  onOpenChange,
  folders,
  blocked,
  onFoldersChanged,
  onBlockedChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  folders: NewsFolder[];
  blocked: BlockedDomain[];
  onFoldersChanged: () => void | Promise<void>;
  onBlockedChanged: () => void | Promise<void>;
}) {
  const [folderName, setFolderName] = useState("");
  const [folderColor, setFolderColor] = useState(FOLDER_COLORS[0]);
  const [blockInput, setBlockInput] = useState("");
  const [busy, setBusy] = useState(false);

  const handleCreateFolder = async () => {
    const name = folderName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await createFolder({ name, color: folderColor });
      setFolderName("");
      await onFoldersChanged();
      toast.success("پوشه ساخته شد.");
    } catch (e: any) {
      toast.error(e.message ?? "خطا");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm("این پوشه حذف بشه؟ منابع داخلش به «بدون پوشه» منتقل می‌شن.")) return;
    try {
      await deleteFolder(id);
      await onFoldersChanged();
    } catch (e: any) {
      toast.error(e.message ?? "خطا");
    }
  };

  const handleBlock = async () => {
    const d = blockInput.trim();
    if (!d) return;
    setBusy(true);
    try {
      await blockDomain(d);
      setBlockInput("");
      await onBlockedChanged();
      toast.success("دامنه بلاک شد.");
    } catch (e: any) {
      toast.error(e.message ?? "خطا");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>مدیریت اخبار</DialogTitle>
          <DialogDescription>پوشه‌های منابع و دامنه‌های بلاک‌شده.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="folders" className="mt-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="folders" className="gap-1 text-xs">
              <FolderPlus className="h-3.5 w-3.5" /> پوشه‌ها
            </TabsTrigger>
            <TabsTrigger value="blocked" className="gap-1 text-xs">
              <Ban className="h-3.5 w-3.5" /> دامنه‌های بلاک‌شده
            </TabsTrigger>
          </TabsList>

          <TabsContent value="folders" className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label className="text-xs">پوشه جدید</Label>
              <div className="flex gap-1.5">
                <Input
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="مثلاً: تکنولوژی، ورزش"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleCreateFolder();
                    }
                  }}
                  className="h-9"
                />
                <Button
                  onClick={handleCreateFolder}
                  disabled={busy || !folderName.trim()}
                  size="sm"
                >
                  افزودن
                </Button>
              </div>
              <div className="flex gap-1.5">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFolderColor(c)}
                    className={
                      "h-6 w-6 rounded-full border-2 " +
                      (folderColor === c ? "border-foreground" : "border-transparent")
                    }
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-3">
              {folders.length === 0 ? (
                <p className="text-xs text-muted-foreground">هنوز پوشه‌ای نساخته‌ای.</p>
              ) : (
                <ul className="space-y-1 max-h-56 overflow-y-auto">
                  {folders.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
                    >
                      <Folder
                        className="h-4 w-4"
                        style={f.color ? { color: f.color } : undefined}
                      />
                      <span className="flex-1 text-sm truncate">{f.name}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => handleDeleteFolder(f.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          <TabsContent value="blocked" className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label className="text-xs">بلاک کردن دامنه</Label>
              <div className="flex gap-1.5">
                <Input
                  value={blockInput}
                  onChange={(e) => setBlockInput(e.target.value)}
                  placeholder="example.com"
                  dir="ltr"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleBlock();
                    }
                  }}
                  className="h-9"
                />
                <Button onClick={handleBlock} disabled={busy || !blockInput.trim()} size="sm">
                  بلاک
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                مقالات از این دامنه‌ها در جستجو و فید نمایش داده نمی‌شن.
              </p>
            </div>

            <div className="border-t border-border pt-3">
              {blocked.length === 0 ? (
                <p className="text-xs text-muted-foreground">دامنه‌ای بلاک نشده.</p>
              ) : (
                <ul className="space-y-1 max-h-56 overflow-y-auto">
                  {blocked.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
                    >
                      <Ban className="h-4 w-4 text-destructive" />
                      <span className="flex-1 text-sm truncate" dir="ltr">
                        {b.domain}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={async () => {
                          await unblockDomain(b.id);
                          await onBlockedChanged();
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            بستن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
