-- Enable public read access for Notebooks (so users can load the title)
DROP POLICY IF EXISTS "Public Read Notebooks" ON vocab_notebooks;
CREATE POLICY "Public Read Notebooks"
ON vocab_notebooks FOR SELECT
USING (true); -- Allow everyone to read notebooks

-- Enable public read access for Words (so users can see flashcards)
DROP POLICY IF EXISTS "Public Read Words" ON vocab_words;
CREATE POLICY "Public Read Words"
ON vocab_words FOR SELECT
USING (true); -- Allow everyone to read words

-- Enable public read access for Stories (Optional but consistent)
DROP POLICY IF EXISTS "Public Read Stories" ON vocab_stories;
CREATE POLICY "Public Read Stories"
ON vocab_stories FOR SELECT
USING (true);
