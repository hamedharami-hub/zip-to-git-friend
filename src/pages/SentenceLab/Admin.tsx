/**
 * Admin tool: Batch-complete missing fields on the sentence catalog.
 * Calls the `sentence-batch-complete` edge function which uses Lovable AI
 * to fill `english_aussie`, `expected_intent`, `ai_counter_prompt`.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Wand2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MissingStat {
  total: number;
  missingAussie: number;
  missingIntent: number;
  missingCounter: number;
}

export default function SentenceAdminPage() {
  const navigate = useNavigate();
  const [stat, setStat] = useState<MissingStat | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [batchSize, setBatchSize] = useState(25);
  const [category, setCategory] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [doneRuns, setDoneRuns] = useState(0);

  async function loadStats() {
    setLoading(true);
    const [t, a, i, c] = await Promise.all([
      supabase.from('sentence_lab').select('*', { count: 'exact', head: true }).eq('status', 'published'),
      supabase.from('sentence_lab').select('*', { count: 'exact', head: true }).eq('status', 'published').is('english_aussie', null),
      supabase.from('sentence_lab').select('*', { count: 'exact', head: true }).eq('status', 'published').is('expected_intent', null),
      supabase.from('sentence_lab').select('*', { count: 'exact', head: true }).eq('status', 'published').is('ai_counter_prompt', null),
    ]);
    setStat({
      total: t.count ?? 0,
      missingAussie: a.count ?? 0,
      missingIntent: i.count ?? 0,
      missingCounter: c.count ?? 0,
    });
    setLoading(false);
  }

  useEffect(() => {
    void loadStats();
  }, []);

  async function runBatch() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('sentence-batch-complete', {
        body: { limit: batchSize, category: category || undefined },
      });
      if (error) throw error;
      const msg = `Batch ${doneRuns + 1}: scanned ${data.scanned}, updated ${data.updated}, failed ${data.failed}`;
      setLog((prev) => [msg, ...prev].slice(0, 20));
      setDoneRuns((n) => n + 1);
      toast.success(msg);
      await loadStats();
    } catch (e: any) {
      console.error(e);
      toast.error(`Batch failed: ${e?.message ?? e}`);
      setLog((prev) => [`✗ ${e?.message ?? e}`, ...prev].slice(0, 20));
    } finally {
      setRunning(false);
    }
  }

  async function runUntilDone() {
    if (!stat) return;
    const totalMissing = Math.max(stat.missingAussie, stat.missingIntent, stat.missingCounter);
    const rounds = Math.ceil(totalMissing / batchSize);
    if (rounds > 20) {
      if (!confirm(`This needs ~${rounds} rounds. Continue?`)) return;
    }
    for (let i = 0; i < rounds; i++) {
      await runBatch();
    }
  }

  const totalMissing = stat ? Math.max(stat.missingAussie, stat.missingIntent, stat.missingCounter) : 0;
  const completePct = stat && stat.total > 0 ? Math.round(((stat.total - totalMissing) / stat.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/sentence-lab')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-base font-semibold leading-none">Sentence Admin</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              تکمیل خودکار جمله‌های ناقص با AI
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-5 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">پوشش محتوا</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading || !stat ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">کامل بودن کلی</span>
                    <span className="tabular-nums font-medium">{completePct}%</span>
                  </div>
                  <Progress value={completePct} className="h-2" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Total" value={stat.total} />
                  <Stat label="بدون Aussie" value={stat.missingAussie} warn />
                  <Stat label="بدون Intent" value={stat.missingIntent} warn />
                  <Stat label="بدون Counter-Prompt" value={stat.missingCounter} warn />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wand2 className="h-4 w-4" /> اجرای دسته‌ای
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="batch" className="text-xs">تعداد در هر اجرا</Label>
                <Input
                  id="batch"
                  type="number"
                  min={1}
                  max={100}
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="mt-1 h-8 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="cat" className="text-xs">فقط دسته (اختیاری)</Label>
                <Input
                  id="cat"
                  placeholder="general / aussie_life / ..."
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 h-8 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={runBatch} disabled={running} size="sm" className="flex-1">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                یک دسته اجرا کن
              </Button>
              <Button onClick={runUntilDone} disabled={running} variant="secondary" size="sm" className="flex-1">
                تا تکمیل کامل
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              هر دسته ~{batchSize * 0.5}s طول می‌کشه. جمله‌ها کم‌کم با Australian English،
              Intent و Counter-Prompt برای Roleplay پر میشن.
            </p>
          </CardContent>
        </Card>

        {log.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">گزارش</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-xs font-mono">
                {log.map((l, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    {l.startsWith('✗') ? (
                      <AlertCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                    )}
                    <span className="text-muted-foreground">{l}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-md border p-2 ${warn && value > 0 ? 'border-amber-500/40 bg-amber-500/5' : 'bg-muted/30'}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}
