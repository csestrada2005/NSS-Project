import { SupabaseService } from '../SupabaseService';

const supabase = SupabaseService.getInstance().client;

export interface MetaConnection {
  id: string;
  user_id: string;
  account_id: string;
  account_name: string;
  access_token: string;
  token_expiry?: string;
  created_at: string;
}

export interface MetaDailyRow {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;      // percentage (0–100)
  cpm: number;      // cost per mille, USD
  roas: number;     // return on ad spend
}

export const getMetaConnection = async (userId: string): Promise<MetaConnection | null> => {
  const { data, error } = await supabase
    .from('meta_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[metaAdsService] Error fetching meta connection:', error);
    return null;
  }
  return data as MetaConnection | null;
};

export const disconnectMeta = async (userId: string): Promise<void> => {
  const { error } = await supabase
    .from('meta_connections')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('[metaAdsService] Error disconnecting meta:', error);
    throw error;
  }
};

export const initiateMetaOAuth = async (userId: string): Promise<void> => {
  const { data, error } = await supabase.functions.invoke('meta-oauth-init', {
    body: { user_id: userId },
  });

  if (error) {
    console.error('[metaAdsService] Error initiating Meta OAuth:', error);
    throw error;
  }

  if (data?.url) {
    window.location.href = data.url;
  } else {
    throw new Error('No redirect URL returned from meta-oauth-init');
  }
};

export const fetchMetaData = async (
  userId: string,
  startDate: string,
  endDate: string
): Promise<unknown> => {
  const { data, error } = await supabase.functions.invoke('meta-data', {
    body: { user_id: userId, start_date: startDate, end_date: endDate },
  });

  if (error) {
    console.error('[metaAdsService] Error fetching Meta data:', error);
    throw error;
  }

  return data;
};

// Meta Ads Insights API returns an array of daily insight objects:
// { date_start, spend, impressions, clicks, ctr, cpm, purchase_roas }
export const parseMetaData = (metaResponse: unknown): MetaDailyRow[] => {
  if (!metaResponse || typeof metaResponse !== 'object') return [];

  const response = metaResponse as {
    data?: Array<{
      date_start?: string;
      spend?: string;
      impressions?: string;
      clicks?: string;
      ctr?: string;
      cpm?: string;
      purchase_roas?: Array<{ value?: string }>;
    }>;
  };

  const rows = response.data;
  if (!Array.isArray(rows) || rows.length === 0) return [];

  return rows.map((row) => {
    const parseNum = (v: string | undefined) => parseFloat(v ?? '0') || 0;
    // purchase_roas is an array of action objects; use first element's value
    const roasValue = Array.isArray(row.purchase_roas) && row.purchase_roas.length > 0
      ? parseFloat(row.purchase_roas[0]?.value ?? '0') || 0
      : 0;

    return {
      date: row.date_start ?? '',
      spend: parseNum(row.spend),
      impressions: Math.round(parseNum(row.impressions)),
      clicks: Math.round(parseNum(row.clicks)),
      ctr: parseNum(row.ctr),       // Meta returns CTR as percentage already (e.g. 1.23)
      cpm: parseNum(row.cpm),       // Meta returns CPM in account currency
      roas: roasValue,
    };
  });
};
