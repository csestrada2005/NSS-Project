CREATE TABLE IF NOT EXISTS forge_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES forge_projects(id) ON DELETE CASCADE,
  date date NOT NULL,
  visitors int NOT NULL DEFAULT 0,
  pageviews int NOT NULL DEFAULT 0,
  visit_duration_seconds int NOT NULL DEFAULT 0,
  bounce_rate numeric(5,2) NOT NULL DEFAULT 0,
  perf_score int,
  a11y_score int,
  best_practices_score int,
  seo_score int,
  lcp_ms int,
  tbt_ms int,
  cls numeric(6,4),
  ttfb_ms int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, date)
);

CREATE TABLE IF NOT EXISTS forge_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES forge_projects(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  date date NOT NULL,
  duration_seconds int,
  is_bounce boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, session_id)
);

-- RLS
ALTER TABLE forge_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner" ON forge_analytics FOR ALL USING (
  auth.uid() = (SELECT user_id FROM forge_projects WHERE id = project_id)
);

ALTER TABLE forge_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner" ON forge_sessions FOR ALL USING (
  auth.uid() = (SELECT user_id FROM forge_projects WHERE id = project_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS forge_analytics_project_date_idx ON forge_analytics(project_id, date DESC);
CREATE INDEX IF NOT EXISTS forge_sessions_project_date_idx ON forge_sessions(project_id, date DESC);
