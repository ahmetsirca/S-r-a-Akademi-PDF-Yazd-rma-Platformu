
-- Books Table (Existing, for reference)
create table if not exists books (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  pdf_url text not null,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Access Keys Table (Existing)
create table if not exists access_keys (
  id uuid default uuid_generate_v4() primary key,
  book_id uuid references books(id) on delete cascade,
  key_code text unique not null,
  note text,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- NEW: Folders Table for "Derslerim"
create table if not exists folders (
  id uuid default uuid_generate_v4() primary key,
  parent_id uuid references folders(id) on delete cascade, -- Support for nested folders
  title text not null,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- NEW: Folder Content Table (PDFs and Links inside folders)
create table if not exists folder_content (
  id uuid default uuid_generate_v4() primary key,
  folder_id uuid references folders(id) on delete cascade,
  type text not null check (type in ('pdf', 'link')),
  title text not null,
  url text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- NEW: Folder Access Keys (Specific passwords for folders)
create table if not exists folder_keys (
  id uuid default uuid_generate_v4() primary key,
  folder_ids uuid[] not null, -- Array of folder IDs this key unlocks
  key_code text unique not null,
  note text, -- e.g. Student Name
  expires_at timestamp with time zone, -- Optional expiration
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
