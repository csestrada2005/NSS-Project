import { USE_MOCK_DATA } from '../../config';
import * as mockData from './mockData';
import * as supabaseData from './supabaseData';
import type { Item, Profile } from '../../types';

export const fetchItems = async (): Promise<Item[]> => {
  return USE_MOCK_DATA ? mockData.fetchItems() : supabaseData.fetchItems();
};

export const fetchProfile = async (id: string): Promise<Profile | null> => {
  return USE_MOCK_DATA ? mockData.fetchProfile(id) : supabaseData.fetchProfile(id);
};
