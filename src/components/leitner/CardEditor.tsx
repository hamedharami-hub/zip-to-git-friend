import { useEffect, useState } from "react";
import { ImageIcon, Loader2, Save, Sparkles, Trash2, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLeitnerStore } from "@/store/leitnerStore";
import { useLeitnerFolderStore } from "@/store/leitnerFolderStore";
import { generateCardDefinition, generateCardExamples, generateCardImage } from "@/lib/leitnerAi";
import { playClip, speak } from "@/lib/leitnerTts";
import type { LeitnerCard } from "@/types";
import { toast } from "sonner";

interface Props {
  card: LeitnerCard;
  onClose: () => void;
}

export function CardEditor({ card, onClose }: Props) {
  const updateCard = useLeitnerStore((s) => s.updateCard);
  const deleteCard = useLeitnerStore((s) => s.deleteCard);
  const folders = useLeitnerFolderStore((s) => s.folders);

  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [example, setExample] = useState(card.exampleSentence ?? "");
  const [folderId, setFolderId] = useState<string>(card.folderId ?? "none");
  const [imageUrl, setImageUrl] = useState(card.imageUrl ?? "");
  const [imgLoading, setImgLoading] = useState(false);
  const [exLoading, setExLoading] = useState(false);
  const [defLoading, setDefLoading] = useState(false);
  const [exSuggestions, setExSuggestions] = useState<string[]>([]);

  // Keep local state in sync if card changes externally (e.g. AI sync)
  useEffect(() => {
    setFront(card.front);
    setBack(card.back);
    setExample(card.exampleSentence ?? "");
    setFolderId(card.folderId ?? "none");
    setImageUrl(card.imageUrl ?? "");
  }, [card.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    await updateCard(card.id, {
      front: front.trim(),
      back: back.trim(),
      exampleSentence: example.trim() || undefined,
      folderId: folderId === "none" ? undefined : folderId,
      imageUrl: imageUrl || undefined,
    });
    toast.success("Card saved");
    onClose();
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this card?")) return;
    await deleteCard(card.id);
    toast.success("Card deleted");
    onClose();
  };

  const handleGenerateImage = async () => {
    if (!front.trim()) {
      toast.error("Add a word first");
      return;
    }
    setImgLoading(true);
    try {
      const { imageUrl: url } = await generateCardImage({
        cardId: card.id,
        word: front.trim(),
        example: example.trim() || back.trim(),
      });
      setImageUrl(url);
      await updateCard(card.id, { imageUrl: url });
      toast.success("Image generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image generation failed");
    } finally {
      setImgLoading(false);
    }
  };

  const handleGenerateExamples = async () => {
    if (!front.trim()) return;
    setExLoading(true);
    try {
      const list = await generateCardExamples({
        word: front.trim(),
        existingExample: example.trim() || undefined,
      });
      setExSuggestions(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Example generation failed");
    } finally {
      setExLoading(false);
    }
  };

  const handleGenerateDefinition = async () => {
    if (!front.trim()) return;
    setDefLoading(true);
    try {
      const { definition, persian } = await generateCardDefinition({
        word: front.trim(),
      });
      const merged = persian ? `${persian}${definition ? ` — ${definition}` : ""}` : definition;
      if (merged) setBack(merged);
      toast.success("Definition generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Definition generation failed");
    } finally {
      setDefLoading(false);
    }
  };

  const handleSpeak = (text: string) => {
    if (card.audioUrl) {
      playClip(card.audioUrl).catch(() => speak(text));
    } else {
      speak(text);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4 max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Edit card</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Box {card.box} · {card.sourceKind ?? "manual"}
            {card.sourceTitle ? ` · ${card.sourceTitle}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close editor">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="card-front">Word / phrase</Label>
        <div className="flex gap-2">
          <Input
            id="card-front"
            value={front}
            onChange={(e) => setFront(e.target.value)}
            placeholder="e.g. break the ice"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleSpeak(front)}
            aria-label="Pronounce word"
          >
            <Volume2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="card-back">Definition / translation</Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={handleGenerateDefinition}
            disabled={defLoading}
          >
            {defLoading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1" />
            )}
            AI definition
          </Button>
        </div>
        <Textarea
          id="card-back"
          value={back}
          onChange={(e) => setBack(e.target.value)}
          placeholder="Translation or definition…"
          rows={2}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="card-example">Example sentence</Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={handleGenerateExamples}
            disabled={exLoading}
          >
            {exLoading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1" />
            )}
            AI examples
          </Button>
        </div>
        <div className="flex gap-2">
          <Textarea
            id="card-example"
            value={example}
            onChange={(e) => setExample(e.target.value)}
            placeholder="A natural sentence using this word"
            rows={2}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleSpeak(example || front)}
            aria-label="Pronounce example"
            className="self-start"
          >
            <Volume2 className="h-4 w-4" />
          </Button>
        </div>
        {exSuggestions.length > 0 && (
          <div className="space-y-1.5 pt-2">
            <p className="text-xs text-muted-foreground">Tap to use:</p>
            {exSuggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => {
                  setExample(s);
                  setExSuggestions([]);
                }}
                className="block w-full text-left text-sm px-3 py-2 rounded-md bg-muted/60 hover:bg-muted transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Folder</Label>
        <Select value={folderId} onValueChange={setFolderId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No folder</SelectItem>
            {folders.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Illustration</Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={handleGenerateImage}
            disabled={imgLoading}
          >
            {imgLoading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5 mr-1" />
            )}
            Generate image
          </Button>
        </div>
        {imageUrl ? (
          <div className="relative">
            <img
              src={imageUrl}
              alt={`Illustration for ${front}`}
              className="rounded-lg border border-border w-full max-w-sm aspect-square object-cover"
              loading="lazy"
            />
            <Button
              variant="secondary"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => setImageUrl("")}
            >
              Remove
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border h-32 flex items-center justify-center text-xs text-muted-foreground">
            No image yet
          </div>
        )}
      </div>

      {card.audioUrl && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Volume2 className="h-3.5 w-3.5" />
          <span>Source clip attached</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => playClip(card.audioUrl!)}
          >
            Play
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDelete}>
          <Trash2 className="h-4 w-4 mr-1.5" />
          Delete
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Save className="h-4 w-4 mr-1.5" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
