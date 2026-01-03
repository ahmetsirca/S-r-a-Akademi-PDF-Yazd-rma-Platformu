-- GLOBAL ACCESS RESTORATION SCRIPT
-- This script opens the application to ALL devices by allowing public access to tables.
-- It works by adding "Policies" that say "Everyone (anon) is allowed to View/Edit".
-- IT DOES NOT DELETE ANY DATA. IT ONLY ADDS PERMISSIONS.

-- 1. Enable RLS on all tables (ensure it's on so we can control it)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folder_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folder_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocab_notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocab_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocab_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- 2. Create "Public Access" Policies
-- We use DO blocks to avoid errors if policies already exist.

DO $$
BEGIN

    -- PROFILES (Login/Register needs Select/Insert/Update)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Public Access Profiles') THEN
        CREATE POLICY "Public Access Profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- DEVICES (IP Tracking needs Select/Insert/Update)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_devices' AND policyname = 'Public Access Devices') THEN
        CREATE POLICY "Public Access Devices" ON public.user_devices FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- PERMISSIONS (Checking access needs Select/Insert/Update)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_permissions' AND policyname = 'Public Access Permissions') THEN
        CREATE POLICY "Public Access Permissions" ON public.user_permissions FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- FOLDERS & CONTENT (Passive Viewers need Select)
    -- We allow ALL operations just in case admin panel uses same anon client
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'folders' AND policyname = 'Public Access Folders') THEN
        CREATE POLICY "Public Access Folders" ON public.folders FOR ALL USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'folder_content' AND policyname = 'Public Access Content') THEN
        CREATE POLICY "Public Access Content" ON public.folder_content FOR ALL USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'folder_keys' AND policyname = 'Public Access Folder Keys') THEN
        CREATE POLICY "Public Access Folder Keys" ON public.folder_keys FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- LEGACY BOOKS (PDF Viewer needs Select)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pdf_books' AND policyname = 'Public Access Books') THEN
        CREATE POLICY "Public Access Books" ON public.pdf_books FOR ALL USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'collections' AND policyname = 'Public Access Collections') THEN
        CREATE POLICY "Public Access Collections" ON public.collections FOR ALL USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'access_keys' AND policyname = 'Public Access Access Keys') THEN
        CREATE POLICY "Public Access Access Keys" ON public.access_keys FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- VOCABULARY (Notebooks need Select/Insert/Update/Delete for the user)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vocab_notebooks' AND policyname = 'Public Access Notebooks') THEN
        CREATE POLICY "Public Access Notebooks" ON public.vocab_notebooks FOR ALL USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vocab_words' AND policyname = 'Public Access Words') THEN
        CREATE POLICY "Public Access Words" ON public.vocab_words FOR ALL USING (true) WITH CHECK (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vocab_stories' AND policyname = 'Public Access Stories') THEN
        CREATE POLICY "Public Access Stories" ON public.vocab_stories FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- LOGS
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_logs' AND policyname = 'Public Access Logs') THEN
        CREATE POLICY "Public Access Logs" ON public.activity_logs FOR ALL USING (true) WITH CHECK (true);
    END IF;

END $$;
