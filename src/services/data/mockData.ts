import type { Item, Profile } from '../../types';
import data from '../../data.json';

export const fetchItems = async (): Promise<Item[]> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  return data.items as Item[];
};

export const fetchProfile = async (id: string): Promise<Profile | null> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  const profile = data.profiles.find(p => p.id === id);
  return (profile as Profile) || null;
};
