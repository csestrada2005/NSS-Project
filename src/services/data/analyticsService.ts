import { SupabaseService } from '../SupabaseService';

const supabase = SupabaseService.getInstance().client;

export interface AnalyticsConnection {
  id: string;
  user_id: string;
  property_id: string;
  property_name?: string;
  created_at: string;
}

export interface GADailyRow {
  date: string;
  sessions: number;
  users: number;
  bounceRate: number;
  avgSessionDuration: number;
  conversions: number;
  revenue: number;
}

export const getAnalyticsConnection = async (userId: string): Promise<AnalyticsConnection | null> => {
  const { data, error } = await supabase
    .from('analytics_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[analyticsService] Error fetching analytics connection:', error);
    return null;
  }
  return data as AnalyticsConnection | null;
};

export const disconnectAnalytics = async (userId: string): Promise<void> => {
  const { error } = await supabase
    .from('analytics_connections')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('[analyticsService] Error disconnecting analytics:', error);
    throw error;
  }
};

export const initiateGAOAuth = async (userId: string): Promise<void> => {
  const { data, error } = await supabase.functions.invoke('ga-oauth-init', {
    body: { user_id: userId },
  });

  if (error) {
    console.error('[analyticsService] Error initiating GA OAuth:', error);
    throw error;
  }

  if (data?.url) {
    window.location.href = data.url;
  } else {
    throw new Error('No redirect URL returned from ga-oauth-init');
  }
};

export const fetchGAData = async (
  userId: string,
  startDate: string,
  endDate: string
): Promise<unknown> => {
  const { data, error } = await supabase.functions.invoke('ga-data', {
    body: { user_id: userId, start_date: startDate, end_date: endDate },
  });

  if (error) {
    console.error('[analyticsService] Error fetching GA data:', error);
    throw error;
  }

  return data;
};

export const parseGAData = (gaResponse: unknown): GADailyRow[] => {
  if (!gaResponse || typeof gaResponse !== 'object') return [];

  const response = gaResponse as {
    rows?: Array<{
      dimensionValues?: Array<{ value?: string }>;
      metricValues?: Array<{ value?: string }>;
    }>;
    dimensionHeaders?: Array<{ name?: string }>;
    metricHeaders?: Array<{ name?: string }>;
  };

  const rows = response.rows;
  if (!Array.isArray(rows) || rows.length === 0) return [];

  return rows.map((row) => {
    const dims = row.dimensionValues ?? [];
    const metrics = row.metricValues ?? [];

    // date dimension is expected as first dimension in YYYYMMDD format
    const rawDate = dims[0]?.value ?? '';
    const date = rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate;

    const parseNum = (idx: number) => parseFloat(metrics[idx]?.value ?? '0') || 0;

    return {
      date,
      sessions: Math.round(parseNum(0)),
      users: Math.round(parseNum(1)),
      bounceRate: parseNum(2) * 100,      // GA4 returns decimal, convert to %
      avgSessionDuration: parseNum(3),    // seconds
      conversions: Math.round(parseNum(4)),
      revenue: parseNum(5),
    };
  });
};
