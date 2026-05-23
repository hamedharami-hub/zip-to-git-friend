/**
 * Enrich-folder button.
 *
 * Sends every card in the active folder to the `leitner-enrich-folder`
 * edge function and patches each card with the AI-generated:
 *   - back / definition (when missing)
 *   - exampleSentence (when missing)
 *   - synonyms / antonyms
 *
 * Runs in the background; user sees a single toast with progress.
 */
import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useLeitnerStore } from '@/store/leitnerStore';
import { useOnline } from '@/hooks/useOnline';
import { toast } from 'sonner';

interface Props {
  folderId: string;
  folderName: string;
}

interface EnrichPatch {
  id: string;
  back?: string;
  exampleSentence?: string;
  synonyms?: string[];
  antonyms?: string[];
}

export function EnrichFolderButton({ folderId, folderName }: Props) {
  const cards = useLeitnerStore((s) => s.cards);
  const updateCard = useLeitnerStore((s) => s.updateCard);
  const online = useOnline();
  const [busy, setBusy] = useState(false);

  const folderCards = cards.filter((c) => c.folderId === folderId);

  const run = async () => {
    if (!online) {
      toast.error('برای پردازش به اینترنت نیاز دارید.');
      return;
    }
    if (folderCards.length === 0) {
      toast.message('این فولدر خالی است.');
      return;
    }
    setBusy(true);
    const tid = toast.loading(
      `پردازش "${folderName}" — ${folderCards.length} کارت…`,
    );
    try {
      const payload = folderCards.map((c) => ({
        id: c.id,
        front: c.front,
        back: c.back,
        exampleSentence: c.exampleSentence,
        synonyms: c.synonyms,
        antonyms: c.antonyms,
      }));

      const { data, error } = await supabase.functions.invoke('leitner-enrich-folder', {
        body: { cards: payload },
      });

      if (error) throw error;
      const patches: EnrichPatch[] = Array.isArray(data?.patches) ? data.patches : [];
      let applied = 0;
      for (const p of patches) {
        const card = folderCards.find((c) => c.id === p.id);
        if (!card) continue;
        const patch: Record<string, unknown> = {};
        if (p.back && (!card.back || card.back.trim().length < 2)) patch.back = p.back;
        if (
          p.exampleSentence &&
          (!card.exampleSentence || card.exampleSentence.trim().length < 8)
        ) {
          patch.exampleSentence = p.exampleSentence;
        }
        if (Array.isArray(p.synonyms) && p.synonyms.length > 0) {
          patch.synonyms = p.synonyms;
        }
        if (Array.isArray(p.antonyms) && p.antonyms.length > 0) {
          patch.antonyms = p.antonyms;
        }
        if (Object.keys(patch).length > 0) {
          await updateCard(card.id, patch);
          applied++;
        }
      }
      toast.success(`${applied} کارت غنی‌سازی شد.`, { id: tid });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطای ناشناخته';
      toast.error(`پردازش ناموفق بود: ${msg}`, { id: tid });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={run}
      disabled={busy || folderCards.length === 0}
      className="gap-1.5"
      title="با AI تعریف، مثال، مترادف و متضاد را برای همهٔ کارت‌ها کامل می‌کند"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5" />
      )}
      <span>پردازش کل لغت‌ها</span>
    </Button>
  );
}
