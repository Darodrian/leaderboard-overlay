const ALLOWED_ORIGINS = (Deno.env.get('CORS_ORIGINS') || '*').split(',').map(s => s.trim())

function corsOrigin(origin) {
  if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) return origin || '*'
  return ALLOWED_ORIGINS[0] || '*'
}

function corsHeaders(origin) {
  const o = corsOrigin(origin)
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-chat-bot-secret',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

export async function handler(request) {
  const origin = request.headers.get('origin') || '*'
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  return new Response(
    JSON.stringify({ status: 'ok' }),
    { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
  );
}
