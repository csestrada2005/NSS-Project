import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { user_id, start_date, end_date } = await req.json();

    if (!user_id || !start_date || !end_date) {
      return new Response(JSON.stringify({ error: 'user_id, start_date and end_date are required' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('BASE_URL')!;
    const serviceRoleKey = Deno.env.get('BASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch connection record
    const { data: conn, error: connError } = await supabase
      .from('meta_connections')
      .select('account_id, access_token')
      .eq('user_id', user_id)
      .maybeSingle();

    if (connError || !conn) {
      return new Response(JSON.stringify({ error: 'No Meta Ads connection found' }), {
        status: 404,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Fetch daily insights from Meta Marketing API
    const fields = 'spend,impressions,clicks,ctr,cpm,purchase_roas';
    const params = new URLSearchParams({
      fields,
      time_range: JSON.stringify({ since: start_date, until: end_date }),
      time_increment: '1',
      level: 'account',
      access_token: conn.access_token,
    });

    const insightsRes = await fetch(
      `https://graph.facebook.com/v18.0/${conn.account_id}/insights?${params.toString()}`
    );
    const insightsData = await insightsRes.json();

    if (!insightsRes.ok) {
      console.error('[meta-data] Insights API error:', insightsData);
      return new Response(
        JSON.stringify({ error: insightsData?.error?.message ?? 'Failed to fetch Meta insights' }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(insightsData), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[meta-data]', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
