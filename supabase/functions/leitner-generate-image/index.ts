// Generate an illustration for a Leitner card via Lovable AI Gateway
// (Nano Banana 2 - Gemini 3.1 flash image preview), upload it to the
// `leitner-images` bucket under the user's folder, return the public URL.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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

    const authHeader = req.headers.get('Authorization') || '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { word, example, cardId } = await req.json();
    if (!word || typeof word !== 'string') {
      return new Response(JSON.stringify({ error: 'word required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = `Create a clean, memorable illustration that captures the meaning of the English word or phrase: "${word}". ${
      example ? `Context sentence: "${example}".` : ''
    } Style: minimalist, vibrant colors, no text, no watermark, square composition, suitable as a flashcard image.`;

    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.1-flash-image-preview',
        messages: [{ role: 'user', content: prompt }],
        modalities: ['image', 'text'],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error('AI gateway error', r.status, t);
      if (r.status === 429) {
        return new Response(JSON.stringify({ error: 'rate_limit' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (r.status === 402) {
        return new Response(JSON.stringify({ error: 'payment_required' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error('AI image generation failed');
    }

    const data = await r.json();
    const dataUrl: string | undefined =
      data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl?.startsWith('data:image/')) {
      throw new Error('No image returned');
    }

    // Decode base64 → bytes
    const [meta, b64] = dataUrl.split(',');
    const mime = meta.match(/data:([^;]+);base64/)?.[1] ?? 'image/png';
    const ext = mime.split('/')[1] || 'png';
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    const path = `${userId}/${cardId || crypto.randomUUID()}-${Date.now()}.${ext}`;
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { error: upErr } = await admin.storage
      .from('leitner-images')
      .upload(path, bytes, { contentType: mime, upsert: true });
    if (upErr) throw upErr;
    // Bucket is private; return a long-lived signed URL (1 year).
    const { data: signed, error: signErr } = await admin.storage
      .from('leitner-images')
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signErr) throw signErr;

    return new Response(JSON.stringify({ imageUrl: signed.signedUrl }), {
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
