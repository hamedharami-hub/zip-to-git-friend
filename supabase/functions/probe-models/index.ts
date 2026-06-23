Deno.serve(async () => {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  const r = await fetch('https://ai.gateway.lovable.dev/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const t = await r.text();
  return new Response(t, { status: r.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
});
