-- Circle Leader Toolkit — multi-page Resources.
--
-- Replaces the single Resources HTML doc per audience (circle_leader_resources)
-- with an ordered set of titled pages per audience. Pages appear as tabs on the
-- toolkit Resources page and in a dropdown under the Resources tab in the main
-- nav; sort_order controls the nav order and prev/next chaining.
--
-- The legacy circle_leader_resources table is kept as-is (not dropped) so this
-- migration is safely reversible; the app reads/writes the new table and falls
-- back to the legacy doc only when an audience has no pages yet.

CREATE TABLE IF NOT EXISTS circle_leader_resource_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience TEXT NOT NULL DEFAULT 'circle'
    CHECK (audience IN ('circle', 'host_team')),
  title TEXT NOT NULL,
  -- URL-safe identifier used in leader-facing links (/resources/<slug>).
  -- Stable across renames so shared links keep working.
  slug TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (audience, slug)
);

CREATE INDEX IF NOT EXISTS circle_leader_resource_pages_order_idx
  ON circle_leader_resource_pages (audience, sort_order);

-- Service-role only (all access goes through admin/leader API routes); RLS on
-- with no policies denies anon/authenticated clients by default.
ALTER TABLE circle_leader_resource_pages ENABLE ROW LEVEL SECURITY;

-- Seed each audience's first page from its legacy single doc so existing
-- content shows up unchanged. The admin API also does this lazily, so deploy
-- order (app vs migration) doesn't matter.
INSERT INTO circle_leader_resource_pages
  (audience, title, slug, body_html, sort_order, updated_at, updated_by)
SELECT r.audience, 'Resources', 'resources', r.body_html, 0,
       COALESCE(r.updated_at, now()), r.updated_by
FROM circle_leader_resources r
WHERE COALESCE(r.body_html, '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM circle_leader_resource_pages p WHERE p.audience = r.audience
  );
