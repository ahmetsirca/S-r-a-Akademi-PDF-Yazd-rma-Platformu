-- Create the quiz_questions table
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL, -- Array of strings ["A...", "B...", "C...", "D...", "E..."]
  correct_answer TEXT NOT NULL, -- "A", "B", "C", "D", or "E"
  explanation TEXT, -- Solution text
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

-- Allow read access to everyone (so users can take the quiz)
CREATE POLICY "Allow public read access" ON public.quiz_questions
  FOR SELECT USING (true);

-- Allow write access only to authenticated users (admins) or for now, public if simple auth used
-- Assuming we want the specific admin logic or use the same anon persistence pattern
-- For now, let's allow anon insert for the admin panel ease, or restrict later.
CREATE POLICY "Allow public insert for admin" ON public.quiz_questions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update for admin" ON public.quiz_questions
  FOR UPDATE USING (true);

CREATE POLICY "Allow public delete for admin" ON public.quiz_questions
  FOR DELETE USING (true);

-- Grant permissions
GRANT ALL ON TABLE public.quiz_questions TO anon;
GRANT ALL ON TABLE public.quiz_questions TO authenticated;
GRANT ALL ON TABLE public.quiz_questions TO service_role;
