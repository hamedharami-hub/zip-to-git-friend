import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Mic,
  Square,
  RefreshCw,
  Check,
  Sparkles,
  Trophy,
  Lightbulb,
  ArrowLeftRight,
  Bookmark,
  BookmarkCheck,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSettingsStore } from "@/store/settingsStore";
import {
  fetchCategoryBySlug,
  fetchSubcategories,
  type SentenceCategory,
} from "@/lib/sentenceCategories";
import { isWebSpeechSupported, startWebSpeech, type WebSpeechController } from "@/lib/webSpeech";
import { getSentenceAudio } from "@/lib/sentenceAudio";
import { BrowserTtsController, isBrowserTtsSupported } from "@/lib/browserTts";
import { cn } from "@/lib/utils";

interface RoleOption {
  user_role: string;
  ai_role: string;
  label: string;
}
interface Scenario {
  title_en: string;
  title_fa: string;
  user_role: string;
  ai_role: string;
  role_options?: RoleOption[];
  scene_en: string;
  scene_fa: string;
  ai_opening_line: string;
  goal_en: string;
  difficulty: "easy" | "medium" | "hard";
}

interface TargetSentence {
  id: string;
  english: string;
  persian: string | null;
}
interface TurnUsage {
  id: string;
  used: boolean;
  similarity: number;
}
interface GrammarMarker {
  span: string;
  correction: string;
  rule_label: string;
  explanation?: string;
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  usage?: TurnUsage[];
  grammar_markers?: GrammarMarker[];
  saved?: boolean;
}

export default function SentenceScenarioPage() {
  const { categorySlug = "", subSlug = "" } = useParams<{
    categorySlug: string;
    subSlug: string;
  }>();
  const [searchParams] = useSearchParams();
  const extraSubs = (searchParams.get("subs") ?? "").split(",").filter(Boolean);
  const navigate = useNavigate();
  const { toast } = useToast();
  const sentenceLabModelRef = useSettingsStore((s) => s.settings.sentenceLabModelRef);
  const model = sentenceLabModelRef?.provider === "gateway" ? sentenceLabModelRef.model : undefined;

  const [category, setCategory] = useState<SentenceCategory | null>(null);
  const [sub, setSub] = useState<SentenceCategory | null>(null);
  const [allSubs, setAllSubs] = useState<SentenceCategory[]>([]);
  const [selectedSubSlugs, setSelectedSubSlugs] = useState<string[]>([]);
  const [targets, setTargets] = useState<TargetSentence[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [chosen, setChosen] = useState<Scenario | null>(null);
  const [activeRole, setActiveRole] = useState<RoleOption | null>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [interim, setInterim] = useState("");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [complete, setComplete] = useState<{ reason: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [savePromptFor, setSavePromptFor] = useState<{ idx: number; msg: ChatMsg } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const recogRef = useRef<WebSpeechController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load category + subs + sentences (supports multi-sub via ?subs=a,b,c)
  useEffect(() => {
    void (async () => {
      const c = await fetchCategoryBySlug(categorySlug);
      setCategory(c);
      const subList = await fetchSubcategories(categorySlug).catch(() => []);
      setAllSubs(subList);

      const baseSubs = subSlug && subSlug !== "all" ? [subSlug, ...extraSubs] : extraSubs;
      const initial = Array.from(new Set(baseSubs));
      setSelectedSubSlugs(initial);

      const s = subSlug && subSlug !== "all" ? await fetchCategoryBySlug(subSlug) : null;
      setSub(s);

      await loadTargets(initial);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorySlug, subSlug]);

  const loadTargets = useCallback(
    async (subSlugs: string[]) => {
      let q = supabase
        .from("sentence_lab")
        .select("id, english, persian")
        .eq("status", "published")
        .eq("category", categorySlug)
        .limit(40);
      if (subSlugs.length > 0) q = q.in("subcategory", subSlugs);
      const { data, error } = await q;
      if (error) {
        toast({ title: "Load failed", description: error.message, variant: "destructive" });
        return;
      }
      setTargets(
        (data ?? []).map((r: any) => ({
          id: r.id,
          english: r.english,
          persian: r.persian,
        })),
      );
    },
    [categorySlug, toast],
  );

  const generateScenarios = useCallback(async () => {
    if (targets.length === 0) {
      toast({
        title: "No sentences",
        description: "No sentences in selection.",
        variant: "destructive",
      });
      return;
    }
    setLoadingScenarios(true);
    setScenarios(null);
    try {
      const { data, error } = await supabase.functions.invoke("sentence-scenario-generate", {
        body: {
          category_name: category?.name ?? null,
          subcategory_name: sub?.name ?? null,
          sentences: targets.slice(0, 25).map((t) => ({ id: t.id, english: t.english })),
          count: 3,
          model,
        },
      });
      if (error) throw error;
      const list = (data as any)?.scenarios as Scenario[] | undefined;
      if (!list || list.length === 0) throw new Error("No scenarios returned.");
      setScenarios(list);

      // Persist initial session row
      const { data: sessionRow } = await supabase
        .from("scenario_sessions")
        .insert({
          user_id: (await supabase.auth.getUser()).data.user?.id as string,
          category_slug: categorySlug,
          sub_slugs: selectedSubSlugs,
          category_label: category?.name ?? null,
          scenarios: list as any,
          target_sentence_ids: targets.map((t) => t.id),
        })
        .select("id")
        .single();
      if (sessionRow?.id) setSessionId(sessionRow.id);
    } catch (e: any) {
      toast({
        title: "Generation failed",
        description: e?.message ?? "Unknown",
        variant: "destructive",
      });
    } finally {
      setLoadingScenarios(false);
    }
  }, [category, sub, targets, model, toast, categorySlug, selectedSubSlugs]);

  // Auto-generate once targets load (and not already generated)
  useEffect(() => {
    if (targets.length > 0 && !scenarios && !loadingScenarios) {
      void generateScenarios();
    }
  }, [targets, scenarios, loadingScenarios, generateScenarios]);

  // Cleanup
  useEffect(
    () => () => {
      recogRef.current?.abort();
      audioRef.current?.pause();
    },
    [],
  );

  // Persist messages + usedIds whenever they change
  useEffect(() => {
    if (!sessionId || messages.length === 0) return;
    const t = window.setTimeout(() => {
      void supabase
        .from("scenario_sessions")
        .update({
          messages: messages as any,
          used_sentence_ids: Array.from(usedIds),
          chosen_index: chosen
            ? (scenarios?.findIndex((s) => s.title_en === chosen.title_en) ?? null)
            : null,
          user_role: activeRole?.user_role ?? null,
          ai_role: activeRole?.ai_role ?? null,
          is_complete: !!complete,
          completion_reason: complete?.reason ?? null,
        })
        .eq("id", sessionId);
    }, 800);
    return () => window.clearTimeout(t);
  }, [messages, usedIds, sessionId, chosen, scenarios, activeRole, complete]);

  const playReply = useCallback(async (text: string, idForCache: string) => {
    if (!text.trim()) return;
    audioRef.current?.pause();
    audioRef.current = null;
    setAiSpeaking(true);
    const onEnd = () => {
      setAiSpeaking(false);
      audioRef.current = null;
    };
    try {
      const url = await getSentenceAudio(`scenario_${idForCache}`, "en", text);
      const a = new Audio(url);
      audioRef.current = a;
      a.addEventListener("ended", onEnd, { once: true });
      a.addEventListener("error", onEnd, { once: true });
      await a.play();
      return;
    } catch {
      /* fallback */
    }
    if (isBrowserTtsSupported()) {
      try {
        const ctrl = new BrowserTtsController(text, { rate: 1, pitch: 1, volume: 1 });
        ctrl.start();
        const est = Math.min(15000, Math.max(1500, text.length * 70));
        window.setTimeout(onEnd, est);
        return;
      } catch {
        /* */
      }
    }
    onEnd();
  }, []);

  const startScenario = useCallback(
    async (sc: Scenario, role?: RoleOption) => {
      const chosenRole: RoleOption = role ??
        sc.role_options?.[0] ?? {
          user_role: sc.user_role,
          ai_role: sc.ai_role,
          label: `${sc.user_role} ↔ ${sc.ai_role}`,
        };
      setChosen(sc);
      setActiveRole(chosenRole);
      setMessages([{ role: "assistant", content: sc.ai_opening_line }]);
      setUsedIds(new Set());
      setComplete(null);
      void playReply(sc.ai_opening_line, `${sc.title_en.slice(0, 12)}_open`);
    },
    [playReply],
  );

  const swapRoles = useCallback(() => {
    if (!activeRole) return;
    setActiveRole({
      user_role: activeRole.ai_role,
      ai_role: activeRole.user_role,
      label: `${activeRole.ai_role} ↔ ${activeRole.user_role}`,
    });
    toast({ title: "Roles swapped", description: `You are now: ${activeRole.ai_role}` });
  }, [activeRole, toast]);

  // ─────── Tap-to-speak: synchronous start, click-again to stop ───────
  const micPermissionGrantedRef = useRef(false);
  const startMic = useCallback(() => {
    if (!isWebSpeechSupported()) {
      toast({
        title: "Browser not supported",
        description:
          "Speech recognition requires Chrome on Android/desktop or Safari on iOS 14.5+. Open this app directly (not inside the editor preview) for best results.",
        variant: "destructive",
      });
      return;
    }
    if (recording || busy) return;
    // Stop AI speech immediately (barge-in)
    if (aiSpeaking) {
      audioRef.current?.pause();
      audioRef.current = null;
      setAiSpeaking(false);
    }
    try {
      setInterim("");
      // CRITICAL: instantiate inside the user gesture handler synchronously.
      // Do NOT await getUserMedia here — that breaks the gesture and Web
      // Speech will silently fail. Browsers will prompt for mic permission
      // on rec.start() itself.
      const ctrl = startWebSpeech({
        lang: "en-US",
        interimResults: true,
        onInterim: (t) => setInterim(t),
      });
      recogRef.current = ctrl;
      setRecording(true);
      micPermissionGrantedRef.current = true;
    } catch (e: any) {
      console.error("[mic] startWebSpeech failed", e);
      toast({
        title: "Microphone blocked",
        description: e?.message ?? "Allow microphone access in browser settings and try again.",
        variant: "destructive",
      });
    }

    // After a moment, if still no interim result and not on a real device,
    // remind the user to allow the prompt.
    window.setTimeout(() => {
      if (recogRef.current && !interim && navigator.permissions) {
        navigator.permissions
          .query({ name: "microphone" as PermissionName })
          .then((p) => {
            if (p.state === "denied") {
              toast({
                title: "Microphone is blocked",
                description:
                  "Tap the lock icon in the address bar → Permissions → Allow microphone, then reload.",
                variant: "destructive",
              });
            }
          })
          .catch(() => {});
      }
    }, 1500);
  }, [recording, busy, aiSpeaking, toast, interim]);

  const stopMicAndSend = useCallback(async () => {
    if (!recording || !recogRef.current || !chosen || !activeRole) return;
    setRecording(false);
    let transcript = "";
    try {
      const r = await recogRef.current.stop();
      transcript = r.transcript.trim();
    } catch {
      /**/
    }
    recogRef.current = null;
    setInterim("");
    if (!transcript) {
      toast({ title: "Heard nothing", description: "Try again — speak closer to the mic." });
      return;
    }

    const nextHistory: ChatMsg[] = [...messages, { role: "user", content: transcript }];
    setMessages(nextHistory);
    setBusy(true);

    try {
      const { data, error } = await supabase.functions.invoke("sentence-scenario-chat", {
        body: {
          scenario: {
            title_en: chosen.title_en,
            user_role: activeRole.user_role,
            ai_role: activeRole.ai_role,
            scene_en: chosen.scene_en,
            goal_en: chosen.goal_en,
          },
          target_sentences: targets.map((t) => ({ id: t.id, english: t.english })),
          already_used_ids: Array.from(usedIds),
          transcript,
          history: nextHistory.slice(-12).map((m) => ({ role: m.role, content: m.content })),
          model,
        },
      });
      if (error) throw error;
      const r = data as any;
      const usage: TurnUsage[] = Array.isArray(r.target_usage) ? r.target_usage : [];
      const newlyUsed = usage.filter((u) => u.used).map((u) => u.id);
      if (newlyUsed.length) {
        setUsedIds((prev) => {
          const n = new Set(prev);
          newlyUsed.forEach((id) => n.add(id));
          return n;
        });
      }
      // Attach grammar markers + usage to the USER message (the one being analysed)
      setMessages((prev) => {
        const copy = [...prev];
        const lastUserIdx = [...copy].reverse().findIndex((m) => m.role === "user");
        if (lastUserIdx >= 0) {
          const realIdx = copy.length - 1 - lastUserIdx;
          copy[realIdx] = {
            ...copy[realIdx],
            usage,
            grammar_markers: Array.isArray(r.grammar_markers) ? r.grammar_markers : [],
          };
        }
        const reply = String(r.ai_audio_response ?? "");
        if (reply) copy.push({ role: "assistant", content: reply });
        return copy;
      });
      const reply = String(r.ai_audio_response ?? "");
      if (reply) void playReply(reply, `t${nextHistory.length}`);
      if (r.scenario_complete) {
        setComplete({ reason: String(r.completion_reason ?? "Scenario complete!") });
      }
    } catch (e: any) {
      toast({
        title: "Reply failed",
        description: e?.message ?? "Unknown",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [recording, chosen, activeRole, messages, targets, usedIds, model, playReply, toast]);

  const saveSentence = useCallback(
    async (msg: ChatMsg, note: string) => {
      const grammarTxt = (msg.grammar_markers ?? [])
        .map((g) => `${g.span} → ${g.correction}`)
        .join(" · ");
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) {
        toast({ title: "Sign in required", variant: "destructive" });
        return;
      }
      const { error } = await supabase.from("scenario_saved_sentences").insert({
        user_id: userId,
        session_id: sessionId,
        english: msg.content,
        source_role:
          msg.role === "user" ? (activeRole?.user_role ?? "me") : (activeRole?.ai_role ?? "ai"),
        note: note.trim() || null,
        grammar_correction: grammarTxt || null,
      });
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Saved ✓", description: "You can review it later in Saved Sentences." });
    },
    [sessionId, activeRole, toast],
  );

  const usedCount = usedIds.size;
  const totalCount = targets.length;
  const progressPct = totalCount ? Math.round((usedCount / totalCount) * 100) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                navigate(`/sentence-lab/${categorySlug}${subSlug ? `/${subSlug}` : ""}`)
              }
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Scenario · {category?.name ?? ""}
                {selectedSubSlugs.length > 0 && ` · ${selectedSubSlugs.length} sub`}
              </p>
              <h1 className="truncate text-sm font-semibold leading-tight sm:text-base">
                {chosen ? chosen.title_en : "🎭 Roleplay"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setHistoryOpen(true)}
              aria-label="Past sessions"
            >
              <History className="h-4 w-4" />
            </Button>
            {chosen && (
              <Badge variant="secondary" className="shrink-0 tabular-nums text-[10px]">
                {usedCount}/{totalCount}
              </Badge>
            )}
          </div>
        </div>
        {chosen && <Progress value={progressPct} className="h-0.5 rounded-none" />}
      </header>

      <main className="container mx-auto px-3 py-4 sm:px-4 sm:py-6">
        {!chosen ? (
          <ScenarioPicker
            scenarios={scenarios}
            loading={loadingScenarios}
            onPick={startScenario}
            onRegenerate={generateScenarios}
            targetCount={targets.length}
            allSubs={allSubs}
            selectedSubSlugs={selectedSubSlugs}
            onToggleSub={(slug) => {
              const next = selectedSubSlugs.includes(slug)
                ? selectedSubSlugs.filter((s) => s !== slug)
                : [...selectedSubSlugs, slug];
              setSelectedSubSlugs(next);
              setScenarios(null);
              void loadTargets(next);
            }}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
            <ChatPane
              scenario={chosen}
              activeRole={activeRole}
              messages={messages}
              interim={interim}
              recording={recording}
              busy={busy}
              aiSpeaking={aiSpeaking}
              complete={complete}
              onMicTap={recording ? stopMicAndSend : startMic}
              onSwapRoles={swapRoles}
              onSaveMessage={(idx, msg) => setSavePromptFor({ idx, msg })}
              onRestart={() => {
                audioRef.current?.pause();
                recogRef.current?.abort();
                setChosen(null);
                setActiveRole(null);
                setMessages([]);
                setUsedIds(new Set());
                setComplete(null);
              }}
            />
            <aside className="space-y-3">
              <ChecklistPanel targets={targets} usedIds={usedIds} />
            </aside>
          </div>
        )}
      </main>

      <SaveSentenceDialog
        open={!!savePromptFor}
        msg={savePromptFor?.msg ?? null}
        onClose={() => setSavePromptFor(null)}
        onConfirm={async (note) => {
          if (savePromptFor) {
            await saveSentence(savePromptFor.msg, note);
            setMessages((prev) =>
              prev.map((m, i) => (i === savePromptFor.idx ? { ...m, saved: true } : m)),
            );
          }
          setSavePromptFor(null);
        }}
      />

      <HistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onResume={(s) => {
          setHistoryOpen(false);
          setScenarios(s.scenarios);
          if (s.chosen_index != null && s.scenarios?.[s.chosen_index]) {
            const sc = s.scenarios[s.chosen_index];
            setChosen(sc);
            setActiveRole({
              user_role: s.user_role ?? sc.user_role,
              ai_role: s.ai_role ?? sc.ai_role,
              label: `${s.user_role ?? sc.user_role} ↔ ${s.ai_role ?? sc.ai_role}`,
            });
            setMessages(s.messages ?? []);
            setUsedIds(new Set(s.used_sentence_ids ?? []));
            if (s.is_complete) setComplete({ reason: s.completion_reason ?? "Done." });
          }
          setSessionId(s.id);
        }}
      />
    </div>
  );
}

/* ───────────────────── Scenario picker ───────────────────── */

function ScenarioPicker({
  scenarios,
  loading,
  onPick,
  onRegenerate,
  targetCount,
  allSubs,
  selectedSubSlugs,
  onToggleSub,
}: {
  scenarios: Scenario[] | null;
  loading: boolean;
  onPick: (s: Scenario, role?: RoleOption) => void;
  onRegenerate: () => void;
  targetCount: number;
  allSubs: SentenceCategory[];
  selectedSubSlugs: string[];
  onToggleSub: (slug: string) => void;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {allSubs.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Mix subcategories ({selectedSubSlugs.length} selected)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5 pt-0">
            {allSubs.map((s) => {
              const on = selectedSubSlugs.includes(s.slug);
              return (
                <button
                  key={s.id}
                  onClick={() => onToggleSub(s.slug)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {on && <Check className="mr-1 inline h-3 w-3" />}
                  {s.name}
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      {loading || !scenarios ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Designing 3 conversations from {targetCount} sentences…
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Pick a scenario, then choose your role.</p>
            <Button variant="outline" size="sm" onClick={onRegenerate}>
              <RefreshCw className="h-3.5 w-3.5" /> New ideas
            </Button>
          </div>
          <div className="grid gap-3">
            {scenarios.map((s, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight">{s.title_en}</CardTitle>
                    <Badge
                      variant={
                        s.difficulty === "hard"
                          ? "destructive"
                          : s.difficulty === "medium"
                            ? "default"
                            : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {s.difficulty}
                    </Badge>
                  </div>
                  <p dir="rtl" className="text-right text-xs text-muted-foreground">
                    {s.title_fa}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3 pt-0 text-sm">
                  <p>{s.scene_en}</p>
                  <p dir="rtl" className="text-right text-xs text-muted-foreground">
                    {s.scene_fa}
                  </p>
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Choose your role pair:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        s.role_options ?? [
                          {
                            user_role: s.user_role,
                            ai_role: s.ai_role,
                            label: `${s.user_role} ↔ ${s.ai_role}`,
                          },
                        ]
                      ).map((r, j) => (
                        <Button
                          key={j}
                          size="sm"
                          variant="outline"
                          onClick={() => onPick(s, r)}
                          className="h-auto whitespace-normal py-1.5 text-xs"
                        >
                          <Sparkles className="mr-1 h-3 w-3" />
                          You: {r.user_role}
                          <span className="mx-1 opacity-50">·</span>
                          AI: {r.ai_role}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────────────── Chat pane ───────────────────── */

function ChatPane({
  scenario,
  activeRole,
  messages,
  interim,
  recording,
  busy,
  aiSpeaking,
  complete,
  onMicTap,
  onSwapRoles,
  onSaveMessage,
  onRestart,
}: {
  scenario: Scenario;
  activeRole: RoleOption | null;
  messages: ChatMsg[];
  interim: string;
  recording: boolean;
  busy: boolean;
  aiSpeaking: boolean;
  complete: { reason: string } | null;
  onMicTap: () => void;
  onSwapRoles: () => void;
  onSaveMessage: (idx: number, m: ChatMsg) => void;
  onRestart: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm">🎭 {scenario.title_en}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium">Goal:</span> {scenario.goal_en}
            </p>
            {activeRole && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <Badge variant="outline" className="text-[10px]">
                  You: {activeRole.user_role}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  AI: {activeRole.ai_role}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={onSwapRoles}
                >
                  <ArrowLeftRight className="h-3 w-3" /> Swap
                </Button>
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onRestart}>
            <RefreshCw className="h-3.5 w-3.5" /> Change
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ScrollArea className="h-[380px] rounded-md border bg-muted/20 p-3">
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn("flex group", m.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "relative max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border",
                  )}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>

                  {m.grammar_markers && m.grammar_markers.length > 0 && (
                    <div className="mt-1.5 space-y-0.5 border-t border-border/30 pt-1.5">
                      {m.grammar_markers.slice(0, 4).map((g, idx) => (
                        <p key={idx} className="text-[10px] opacity-80">
                          <span className="line-through">{g.span}</span>
                          {" → "}
                          <span className="font-medium">{g.correction}</span>
                          {g.rule_label && (
                            <span className="ml-1 opacity-60">· {g.rule_label}</span>
                          )}
                        </p>
                      ))}
                    </div>
                  )}

                  {m.usage && m.usage.some((u) => u.used) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {m.usage
                        .filter((u) => u.used)
                        .map((u) => (
                          <Badge key={u.id} variant="secondary" className="gap-0.5 text-[9px]">
                            <Check className="h-2.5 w-2.5" /> used target
                          </Badge>
                        ))}
                    </div>
                  )}

                  <button
                    onClick={() => onSaveMessage(i, m)}
                    className={cn(
                      "absolute -top-2 -right-2 rounded-full border bg-background p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100",
                      m.saved && "opacity-100",
                    )}
                    aria-label={m.saved ? "Saved" : "Save sentence"}
                    title={m.saved ? "Saved" : "Save this sentence"}
                  >
                    {m.saved ? (
                      <BookmarkCheck className="h-3 w-3 text-primary" />
                    ) : (
                      <Bookmark className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
            ))}
            {interim && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl border border-dashed px-3 py-2 text-sm italic text-muted-foreground">
                  {interim}…
                </div>
              </div>
            )}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl border bg-card px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> AI is thinking…
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {complete ? (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Scenario complete</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{complete.reason}</p>
            <Button className="mt-2 w-full" size="sm" onClick={onRestart}>
              Try another scenario
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <Button
              size="lg"
              variant={recording ? "destructive" : "default"}
              disabled={busy}
              onClick={onMicTap}
              className="h-14 w-14 rounded-full p-0"
              aria-label={recording ? "Stop & send" : "Tap to speak"}
            >
              {recording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>
          </div>
        )}
        <p className="text-center text-[11px] text-muted-foreground">
          {busy
            ? "Analysing…"
            : recording
              ? "Tap mic to stop & send"
              : aiSpeaking
                ? "AI speaking · tap mic to interrupt"
                : "Tap mic, speak, then tap again"}
        </p>
      </CardContent>
    </Card>
  );
}

/* ───────────────────── Checklist ───────────────────── */

function ChecklistPanel({ targets, usedIds }: { targets: TargetSentence[]; usedIds: Set<string> }) {
  const used = targets.filter((t) => usedIds.has(t.id));
  const unused = targets.filter((t) => !usedIds.has(t.id));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <Lightbulb className="h-3.5 w-3.5" /> Target sentences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <ScrollArea className="h-[420px] pr-2">
          <ul className="space-y-1.5">
            {used.map((t) => (
              <li
                key={t.id}
                className="flex items-start gap-1.5 rounded-md bg-primary/10 px-2 py-1.5 text-xs"
              >
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                <span className="leading-snug line-through opacity-70">{t.english}</span>
              </li>
            ))}
            {unused.map((t) => (
              <li
                key={t.id}
                className="flex items-start gap-1.5 rounded-md bg-muted/30 px-2 py-1.5 text-xs"
              >
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full border" />
                <span className="leading-snug">{t.english}</span>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

/* ───────────────────── Save sentence dialog ───────────────────── */

function SaveSentenceDialog({
  open,
  msg,
  onClose,
  onConfirm,
}: {
  open: boolean;
  msg: ChatMsg | null;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) setNote("");
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save this sentence?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="rounded-md border bg-muted/30 p-2 text-sm italic">{msg?.content}</p>
          {msg?.grammar_markers && msg.grammar_markers.length > 0 && (
            <div className="space-y-0.5 text-[11px] text-muted-foreground">
              {msg.grammar_markers.map((g, i) => (
                <p key={i}>
                  <span className="line-through">{g.span}</span>
                  {" → "}
                  <span className="font-medium text-foreground">{g.correction}</span>
                </p>
              ))}
            </div>
          )}
          <Textarea
            placeholder="Add a note (why is it useful?)…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(note)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────── History dialog ───────────────────── */

interface SessionRow {
  id: string;
  category_label: string | null;
  scenarios: Scenario[];
  chosen_index: number | null;
  user_role: string | null;
  ai_role: string | null;
  messages: ChatMsg[];
  used_sentence_ids: string[];
  is_complete: boolean;
  completion_reason: string | null;
  created_at: string;
}

function HistoryDialog({
  open,
  onClose,
  onResume,
}: {
  open: boolean;
  onClose: () => void;
  onResume: (s: SessionRow) => void;
}) {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  useEffect(() => {
    if (!open) return;
    void (async () => {
      const { data } = await supabase
        .from("scenario_sessions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      setRows((data as any) ?? []);
    })();
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Past scenarios</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[400px] pr-2">
          {!rows ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No saved sessions yet.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((s) => {
                const sc = s.chosen_index != null ? s.scenarios?.[s.chosen_index] : null;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => onResume(s)}
                      className="w-full rounded-md border bg-card p-2.5 text-left transition-colors hover:border-primary/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">
                          {sc?.title_en ?? "(scenario not chosen)"}
                        </p>
                        <Badge
                          variant={s.is_complete ? "default" : "secondary"}
                          className="shrink-0 text-[9px]"
                        >
                          {s.is_complete ? "done" : `${s.messages?.length ?? 0} msgs`}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {s.category_label ?? "—"} · {new Date(s.created_at).toLocaleDateString()}
                        {s.user_role && ` · ${s.user_role}↔${s.ai_role}`}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
