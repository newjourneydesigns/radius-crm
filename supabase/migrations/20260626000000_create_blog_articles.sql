-- ============================================================================
-- Radius Blog Articles
--
-- Internal blog/video library for the team. Each article has a title,
-- rich-text description (HTML from TipTap), optional YouTube URL, slug for
-- individual URLs, published flag, and two date stamps (posted_at visible
-- to readers, updated_at tracks last edit).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.blog_articles (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  title       text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  youtube_url text,
  slug        text        NOT NULL,
  published   boolean     NOT NULL DEFAULT true,
  posted_at   date        NOT NULL DEFAULT CURRENT_DATE,
  created_by  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS blog_articles_posted_at_idx
  ON public.blog_articles (posted_at DESC);

CREATE INDEX IF NOT EXISTS blog_articles_slug_idx
  ON public.blog_articles (slug);

ALTER TABLE public.blog_articles ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read published articles
CREATE POLICY "Authenticated users can read published blog articles"
  ON public.blog_articles FOR SELECT TO authenticated
  USING (published = true);
