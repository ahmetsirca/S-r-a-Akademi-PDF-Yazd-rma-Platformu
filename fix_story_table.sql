-- SAFE FIX FOR STORIES TABLE
-- This script uses "IF NOT EXISTS" to ensure it NEVER overwrites existing data.
-- It only creates the table if it is missing.

-- 1. Create table only if missing
create table if not exists vocab_stories (
    id uuid default uuid_generate_v4() primary key,
    notebook_id uuid references vocab_notebooks(id) on delete cascade not null,
    title text not null,
    content text not null,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Ensure security is disabled for compatibility with your login system
alter table vocab_stories disable row level security;

-- 3. Validation Message
select 'Story Table Verified & Access Opened' as status;
