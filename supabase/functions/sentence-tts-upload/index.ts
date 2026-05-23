// Upload pre-generated WAV audio to the public `sentence-audio` bucket.
// Body: multipart/form-data with fields: sentenceId, lang, file (audio/wav)
// Response: { url: string, cached: boolean }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKET = 'sentence-audio';

function safe(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function publicUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'Expected multipart/form-data' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const sentenceId = String(form.get('sentenceId') ?? '');
  const lang = String(form.get('lang') ?? '');
  const file = form.get('file');

  if (!sentenceId || !lang || !(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'sentenceId, lang and file are required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const path = `${safe(sentenceId)}_${safe(lang)}.wav`;

  // Cache check: if file already exists, skip upload
  const head = await fetch(publicUrl(SUPABASE_URL, path), { method: 'HEAD' });
  if (head.ok) {
    return new Response(
      JSON.stringify({ url: publicUrl(SUPABASE_URL, path), cached: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: file.type || 'audio/wav',
      upsert: true,
    });
  if (upErr) {
    console.error('[sentence-tts-upload] upload failed', upErr);
    return new Response(JSON.stringify({ error: upErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Persist canonical English URL on the catalog row (best-effort).
  if (lang === 'en') {
    await supabase
      .from('sentence_lab')
      .update({ audio_url: publicUrl(SUPABASE_URL, path) })
      .eq('id', sentenceId);
  }

  return new Response(
    JSON.stringify({ url: publicUrl(SUPABASE_URL, path), cached: false }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
