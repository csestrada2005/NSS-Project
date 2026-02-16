
// src/config.ts
export const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';
export const USE_MOCK_DATA = (import.meta as any).env.VITE_USE_MOCK_DATA === 'true';
