-- Add screenshot_url column to board_cards
ALTER TABLE board_cards ADD COLUMN IF NOT EXISTS screenshot_url text;

-- Create the card-screenshots storage bucket (public so URLs don't expire)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'card-screenshots',
  'card-screenshots',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
) ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload, read, update, and delete their screenshots
DROP POLICY IF EXISTS "auth_insert_card_screenshots" ON storage.objects;
CREATE POLICY "auth_insert_card_screenshots"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'card-screenshots');

DROP POLICY IF EXISTS "auth_select_card_screenshots" ON storage.objects;
CREATE POLICY "auth_select_card_screenshots"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'card-screenshots');

DROP POLICY IF EXISTS "auth_update_card_screenshots" ON storage.objects;
CREATE POLICY "auth_update_card_screenshots"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'card-screenshots');

DROP POLICY IF EXISTS "auth_delete_card_screenshots" ON storage.objects;
CREATE POLICY "auth_delete_card_screenshots"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'card-screenshots');
