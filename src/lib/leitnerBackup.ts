/**
 * Leitner backup / restore utilities.
 *
 * Exports the full local card and folder collection to a portable JSON file and
 * re-imports it on another device or after data loss. Cards are deduplicated by
 * normalized front text so importing the same backup twice is a no-op.
 */
import { z } from "zod";
import type { LeitnerCard, LeitnerFolder } from "@/types";
import {
  getAllLeitnerCards,
  getAllLeitnerFolders,
  saveLeitnerCard,
  saveLeitnerFolder,
} from "@/lib/db";
import { pushCard } from "@/lib/leitnerSync";
import { pushFolder } from "@/lib/leitnerFolderSync";
import { normalizeFront } from "@/lib/leitner";

const cefrSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional();
const sourceKindSchema = z
  .enum(["video", "audio", "book", "language_book", "news", "manual"])
  .optional();
const folderKindSchema = z.enum([
  "video",
  "audio",
  "book",
  "language_book",
  "news",
  "manual",
  "custom",
]);

const reviewLogSchema = z.object({
  at: z.number(),
  rating: z.enum(["again", "hard", "good", "easy"]),
  box: z.number().int().min(1).max(5),
  intervalMs: z.number(),
});

const cardSchema = z.object({
  id: z.string().min(1),
  front: z.string(),
  back: z.string(),
  box: z.number().int().min(1).max(5),
  nextReview: z.number(),
  sourceVideoId: z.string().optional(),
  sourceCueId: z.string().optional(),
  createdAt: z.number(),
  lastReviewed: z.number().optional(),
  exampleSentence: z.string().optional(),
  audioUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  folderId: z.string().optional(),
  sourceStartMs: z.number().optional(),
  sourceEndMs: z.number().optional(),
  sourceUrl: z.string().optional(),
  sourceTitle: z.string().optional(),
  sourceKind: sourceKindSchema,
  lastIntervalMs: z.number().optional(),
  lapseCount: z.number().optional(),
  easeFactor: z.number().optional(),
  reviewLog: z.array(reviewLogSchema).optional(),
  cefr: cefrSchema,
  partOfSpeech: z.string().optional(),
  starred: z.boolean().optional(),
  synonyms: z.array(z.string()).optional(),
  antonyms: z.array(z.string()).optional(),
});

const folderSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: folderKindSchema,
  sourceRef: z.string().optional(),
  parentId: z.string().optional(),
  color: z.string().optional(),
  createdAt: z.number(),
});

const backupSchema = z.object({
  version: z.literal(1).default(1),
  appName: z.literal("zip-to-git-friend").optional(),
  exportedAt: z.string().default(() => new Date().toISOString()),
  cards: z.array(cardSchema),
  folders: z.array(folderSchema),
});

export type LeitnerBackup = z.infer<typeof backupSchema>;

export interface BackupImportResult {
  cardsAdded: number;
  cardsSkipped: number;
  foldersAdded: number;
  foldersSkipped: number;
}

export function createBackup(
  cards: LeitnerCard[],
  folders: LeitnerFolder[],
  now = Date.now(),
): LeitnerBackup {
  return {
    version: 1,
    appName: "zip-to-git-friend",
    exportedAt: new Date(now).toISOString(),
    cards,
    folders,
  };
}

export function serializeBackup(backup: LeitnerBackup): string {
  return JSON.stringify(backup, null, 2);
}

export function parseBackup(json: string): LeitnerBackup {
  const raw = JSON.parse(json);
  return backupSchema.parse(raw);
}

export function downloadBackup(cards: LeitnerCard[], folders: LeitnerFolder[]): void {
  const backup = createBackup(cards, folders);
  const blob = new Blob([serializeBackup(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `leitner-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function sanitizeCard(card: Omit<LeitnerCard, "box"> & { box: number }): LeitnerCard {
  return {
    ...card,
    box: Math.min(5, Math.max(1, Math.round(card.box))) as LeitnerCard["box"],
    nextReview: Number.isFinite(card.nextReview) ? card.nextReview : Date.now(),
    createdAt: Number.isFinite(card.createdAt) ? card.createdAt : Date.now(),
  };
}

export async function importBackupFromFile(file: File): Promise<BackupImportResult> {
  const text = await file.text();
  const backup = parseBackup(text);

  const existingCards = await getAllLeitnerCards();
  const existingFronts = new Set(existingCards.map((c) => normalizeFront(c.front)));
  const existingFolderIds = new Set((await getAllLeitnerFolders()).map((f) => f.id));

  const result: BackupImportResult = {
    cardsAdded: 0,
    cardsSkipped: 0,
    foldersAdded: 0,
    foldersSkipped: 0,
  };

  for (const folder of backup.folders) {
    if (existingFolderIds.has(folder.id)) {
      result.foldersSkipped++;
      continue;
    }
    await saveLeitnerFolder(folder);
    existingFolderIds.add(folder.id);
    pushFolder(folder).catch(() => undefined);
    result.foldersAdded++;
  }

  for (const raw of backup.cards) {
    const card = sanitizeCard(raw);
    const key = normalizeFront(card.front);
    if (existingFronts.has(key)) {
      result.cardsSkipped++;
      continue;
    }
    await saveLeitnerCard(card);
    existingFronts.add(key);
    pushCard(card).catch(() => undefined);
    result.cardsAdded++;
  }

  return result;
}
