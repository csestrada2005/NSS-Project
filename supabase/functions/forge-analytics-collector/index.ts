import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('BASE_URL') ?? '',
      Deno.env.get('BASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json() as {
      project_id: string;
      event: 'pageview' | 'session_end';
      path: string;
      referrer?: string;
      session_id: string;
      duration_seconds?: number;
      is_bounce?: boolean;
    };

    const today = new Date().toISOString().slice(0, 10);

    if (body.event === 'pageview') {
      // Upsert analytics row — increment pageviews
      const { data: existing } = await supabase
        .from('forge_analytics')
        .select('id, pageviews')
        .eq('project_id', body.project_id)
        .eq('date', today)
        .single();

      if (existing) {
        await supabase
          .from('forge_analytics')
          .update({ pageviews: (existing.pageviews ?? 0) + 1 })
          .eq('id', existing.id);
      } else {
        await supabase.from('forge_analytics').insert({
          project_id: body.project_id,
          date: today,
          pageviews: 1,
        });
      }

      // Track session (insert only if not exists)
      await supabase.from('forge_sessions').upsert(
        { project_id: body.project_id, session_id: body.session_id, date: today },
        { onConflict: 'project_id,session_id', ignoreDuplicates: true }
      );

      // Update visitors count (distinct sessions for today)
      const { count } = await supabase
        .from('forge_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', body.project_id)
        .eq('date', today);

      await supabase
        .from('forge_analytics')
        .update({ visitors: count ?? 0 })
        .eq('project_id', body.project_id)
        .eq('date', today);
    }

    if (body.event === 'session_end') {
      // Update session with duration and bounce
      await supabase
        .from('forge_sessions')
        .update({
          duration_seconds: body.duration_seconds ?? 0,
          is_bounce: body.is_bounce ?? false,
        })
        .eq('project_id', body.project_id)
        .eq('session_id', body.session_id);

      // Recompute avg duration and bounce rate
      const { data: sessions } = await supabase
        .from('forge_sessions')
        .select('duration_seconds, is_bounce')
        .eq('project_id', body.project_id)
        .eq('date', today);

      if (sessions && sessions.length > 0) {
        const totalDuration = sessions.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
        const avgDuration = Math.round(totalDuration / sessions.length);
        const bounceCount = sessions.filter(s => s.is_bounce).length;
        const bounceRate = Math.round((bounceCount / sessions.length) * 100 * 100) / 100;

        await supabase
          .from('forge_analytics')
          .update({ visit_duration_seconds: avgDuration, bounce_rate: bounceRate })
          .eq('project_id', body.project_id)
          .eq('date', today);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
