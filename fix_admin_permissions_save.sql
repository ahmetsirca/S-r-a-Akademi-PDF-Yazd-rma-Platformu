-- FIX ADMIN PERMISSIONS SAVE ERROR
-- This script fixes the "duplicate key" or "upsert" error when saving permissions.
-- It ensures each user has ONLY ONE permissions row.

-- 1. Deduplicate: Remove older duplicate rows, keeping only the most recent one for each user.
DELETE FROM public.user_permissions
WHERE id NOT IN (
    SELECT DISTINCT ON (user_id) id
    FROM public.user_permissions
    ORDER BY user_id, created_at DESC
);

-- 2. Add Constraint: Ensure 'user_id' is unique so UPSERT works correctly.
-- We use a DO block to avoid error if constraint already exists.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_permissions_user_id_key'
    ) THEN
        ALTER TABLE public.user_permissions
        ADD CONSTRAINT user_permissions_user_id_key UNIQUE (user_id);
    END IF;
END $$;

-- 3. Verify RLS (Just in case)
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_permissions' AND policyname = 'Public Access Permissions') THEN
        CREATE POLICY "Public Access Permissions" ON public.user_permissions FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
