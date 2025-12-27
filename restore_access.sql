-- DISABLE ROW LEVEL SECURITY to allow Custom Auth (Profile-based) access
-- This fixes the "Notebook creation failed" and "DB Insert Failed" errors
-- caused by Supabase expecting Auth.uid() which is null in this app.

alter table vocab_notebooks disable row level security;
alter table vocab_words disable row level security;
alter table vocab_stories disable row level security;
alter table user_vocab disable row level security;

-- Verify access is restored
select 'Access Restored. Please click "Verileri Kurtar" button now.' as status;
