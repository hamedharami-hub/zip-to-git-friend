-- ============================================================
-- BOOKS
-- ============================================================
CREATE TABLE public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Stable client-generated id so the local IndexedDB row and the cloud row stay in sync.
  client_id TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  language TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size BIGINT,
  chapter_count INTEGER NOT NULL DEFAULT 0,
  word_count INTEGER NOT NULL DEFAULT 0,
  last_chapter_index INTEGER NOT NULL DEFAULT 0,
  last_scroll_ratio DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_read_seconds INTEGER NOT NULL DEFAULT 0,
  cover_url TEXT,
  -- Path inside the `book-files` bucket — typically `${user_id}/${client_id}.epub`.
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);

CREATE INDEX books_user_id_idx ON public.books(user_id);
CREATE INDEX books_updated_at_idx ON public.books(updated_at DESC);

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own books"
  ON public.books FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own books"
  ON public.books FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own books"
  ON public.books FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own books"
  ON public.books FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER books_set_updated_at
  BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- BOOK CHAPTERS
-- ============================================================
CREATE TABLE public.book_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  title TEXT,
  html TEXT NOT NULL,
  text TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (book_id, chapter_index)
);

CREATE INDEX book_chapters_book_idx ON public.book_chapters(book_id, chapter_index);
CREATE INDEX book_chapters_user_idx ON public.book_chapters(user_id);

ALTER TABLE public.book_chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chapters"
  ON public.book_chapters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chapters"
  ON public.book_chapters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chapters"
  ON public.book_chapters FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own chapters"
  ON public.book_chapters FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER book_chapters_set_updated_at
  BEFORE UPDATE ON public.book_chapters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- STORAGE BUCKET — original EPUB files
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-files', 'book-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: each user can only access objects under their own user_id folder.
CREATE POLICY "Users can read own book files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'book-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can upload own book files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'book-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own book files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'book-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own book files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'book-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );