-- Create meta_connections table for storing Meta Ads OAuth tokens
CREATE TABLE IF NOT EXISTS meta_connections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  account_id  text NOT NULL,
  account_name text NOT NULL DEFAULT '',
  access_token text NOT NULL,
  token_expiry timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Unique: one connection per user
CREATE UNIQUE INDEX IF NOT EXISTS meta_connections_user_id_idx ON meta_connections(user_id);

-- Row Level Security
ALTER TABLE meta_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own connections"
  ON meta_connections
  FOR ALL
  USING (auth.uid() = user_id);
