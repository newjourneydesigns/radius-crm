-- Storage bucket for images embedded in toolkit content (Resources pages,
-- Pro Tips write-ups). Public read — leaders view images without auth — while
-- uploads go only through the admin API (/api/admin/resource-images) using the
-- service role, so no storage RLS policies are needed for writes.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resource-images',
  'resource-images',
  true,
  5242880, -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
