-- 1. Create a default "Genel (Eski)" notebook for each user who has old words
DO $$
DECLARE
  r RECORD;
  notebook_id UUID;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM user_vocab LOOP
    -- Check if they already have this notebook to avoid dups
    SELECT id INTO notebook_id FROM vocab_notebooks WHERE user_id = r.user_id AND title = 'Genel (Eski)';
    
    IF notebook_id IS NULL THEN
       INSERT INTO vocab_notebooks (user_id, title) VALUES (r.user_id, 'Genel (Eski)') RETURNING id INTO notebook_id;
    END IF;

    -- Move words
    INSERT INTO vocab_words (notebook_id, term, definition, created_at)
    SELECT notebook_id, word_en, word_tr, created_at
    FROM user_vocab
    WHERE user_id = r.user_id;
    
    -- Optional: Delete from old table after migration? 
    -- DELETE FROM user_vocab WHERE user_id = r.user_id;
  END LOOP;
END $$;
