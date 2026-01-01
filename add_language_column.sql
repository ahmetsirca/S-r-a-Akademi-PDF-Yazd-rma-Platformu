-- Add language column to vocab_words table
ALTER TABLE vocab_words 
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';

-- Optionally update existing rows to 'en' (or leave as default)
UPDATE vocab_words SET language = 'en' WHERE language IS NULL;

-- Enable RLS if not enabled (safety check)
ALTER TABLE vocab_words ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to see their own notebook words (already likely exists but ensuring)
CREATE POLICY "Users can view their own notebook words" ON vocab_words
    FOR SELECT USING (
        notebook_id IN (
            SELECT id FROM vocab_notebooks WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert words into their own notebooks" ON vocab_words
    FOR INSERT WITH CHECK (
        notebook_id IN (
            SELECT id FROM vocab_notebooks WHERE user_id = auth.uid()
        )
    );
