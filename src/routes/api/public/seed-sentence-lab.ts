import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SENTENCE_BACKUP } from "@/data/sentenceLabSeed";

// ⚠️ Destructive endpoint — overwrites sentence_categories / sentence_paths / sentence_lab
// via upsert(onConflict: id). Disabled by default. To re-enable for a one-off run,
// set the SEED_SENTENCE_LAB_TOKEN secret and POST with header `x-seed-token: <token>`.
export const Route = createFileRoute("/api/public/seed-sentence-lab")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.SEED_SENTENCE_LAB_TOKEN;
        const provided = request.headers.get("x-seed-token");
        if (!token || !provided || provided !== token) {
          return new Response(
            JSON.stringify({
              error:
                "Seed endpoint is disabled. Set SEED_SENTENCE_LAB_TOKEN secret and pass matching x-seed-token header to enable.",
            }),
            { status: 403, headers: { "Content-Type": "application/json" } },
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
        const data = SENTENCE_BACKUP as any;
        const results = { categories: 0, paths: 0, sentences: 0, errors: [] as string[] };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
        const cats = data.categories.map((c: any) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          description: c.description,
          icon: c.icon,
          color: c.color,
          parent_id: c.parent_id,
          sort_order: c.sort_order,
          created_by: null,
          is_default: true,
          domain: c.domain ?? "general",
          created_at: c.created_at,
          updated_at: c.updated_at,
        }));
        for (let i = 0; i < cats.length; i += 200) {
          const { error } = await supabaseAdmin
            .from("sentence_categories")
            .upsert(cats.slice(i, i + 200), { onConflict: "id" });
          if (error) results.errors.push(`cats[${i}]: ${error.message}`);
          else results.categories += Math.min(200, cats.length - i);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
        const paths = data.paths.map((p: any) => ({
          id: p.id,
          user_id: null,
          name: p.name,
          description: p.description,
          icon: p.icon,
          color: p.color,
          domain: p.domain ?? "general",
          is_builtin: true,
          recipe: p.recipe,
          sort_order: p.sort_order,
          created_at: p.created_at,
          updated_at: p.updated_at,
        }));
        const { error: pErr } = await supabaseAdmin
          .from("sentence_paths")
          .upsert(paths, { onConflict: "id" });
        if (pErr) results.errors.push(`paths: ${pErr.message}`);
        else results.paths = paths.length;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external/dynamic data shape
        const sents = data.sentences.map((s: any) => ({
          id: s.id,
          status: s.status ?? "published",
          category: s.category,
          subcategory: s.subcategory,
          cefr_level: s.cefr_level,
          english: s.english,
          persian: s.persian,
          english_aussie: s.english_aussie,
          exam_task_type: s.exam_task_type,
          expected_duration_seconds: s.expected_duration_seconds,
          expected_intent: s.expected_intent,
          ai_counter_prompt: s.ai_counter_prompt,
          grammar_focus: s.grammar_focus ?? [],
          vocabulary_tags: s.vocabulary_tags ?? [],
          common_mistakes: s.common_mistakes ?? [],
          audio_url: s.audio_url,
          created_by: null,
          created_at: s.created_at,
          updated_at: s.updated_at,
          difficulty_score: s.difficulty_score,
          variations: s.variations ?? [],
          cultural_note: s.cultural_note,
        }));
        for (let i = 0; i < sents.length; i += 200) {
          const { error } = await supabaseAdmin
            .from("sentence_lab")
            .upsert(sents.slice(i, i + 200), { onConflict: "id" });
          if (error) results.errors.push(`sents[${i}]: ${error.message}`);
          else results.sentences += Math.min(200, sents.length - i);
        }

        return new Response(JSON.stringify(results), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
