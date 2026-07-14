import { create } from "zustand";
import type { LeitnerFolder, LeitnerSourceKind } from "@/types";
import {
  getAllLeitnerFolders,
  saveLeitnerFolder,
  deleteLeitnerFolder as dbDeleteFolder,
} from "@/lib/db";
import { pushFolder, deleteRemoteFolder } from "@/lib/leitnerFolderSync";

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

interface FolderState {
  folders: LeitnerFolder[];
  loaded: boolean;
  load: () => Promise<void>;
  addFolder: (input: {
    name: string;
    kind: LeitnerSourceKind | "custom";
    sourceRef?: string;
    parentId?: string;
    color?: string;
  }) => Promise<LeitnerFolder>;
  /** Find or create a folder for a given source (e.g. one folder per book/video). */
  ensureFolder: (input: {
    name: string;
    kind: LeitnerSourceKind | "custom";
    sourceRef?: string;
    parentId?: string;
  }) => Promise<LeitnerFolder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  getById: (id: string | undefined) => LeitnerFolder | undefined;
  getByKindRef: (
    kind: LeitnerSourceKind | "custom",
    sourceRef?: string,
  ) => LeitnerFolder | undefined;
}

export const useLeitnerFolderStore = create<FolderState>((set, get) => ({
  folders: [],
  loaded: false,
  load: async () => {
    const folders = await getAllLeitnerFolders();
    set({ folders, loaded: true });
  },
  addFolder: async ({ name, kind, sourceRef, parentId, color }) => {
    const folder: LeitnerFolder = {
      id: uuid(),
      name: name.trim() || "Untitled folder",
      kind,
      sourceRef,
      parentId,
      color,
      createdAt: Date.now(),
    };
    await saveLeitnerFolder(folder);
    set({ folders: [...get().folders, folder] });
    pushFolder(folder).catch(() => undefined);
    return folder;
  },
  ensureFolder: async ({ name, kind, sourceRef, parentId }) => {
    const found = get().folders.find(
      (f) => f.kind === kind && (f.sourceRef ?? "") === (sourceRef ?? ""),
    );
    if (found) return found;
    return get().addFolder({ name, kind, sourceRef, parentId });
  },
  renameFolder: async (id, name) => {
    const f = get().folders.find((x) => x.id === id);
    if (!f) return;
    const updated = { ...f, name: name.trim() || f.name };
    await saveLeitnerFolder(updated);
    set({ folders: get().folders.map((x) => (x.id === id ? updated : x)) });
    pushFolder(updated).catch(() => undefined);
  },
  deleteFolder: async (id) => {
    await dbDeleteFolder(id);
    set({ folders: get().folders.filter((x) => x.id !== id) });
    deleteRemoteFolder(id).catch(() => undefined);
  },
  getById: (id) => (id ? get().folders.find((f) => f.id === id) : undefined),
  getByKindRef: (kind, sourceRef) =>
    get().folders.find((f) => f.kind === kind && (f.sourceRef ?? "") === (sourceRef ?? "")),
}));
