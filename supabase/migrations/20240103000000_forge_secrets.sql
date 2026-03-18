CREATE TABLE IF NOT EXISTS forge_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES forge_projects(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, key)
);

ALTER TABLE forge_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner" ON forge_secrets FOR ALL USING (
  auth.uid() = (SELECT user_id FROM forge_projects WHERE id = project_id)
);
