import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  const supabaseUrl = Deno.env.get('BASE_URL')!;
  const serviceRoleKey = Deno.env.get('BASE_SERVICE_ROLE_KEY')!;
  const appId = Deno.env.get('META_APP_ID')!;
  const appSecret = Deno.env.get('META_APP_SECRET')!;
  const redirectUri = `${supabaseUrl}/functions/v1/meta-oauth-callback`;

  // Determine the frontend base URL (strip /functions suffix if present)
  const frontendUrl = supabaseUrl.replace(/\/functions.*$/, '');

  if (errorParam) {
    return Response.redirect(`${frontendUrl}/metrics?meta_error=${encodeURIComponent(errorParam)}`);
  }

  if (!code || !stateParam) {
    return Response.redirect(`${frontendUrl}/metrics?meta_error=missing_params`);
  }

  // Decode state to get user_id
  let userId: string;
  try {
    const decoded = JSON.parse(atob(stateParam));
    userId = decoded.user_id;
    if (!userId) throw new Error('No user_id in state');
  } catch {
    return Response.redirect(`${frontendUrl}/metrics?meta_error=invalid_state`);
  }

  try {
    // Exchange code for long-lived token
    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?${tokenParams.toString()}`
    );
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[meta-oauth-callback] Token exchange failed:', tokenData);
      return Response.redirect(`${frontendUrl}/metrics?meta_error=token_exchange_failed`);
    }

    // Exchange for long-lived token (60 days)
    const longLivedParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: tokenData.access_token,
    });

    const longLivedRes = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?${longLivedParams.toString()}`
    );
    const longLivedData = await longLivedRes.json();
    const accessToken = longLivedData.access_token ?? tokenData.access_token;
    const expiresIn: number = longLivedData.expires_in ?? tokenData.expires_in ?? 0;
    const tokenExpiry = expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    // Fetch ad accounts for this user
    const accountsRes = await fetch(
      `https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name&access_token=${accessToken}`
    );
    const accountsData = await accountsRes.json();

    // Use the first ad account
    const firstAccount = accountsData?.data?.[0];
    const accountId: string = firstAccount?.id ?? '';
    const accountName: string = firstAccount?.name ?? '';

    // Upsert connection into Supabase
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { error: upsertError } = await supabase
      .from('meta_connections')
      .upsert(
        {
          user_id: userId,
          account_id: accountId,
          account_name: accountName,
          access_token: accessToken,
          token_expiry: tokenExpiry,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (upsertError) {
      console.error('[meta-oauth-callback] Upsert failed:', upsertError);
      return Response.redirect(`${frontendUrl}/metrics?meta_error=db_error`);
    }

    return Response.redirect(`${frontendUrl}/metrics?meta_success=true`);
  } catch (err) {
    console.error('[meta-oauth-callback] Unexpected error:', err);
    return Response.redirect(`${frontendUrl}/metrics?meta_error=server_error`);
  }
});
