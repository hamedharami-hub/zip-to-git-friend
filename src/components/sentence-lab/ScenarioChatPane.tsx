import {
  Mic,
  Square,
  Loader2,
  ArrowLeftRight,
  Bookmark,
  BookmarkCheck,
  RefreshCw,
  Trophy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { BidiText } from "@/components/BidiText";
import type { ScenarioChatPaneProps } from "./scenarioTypes";

export function ScenarioChatPane({
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
}: ScenarioChatPaneProps) {
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
                  <BidiText className="whitespace-pre-wrap">{m.content}</BidiText>

                  {m.grammar_markers && m.grammar_markers.length > 0 && (
                    <div className="mt-1.5 space-y-0.5 border-t border-border/30 pt-1.5">
                      {m.grammar_markers.slice(0, 4).map((g, idx) => (
                        <BidiText key={idx} as="p" className="text-[10px] opacity-80">
                          <span className="line-through">{g.span}</span>
                          {" → "}
                          <span className="font-medium">{g.correction}</span>
                          {g.rule_label && (
                            <span className="ml-1 opacity-60">· {g.rule_label}</span>
                          )}
                        </BidiText>
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
                  <BidiText as="span">{interim}…</BidiText>
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
