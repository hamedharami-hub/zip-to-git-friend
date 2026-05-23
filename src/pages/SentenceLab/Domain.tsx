import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Folder, Pill, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import type { CategoryWithStats } from '@/lib/sentenceCategories';

const DOMAIN_META: Record<string, { name: string; icon: any; description: string }> = {
  pharmacy: {
    name: 'Pharmacy', icon: Pill,
    description: 'تخصصی دارویی — مشاوره بیمار، نسخه‌پیچی، عوارض',
  },
  medical: {
    name: 'Medical', icon: Stethoscope,
    description: 'تخصصی پزشکی — کلینیک GP و PESCI',
  },
};

export default function SentenceDomainPage() {
  const { domain = '' } = useParams<{ domain: string }>();
  const navigate = useNavigate();
  const [cats, setCats] = useState<CategoryWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('sentence_categories')
        .select('*')
        .is('parent_id', null)
        .eq('domain', domain)
        .order('sort_order', { ascending: true });

      const cats = (data ?? []).map((row: any): CategoryWithStats => ({
        id: row.id, slug: row.slug, name: row.name, description: row.description,
        icon: row.icon, color: row.color, parentId: row.parent_id,
        sortOrder: row.sort_order, isDefault: row.is_default, createdBy: row.created_by,
        childrenCount: 0, sentenceCount: 0,
      }));

      // counts
      const slugs = cats.map((c) => c.slug);
      if (slugs.length > 0) {
        const { data: sents } = await supabase
          .from('sentence_lab')
          .select('category')
          .eq('status', 'published')
          .in('category', slugs);
        const map = new Map<string, number>();
        for (const s of sents ?? []) {
          if (s.category) map.set(s.category, (map.get(s.category) ?? 0) + 1);
        }
        for (const c of cats) c.sentenceCount = map.get(c.slug) ?? 0;
      }

      setCats(cats);
      setLoading(false);
    })();
  }, [domain]);

  const meta = DOMAIN_META[domain];
  const DomainIcon = meta?.icon ?? Folder;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/sentence-lab')} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <DomainIcon className="h-5 w-5 text-primary" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sentence Lab</p>
              <h1 className="text-base font-semibold leading-none">{meta?.name ?? domain}</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-5">
        {meta?.description && (
          <p className="mb-4 text-xs text-muted-foreground" dir="rtl">{meta.description}</p>
        )}
        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : cats.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            هنوز دسته‌ای در این حوزه وجود ندارد.
          </CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {cats.map((c) => (
              <Link
                key={c.id}
                to={`/sentence-lab/${c.slug}`}
                className="group flex items-center justify-between rounded-2xl border bg-card p-4 transition-all hover:border-primary/50 hover:bg-accent/40"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{c.name}</p>
                  {c.description && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.description}</p>
                  )}
                </div>
                <Badge variant="secondary" className="text-[10px]">{c.sentenceCount}</Badge>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
