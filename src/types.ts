
export interface Item {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface Profile {
  id: string;
  username: string;
  avatar_url: string;
}

export interface DataInterface {
  fetchItems: () => Promise<Item[]>;
  fetchProfile: (id: string) => Promise<Profile | null>;
}
