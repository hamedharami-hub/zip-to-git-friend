// Generate example sentences and definition for a Leitner card via Lovable AI.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY missing');

    const { word, existingExample, mode } = await req.json();
    if (!word) {
      return new Response(JSON.stringify({ error: 'word required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const m = mode === 'definition' ? 'definition' : 'examples';
    const userPrompt = m === 'examples'
      ? `Generate 3 short, natural English example sentences using the word/phrase: "${word}".${
        existingExample ? `\nThe original context was: "${existingExample}". Vary your examples beyond this context.` : ''
      }\nKeep each sentence under 15 words. Return ONLY a JSON array of 3 strings.`
      : `Provide a concise English definition (1-2 sentences) of the word/phrase: "${word}". Then a short Persian translation. Return JSON: {"definition": "...", "persian": "..."}`;

    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You are an English language teaching assistant. Always respond with valid JSON only — no markdown, no commentary.' },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error('AI error', r.status, t);
      if (r.status === 429) return new Response(JSON.stringify({ error: 'rate_limit' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (r.status === 402) return new Response(JSON.stringify({ error: 'payment_required' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      throw new Error('AI request failed');
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // strip ```json fences if model added them
      const cleaned = content.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    return new Response(JSON.stringify({ result: parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
