-- ============================================
-- Step 8: Add reply votes (upvotes/downvotes)
-- ============================================

CREATE TABLE IF NOT EXISTS public.reply_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reply_id UUID NOT NULL REFERENCES public.replies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote SMALLINT NOT NULL CHECK (vote IN (1, -1)),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(reply_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reply_votes_reply_id ON public.reply_votes(reply_id);
CREATE INDEX IF NOT EXISTS idx_reply_votes_user_id ON public.reply_votes(user_id);

-- RLS
ALTER TABLE public.reply_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reply votes" ON public.reply_votes
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert votes" ON public.reply_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own votes" ON public.reply_votes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own votes" ON public.reply_votes
  FOR DELETE USING (auth.uid() = user_id);

SELECT 'Step 8 Complete: reply_votes table created' as status;
