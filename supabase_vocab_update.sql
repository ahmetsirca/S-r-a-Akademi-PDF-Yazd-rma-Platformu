-- VOCABULARY NOTEBOOKS (Folders for words)
create table vocab_notebooks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  parent_id uuid references vocab_notebooks(id) on delete cascade, -- For sub-notebooks
  title text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- VOCABULARY WORDS (Replaces simple user_vocab)
create table vocab_words (
  id uuid default uuid_generate_v4() primary key,
  notebook_id uuid references vocab_notebooks(id) on delete cascade not null,
  term text not null, -- English Word
  definition text, -- Turkish Translation
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- VOCABULARY STORIES (Interactive Text)
create table vocab_stories (
  id uuid default uuid_generate_v4() primary key,
  notebook_id uuid references vocab_notebooks(id) on delete cascade not null,
  title text not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);
