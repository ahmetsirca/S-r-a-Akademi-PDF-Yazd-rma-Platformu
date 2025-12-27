-- COMPREHENSIVE REPAIR FOR VOCAB STORY PERMISSIONS
-- Run this entire script in Supabase SQL Editor

-- 1. Ensure UUID extension is valid
create extension if not exists "uuid-ossp";

-- 2. Create the table if it's missing (Safe to run if exists)
create table if not exists vocab_stories (
    id uuid default uuid_generate_v4() primary key,
    notebook_id uuid references vocab_notebooks(id) on delete cascade not null,
    title text not null,
    content text not null,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. DISABLE Row Level Security (RLS)
-- This allows access without complex policies
alter table vocab_stories disable row level security;
alter table vocab_notebooks disable row level security;
alter table vocab_words disable row level security;

-- 4. GRANT PERMISSIONS (Critical Step)
-- Explicitly allow the 'anon' (web user) role to read/write these tables
grant all on table vocab_stories to anon, authenticated, service_role;
grant all on table vocab_notebooks to anon, authenticated, service_role;
grant all on table vocab_words to anon, authenticated, service_role;

-- 5. CONFIRMATION
select 'Permissions Granted and RLS Disabled Successfully' as status;
