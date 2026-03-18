import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
  if (!googleApiKey) {
    return new Response(
      JSON.stringify({ error: 'Add GOOGLE_API_KEY to your Supabase project secrets.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { project_id, url, strategy = 'mobile' } = await req.json() as {
      project_id: string;
      url: string;
      strategy: 'mobile' | 'desktop';
    };

    const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&key=${googleApiKey}`;
    const res = await fetch(psiUrl);
    if (!res.ok) {
      throw new Error(`PageSpeed API returned ${res.status}`);
    }

    const data = await res.json();
    const cats = data.lighthouseResult?.categories ?? {};
    const audits = data.lighthouseResult?.audits ?? {};

    const scores = {
      perf_score: Math.round((cats.performance?.score ?? 0) * 100),
      a11y_score: Math.round((cats.accessibility?.score ?? 0) * 100),
      best_practices_score: Math.round((cats['best-practices']?.score ?? 0) * 100),
      seo_score: Math.round((cats.seo?.score ?? 0) * 100),
      lcp_ms: Math.round(audits['largest-contentful-paint']?.numericValue ?? 0),
      tbt_ms: Math.round(audits['total-blocking-time']?.numericValue ?? 0),
      cls: audits['cumulative-layout-shift']?.numericValue ?? 0,
      ttfb_ms: Math.round(audits['server-response-time']?.numericValue ?? 0),
    };

    const supabase = createClient(
      Deno.env.get('BASE_URL') ?? '',
      Deno.env.get('BASE_SERVICE_ROLE_KEY') ?? ''
    );

    const today = new Date().toISOString().slice(0, 10);

    const { data: existing } = await supabase
      .from('forge_analytics')
      .select('id')
      .eq('project_id', project_id)
      .eq('date', today)
      .single();

    if (existing) {
      await supabase.from('forge_analytics').update(scores).eq('id', existing.id);
    } else {
      await supabase.from('forge_analytics').insert({ project_id, date: today, ...scores });
    }

    return new Response(JSON.stringify(scores), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
