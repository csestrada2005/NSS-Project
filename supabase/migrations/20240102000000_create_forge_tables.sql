-- Create forge_projects table
CREATE TABLE IF NOT EXISTS forge_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create forge_snapshots table
CREATE TABLE IF NOT EXISTS forge_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES forge_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label text,
  file_tree jsonb NOT NULL,
  trigger text NOT NULL DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS forge_snapshots_project_id_idx ON forge_snapshots(project_id);
CREATE INDEX IF NOT EXISTS forge_snapshots_project_created_idx ON forge_snapshots(project_id, created_at DESC);

-- RLS
ALTER TABLE forge_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner" ON forge_projects FOR ALL USING (auth.uid() = user_id);

ALTER TABLE forge_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner" ON forge_snapshots FOR ALL USING (auth.uid() = user_id);

-- Function to cap snapshots at 50 per project
CREATE OR REPLACE FUNCTION cap_forge_snapshots()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM forge_snapshots
  WHERE id IN (
    SELECT id FROM forge_snapshots
    WHERE project_id = NEW.project_id
    ORDER BY created_at DESC
    OFFSET 50
  );
  RETURN NEW;
END;
$$;

-- Trigger to cap snapshots after insert
DROP TRIGGER IF EXISTS cap_snapshots_trigger ON forge_snapshots;
CREATE TRIGGER cap_snapshots_trigger
  AFTER INSERT ON forge_snapshots
  FOR EACH ROW EXECUTE FUNCTION cap_forge_snapshots();
