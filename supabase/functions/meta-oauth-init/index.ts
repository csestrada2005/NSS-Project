import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const appId = Deno.env.get('META_APP_ID')!;
    const baseUrl = Deno.env.get('BASE_URL')!;
    const redirectUri = `${baseUrl}/functions/v1/meta-oauth-callback`;

    // Encode user_id in state for callback verification
    const state = btoa(JSON.stringify({ user_id }));

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: 'ads_read,read_insights',
      response_type: 'code',
      state,
    });

    const url = `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;

    return new Response(JSON.stringify({ url }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[meta-oauth-init]', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
