import { useMemo, useState } from "react";
import { ImageIcon, Plus, Search, Volume2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLeitnerStore } from "@/store/leitnerStore";
import { useLeitnerFolderStore } from "@/store/leitnerFolderStore";
import type { LeitnerCard } from "@/types";
import { speak, playClip } from "@/lib/leitnerTts";
import { toast } from "sonner";
import { EnrichFolderButton } from "./EnrichFolderButton";

interface Props {
  /** When set, only cards in this folder are shown. */
  folderId: string | null;
  onEdit: (card: LeitnerCard) => void;
}

const BOX_LABEL: Record<number, string> = {
  1: "Box 1",
  2: "Box 2",
  3: "Box 3",
  4: "Box 4",
  5: "Box 5",
};

export function CardList({ folderId, onEdit }: Props) {
  const cards = useLeitnerStore((s) => s.cards);
  const addCard = useLeitnerStore((s) => s.addCard);
  const toggleStar = useLeitnerStore((s) => s.toggleStar);
  const folders = useLeitnerFolderStore((s) => s.folders);

  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newFront, setNewFront] = useState("");
  const [newBack, setNewBack] = useState("");

  const folder = folders.find((f) => f.id === folderId) ?? null;

  const filtered = useMemo(() => {
    const base = folderId ? cards.filter((c) => c.folderId === folderId) : cards;
    const q = query.trim().toLowerCase();
    const list = q
      ? base.filter(
          (c) =>
            c.front.toLowerCase().includes(q) ||
            c.back.toLowerCase().includes(q) ||
            (c.exampleSentence ?? "").toLowerCase().includes(q),
        )
      : base;
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [cards, folderId, query]);

  const handleAdd = async () => {
    if (!newFront.trim()) return;
    const result = await addCard({
      front: newFront.trim(),
      back: newBack.trim(),
      folderId: folderId ?? undefined,
      sourceKind: "manual",
    });
    if (result === "duplicate") {
      toast.message("Card already exists — context updated");
    } else {
      toast.success("Card added");
    }
    setNewFront("");
    setNewBack("");
    setAdding(false);
  };

  const handleSpeak = (card: LeitnerCard) => {
    if (card.audioUrl) {
      playClip(card.audioUrl).catch(() => speak(card.front));
    } else {
      speak(card.exampleSentence || card.front);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold truncate">{folder ? folder.name : "All cards"}</h3>
          <p className="text-xs text-muted-foreground">
            {filtered.length} card{filtered.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {folder && <EnrichFolderButton folderId={folder.id} folderName={folder.name} />}
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New card
          </Button>
        </div>
      </div>

      {adding && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <Input
            autoFocus
            value={newFront}
            onChange={(e) => setNewFront(e.target.value)}
            placeholder="Word or phrase (English)"
          />
          <Input
            value={newBack}
            onChange={(e) => setNewBack(e.target.value)}
            placeholder="Translation / definition"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={!newFront.trim()}>
              Add
            </Button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cards…"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground text-sm">
          {query
            ? "No cards match your search."
            : "No cards in this folder yet. Add one above, or save words from the player/reader."}
        </div>
      ) : (
        <ul className="grid gap-2">
          {filtered.map((card) => {
            const due = card.nextReview <= Date.now();
            return (
              <li
                key={card.id}
                className="group rounded-lg border border-border bg-card hover:bg-card/80 transition-colors"
              >
                <button
                  onClick={() => onEdit(card)}
                  className="w-full text-left p-3 flex items-start gap-3"
                >
                  {card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt=""
                      className="h-12 w-12 rounded-md object-cover shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <ImageIcon className="h-5 w-5 text-muted-foreground/60" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{card.front}</p>
                      <span
                        className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                          due ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {BOX_LABEL[card.box]}
                      </span>
                    </div>
                    {card.back && (
                      <p dir="auto" className="text-sm text-muted-foreground truncate mt-0.5">
                        {card.back}
                      </p>
                    )}
                    {card.exampleSentence && (
                      <p className="text-xs text-muted-foreground/80 truncate mt-0.5 italic">
                        “{card.exampleSentence}”
                      </p>
                    )}
                    {card.synonyms?.length || card.antonyms?.length ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {card.synonyms?.slice(0, 4).map((s, i) => (
                          <span
                            key={`syn-${i}`}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary/90"
                          >
                            ≈ {s}
                          </span>
                        ))}
                        {card.antonyms?.slice(0, 3).map((a, i) => (
                          <span
                            key={`ant-${i}`}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive/90"
                          >
                            ≠ {a}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={
                        card.starred
                          ? "text-amber-500"
                          : "opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleStar(card.id);
                      }}
                      aria-label={card.starred ? "Unstar" : "Star"}
                    >
                      <Star className={`h-4 w-4 ${card.starred ? "fill-amber-500" : ""}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSpeak(card);
                      }}
                      aria-label="Pronounce"
                    >
                      <Volume2 className="h-4 w-4" />
                    </Button>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
