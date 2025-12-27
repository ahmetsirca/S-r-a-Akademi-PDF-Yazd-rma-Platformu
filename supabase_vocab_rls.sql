-- Enable RLS for Vocabulary Tables
alter table vocab_notebooks enable row level security;
alter table vocab_words enable row level security;
alter table vocab_stories enable row level security;

-- Policies for Notebooks
create policy "Users can view their own notebooks"
  on vocab_notebooks for select
  using (auth.uid() = user_id);

create policy "Users can insert their own notebooks"
  on vocab_notebooks for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own notebooks"
  on vocab_notebooks for update
  using (auth.uid() = user_id);

create policy "Users can delete their own notebooks"
  on vocab_notebooks for delete
  using (auth.uid() = user_id);

-- Policies for Words (Linked via notebook_id)
create policy "Users can view words in their notebooks"
  on vocab_words for select
  using (
    exists (select 1 from vocab_notebooks where id = vocab_words.notebook_id and user_id = auth.uid())
  );

create policy "Users can insert words into their notebooks"
  on vocab_words for insert
  with check (
    exists (select 1 from vocab_notebooks where id = vocab_words.notebook_id and user_id = auth.uid())
  );

create policy "Users can update words in their notebooks"
  on vocab_words for update
  using (
    exists (select 1 from vocab_notebooks where id = vocab_words.notebook_id and user_id = auth.uid())
  );

create policy "Users can delete words in their notebooks"
  on vocab_words for delete
  using (
    exists (select 1 from vocab_notebooks where id = vocab_words.notebook_id and user_id = auth.uid())
  );

-- Policies for Stories (Linked via notebook_id)
create policy "Users can view stories in their notebooks"
  on vocab_stories for select
  using (
    exists (select 1 from vocab_notebooks where id = vocab_stories.notebook_id and user_id = auth.uid())
  );

create policy "Users can insert stories into their notebooks"
  on vocab_stories for insert
  with check (
    exists (select 1 from vocab_notebooks where id = vocab_stories.notebook_id and user_id = auth.uid())
  );

create policy "Users can update stories in their notebooks"
  on vocab_stories for update
  using (
    exists (select 1 from vocab_notebooks where id = vocab_stories.notebook_id and user_id = auth.uid())
  );

create policy "Users can delete stories in their notebooks"
  on vocab_stories for delete
  using (
    exists (select 1 from vocab_notebooks where id = vocab_stories.notebook_id and user_id = auth.uid())
  );
